"""Shared, read-only evidence contract for Atlas source adapters.

Adapters can normalize existing provider payloads incrementally. This module
does not grant access: each connector must enforce workspace permissions.
"""

from dataclasses import asdict, dataclass, field
from typing import Any, Iterable, Mapping, Optional, Protocol, Sequence, Union


@dataclass(frozen=True)
class Evidence:
    provider: str
    source_id: str
    title: str
    excerpt: str
    url: Optional[str] = None
    date: Optional[str] = None
    owner: Optional[str] = None
    content_type: str = 'text/plain'
    scope: Optional[str] = None
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if not self.source_id or not self.provider:
            raise ValueError('Evidence must have a source ID and provider.')

    def to_dict(self) -> dict:
        return asdict(self)

    def as_prompt(self, index: int) -> dict:
        normalized = normalize_evidence(
            self.provider,
            {
                'id': self.source_id,
                'title': self.title,
                'text': self.excerpt,
                'url': self.url,
                'date': self.date,
            },
        )
        return {
            'source_id': index,
            'provider': normalized.provider,
            'title': normalized.title,
            'text': normalized.excerpt,
            'url': normalized.url,
            'date': normalized.date,
        }


class SourceAdapter(Protocol):
    """Read-only interface; caller handles authentication and permission scope."""

    provider: str

    def search(self, query: str, *, limit: int = 10) -> Sequence[Evidence]: ...

    def fetch(self, source_id: str) -> Evidence: ...


def normalize_evidence(provider: str, record: Mapping[str, Any]) -> Evidence:
    """Normalize a provider result without inventing missing provenance."""
    value = record.get('text') or record.get('excerpt') or record.get('content') or ''
    return Evidence(
        source_id=str(record.get('source_id') or record.get('id') or record.get('chunk_id') or ''),
        provider=provider,
        title=str(record.get('title') or record.get('name') or 'Untitled'),
        excerpt=str(value),
        url=record.get('url'),
        date=record.get('date') or record.get('timestamp'),
        owner=record.get('owner'),
        content_type=str(record.get('content_type') or 'text/plain'),
        scope=record.get('scope'),
        metadata=dict(record.get('metadata') or {}),
    )


def normalize_results(
    provider: str, records: Iterable[Union[Mapping[str, Any], Evidence]]
) -> list[Evidence]:
    """Normalize provider records once at the connector boundary."""
    return [
        record if isinstance(record, Evidence) else normalize_evidence(provider, record)
        for record in records
    ]
