"""Safe, bounded extraction for lightweight structured documents."""

import csv
import io
import json
from html.parser import HTMLParser
from pathlib import Path

MAX_TEXT_CHARS = 8_000_000


class ReadableHTML(HTMLParser):
    BLOCKS = {
        'p',
        'div',
        'br',
        'tr',
        'li',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'section',
        'article',
    }
    SKIP = {'script', 'style', 'noscript', 'svg', 'iframe'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skipped = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skipped += 1
        if not self.skipped and tag in self.BLOCKS:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self.skipped = max(0, self.skipped - 1)
        if not self.skipped and tag in self.BLOCKS:
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.skipped:
            self.parts.append(data)

    def result(self):
        return '\n'.join(line.strip() for line in ''.join(self.parts).splitlines() if line.strip())


def extract_structured(path, extension):
    raw = Path(path).read_text(encoding='utf-8-sig')
    if len(raw) > MAX_TEXT_CHARS:
        raise ValueError('Structured text is too large to index.')
    if extension == '.json':
        return json.dumps(json.loads(raw), ensure_ascii=False, indent=2)
    if extension == '.csv':
        rows = csv.reader(io.StringIO(raw))
        result = []
        for index, row in enumerate(rows):
            if index >= 100000:
                raise ValueError('CSV exceeds 100,000 rows.')
            result.append(' | '.join(cell.strip().replace('\n', ' ') for cell in row))
        return '\n'.join(result)
    if extension in ('.html', '.htm'):
        parser = ReadableHTML()
        parser.feed(raw)
        return parser.result()
    raise ValueError('Unsupported structured format')
