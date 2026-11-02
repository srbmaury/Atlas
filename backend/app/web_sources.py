"""Fetch and store public HTML pages as regular Atlas documents.

Security: reject local/private IPs, credentials, unsafe schemes, redirects,
large responses, and non-HTML content. Connect to a previously validated IP
address while retaining the original hostname for HTTP Host and TLS SNI, so a
second DNS lookup cannot rebind the request to a private address.
"""

from __future__ import annotations

import hashlib
import http.client
import ipaddress
import json
import re
import socket
import ssl
from html.parser import HTMLParser
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .config import DATA, MAX_FILE_BYTES
from .db import Document, Session, uid

router = APIRouter(prefix='/api')
MAX_HTML_BYTES = min(2_000_000, MAX_FILE_BYTES)
MAX_TEXT_CHARS = 500_000


class UrlRequest(BaseModel):
    url: str = Field(min_length=10, max_length=2048)


def _validated_public_url(raw: str) -> tuple[str, list[str]]:
    value = raw.strip()
    parts = urlsplit(value)
    if parts.scheme not in ('https', 'http') or not parts.hostname:
        raise ValueError('Enter a valid HTTP(S) URL.')
    if parts.username or parts.password or parts.fragment:
        raise ValueError('URL credentials and fragments are not supported.')
    try:
        port = parts.port
    except ValueError as exc:
        raise ValueError('Invalid URL port.') from exc
    if port not in (None, 80, 443):
        raise ValueError('Only standard HTTP(S) ports are supported.')
    hostname = parts.hostname.rstrip('.').lower()
    if not hostname or any(ord(char) < 33 for char in hostname):
        raise ValueError('Invalid hostname.')
    if hostname in ('localhost',) or hostname.endswith(('.localhost', '.local', '.internal')):
        raise ValueError('Local network addresses are not allowed.')
    addresses = resolve_public_addresses(hostname, port or (443 if parts.scheme == 'https' else 80))
    return value, addresses


def validate_public_url(raw: str) -> str:
    return _validated_public_url(raw)[0]


def resolve_public_addresses(hostname: str, port: int) -> list[str]:
    try:
        addresses = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError, OSError) as exc:
        raise ValueError('URL hostname could not be resolved.') from exc
    unique = list(dict.fromkeys(address[4][0] for address in addresses))
    try:
        if not unique or any(not ipaddress.ip_address(address).is_global for address in unique):
            raise ValueError('URL must resolve only to public IP addresses.')
    except ValueError as exc:
        if str(exc) == 'URL must resolve only to public IP addresses.':
            raise
        raise ValueError('URL hostname could not be resolved.') from exc
    return unique


class PinnedHTTPConnection(http.client.HTTPConnection):
    """Connect to the already-validated address, avoiding a second DNS lookup."""

    def __init__(self, hostname: str, address: str, port: int, timeout: float):
        super().__init__(hostname, port=port, timeout=timeout)
        self.address = address

    def connect(self):
        self.sock = socket.create_connection((self.address, self.port), self.timeout)


class PinnedHTTPSConnection(PinnedHTTPConnection):
    def connect(self):
        sock = socket.create_connection((self.address, self.port), self.timeout)
        try:
            self.sock = ssl.create_default_context().wrap_socket(sock, server_hostname=self.host)
        except Exception:
            sock.close()
            raise


class PageText(HTMLParser):
    ignored = {'script', 'style', 'nav', 'noscript', 'svg', 'footer'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = []
        self.text = []
        self.title = []
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in self.ignored:
            self.skip.append(tag)
        if tag == 'title':
            self.in_title = True
        if tag in ('p', 'div', 'article', 'section', 'li', 'h1', 'h2', 'h3', 'br'):
            self.text.append('\n')

    def handle_endtag(self, tag):
        if self.skip and self.skip[-1] == tag:
            self.skip.pop()
        if tag == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title.append(data)
        elif not self.skip:
            self.text.append(data)


def extract_html(html: str) -> tuple[str, str]:
    parser = PageText()
    parser.feed(html)
    title = re.sub(r'\s+', ' ', ''.join(parser.title)).strip()[:180]
    body = re.sub(r'[ \t]+', ' ', ''.join(parser.text))
    body = re.sub(r'\n{3,}', '\n\n', body).strip()[:MAX_TEXT_CHARS]
    return title or 'Web page', body


def extract_chatgpt_share(html: str) -> tuple[str, str] | None:
    """Extract public conversation turns from ChatGPT's server-rendered share data."""
    chunks = re.findall(r'streamController\.enqueue\(("(?:\\.|[^"\\])*")\)', html)
    serialized = next(
        (
            json.loads(chunk)
            for chunk in chunks
            if json.loads(chunk).lstrip().startswith('[')
        ),
        None,
    )
    if not serialized:
        return None
    try:
        values = json.loads(serialized)
    except (TypeError, ValueError):
        return None
    memo, active = {}, set()

    def resolve(value, depth=0):
        if depth > 80:
            return None
        if type(value) is int:
            if value < 0 or value >= len(values):
                return None
            if value in memo:
                return memo[value]
            if value in active:
                return None
            active.add(value)
            resolved = resolve(values[value], depth + 1)
            active.remove(value)
            memo[value] = resolved
            return resolved
        if isinstance(value, dict):
            result = {}
            for key, child in value.items():
                resolved_key = key
                if key.startswith('_') and key[1:].isdigit():
                    index = int(key[1:])
                    if index < len(values) and isinstance(values[index], str):
                        resolved_key = values[index]
                result[resolved_key] = resolve(child, depth + 1)
            return result
        if isinstance(value, list):
            return [resolve(child, depth + 1) for child in value]
        return value

    try:
        decoded = resolve(values[0])
        routes = decoded.get('loaderData', {}).values()
        server_data = next(
            route['serverResponse']['data']
            for route in routes
            if isinstance(route, dict)
            and isinstance(route.get('serverResponse'), dict)
            and isinstance(route['serverResponse'].get('data'), dict)
        )
        mapping = server_data.get('mapping', {})
        turns, seen = [], set()

        def visit(node_id):
            if node_id in seen:
                return
            seen.add(node_id)
            node = mapping.get(node_id, {})
            message = node.get('message') or {}
            role = (message.get('author') or {}).get('role')
            if role in ('user', 'assistant'):
                parts = (message.get('content') or {}).get('parts') or []
                text = '\n'.join(part for part in parts if isinstance(part, str)).strip()
                if text:
                    turns.append(f'{role.title()}: {text}')
            for child in node.get('children') or []:
                visit(child)

        root = mapping.get('client-created-root', {})
        for child in root.get('children') or []:
            visit(child)
        body = '\n\n'.join(turns)[:MAX_TEXT_CHARS]
        title = str(server_data.get('title') or 'Shared ChatGPT conversation')[:180]
        return (title, body) if len(body) >= 40 else None
    except (AttributeError, KeyError, StopIteration, TypeError, ValueError):
        return None


def fetch_page(url: str) -> tuple[str, str]:
    url, addresses = _validated_public_url(url)
    parts = urlsplit(url)
    hostname = parts.hostname.rstrip('.').lower()
    port = parts.port or (443 if parts.scheme == 'https' else 80)
    target = parts.path or '/'
    if parts.query:
        target += '?' + parts.query
    connection_type = PinnedHTTPSConnection if parts.scheme == 'https' else PinnedHTTPConnection
    try:
        response = None
        last_error = None
        for address in addresses:
            connection = connection_type(hostname, address, port, timeout=15.0)
            try:
                connection.request(
                    'GET',
                    target,
                    headers={
                        'Host': hostname,
                        'User-Agent': 'Atlas-Research/1.0',
                        'Accept': 'text/html,application/xhtml+xml',
                        'Accept-Encoding': 'identity',
                        'Connection': 'close',
                    },
                )
                response = connection.getresponse()
                break
            except OSError as exc:
                last_error = exc
                connection.close()
        if response is None:
            raise last_error or OSError('No public address was reachable.')
        try:
            if response.status in (301, 302, 303, 307, 308):
                raise ValueError('Redirects are not supported; paste the final public URL.')
            if not 200 <= response.status < 300:
                raise ValueError('Could not fetch the requested public webpage.')
            media_type = response.getheader('content-type', '').lower().split(';')[0].strip()
            if media_type not in ('text/html', 'application/xhtml+xml'):
                raise ValueError('The URL must return an HTML page.')
            data = response.read(MAX_HTML_BYTES + 1)
            if len(data) > MAX_HTML_BYTES:
                raise ValueError('Page exceeds the HTML size limit.')
            encoding = 'utf-8'
            content_type = response.getheader('content-type', '')
            match = re.search(r'charset=([\w-]+)', content_type, re.I)
            if match:
                encoding = match.group(1)
        finally:
            response.close()
        html = data.decode(encoding, errors='replace')
        title, body = extract_html(html)
        if hostname == 'chatgpt.com' and re.match(r'^/share/[^/]+/?$', parts.path):
            title, body = extract_chatgpt_share(html) or (title, body)
        if len(body.strip()) < 40:
            raise ValueError('Page has insufficient readable text.')
        return title, body
    except (OSError, http.client.HTTPException, ssl.SSLError, UnicodeError) as exc:
        raise ValueError('Could not fetch the requested public webpage.') from exc


def save_webpage(workspaceId: str, url: str, db) -> dict:
    title, body = fetch_page(url)
    text = f'# {title}\n\nSource URL: {url}\n\n{body}\n'
    data = text.encode('utf-8')
    digest = hashlib.sha256(data).hexdigest()
    existing = db.query(Document).filter_by(workspace_id=workspaceId, digest=digest).first()
    if existing:
        return {
            'id': existing.id,
            'name': existing.name,
            'status': existing.status,
            'url': url,
            'duplicate': True,
        }
    did = uid()
    path = DATA / 'files' / did
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.write_bytes(data)
        doc = Document(
            id=did,
            workspace_id=workspaceId,
            name=f'{title[:170]}.md',
            size=len(data),
            digest=digest,
        )
        db.add(doc)
        db.commit()
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    return {'id': did, 'name': doc.name, 'status': doc.status, 'url': url, 'duplicate': False}


@router.post('/workspaces/{workspaceId}/web-pages')
def add_web_page(workspaceId: str, body: UrlRequest, request: Request):
    # Import inside handler to avoid circular import with app.main.
    from .gmail import actor, allowed_workspace

    with Session() as db:
        owner = actor(request, db)
        allowed_workspace(db, owner, workspaceId)
        try:
            return save_webpage(workspaceId, body.url, db)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
