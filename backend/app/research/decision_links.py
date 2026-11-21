"""Evidence relationships based on explicit, verifiable references only.

Never infer causation from keyword overlap.
"""

import re

ISSUE = re.compile(r'\b[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,7}\b')
PR = re.compile(r'(?i)\b(?:pull request|\bPR)\s*#?(\d{1,7})\b')


def references(text):
    value = str(text or '')
    return set(ISSUE.findall(value)) | {'PR#' + n for n in PR.findall(value)}


def related_sources(sources, *, max_links=20):
    """Return candidate links only when two independently cited items share an explicit ID."""
    matched = []
    for index, item in enumerate(sources):
        label = ' '.join(str(item.get(key) or '') for key in ('title', 'text'))
        ids = references(label)
        if not ids:
            continue
        for earlier in range(index):
            other = sources[earlier]
            if item.get('provider') == other.get('provider') and item.get('source_id') == other.get(
                'source_id'
            ):
                continue
            other_ids = references(' '.join(str(other.get(key) or '') for key in ('title', 'text')))
            common = sorted(ids & other_ids)
            if common:
                matched.append(
                    {
                        'left': earlier + 1,
                        'right': index + 1,
                        'references': common,
                        'status': 'shared_reference',
                    }
                )
                if len(matched) >= max_links:
                    return matched
    return matched


DATE = re.compile(r'(?<!\d)(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])(?!\d)')
EVENT = re.compile(
    r'\b(proposed|approved|rejected|implemented|merged|deployed|rolled back)\b', re.I
)


def decision_timeline(sources, *, limit=30):
    """Dated evidence with shared explicit identifiers, not inferred event dates.

    Both the date and lifecycle verb must occur in the same source excerpt.
    Events remain source claims; no assertion that an action actually happened.
    """
    indexed = []
    for number, source in enumerate(sources, 1):
        body = str(source.get('text') or '')
        title = str(source.get('title') or '')
        ids = sorted(references(title + ' ' + body))
        if not ids:
            continue
        for match in DATE.finditer(body):
            start = max(0, match.start() - 180)
            end = min(len(body), match.end() + 180)
            excerpt = body[start:end]
            action = EVENT.search(excerpt)
            if not action:
                continue
            indexed.append(
                {
                    'date': match.group(0),
                    'source': number,
                    'references': ids,
                    'event': action.group(1).lower(),
                    'excerpt': ' '.join(excerpt.split())[:260],
                    'status': 'source_reported',
                }
            )
    # Only present an actual cross-source timeline when a reference appears
    # in at least two distinct source records.
    count = {}
    for source in sources:
        for ref in references(str(source.get('title') or '') + ' ' + str(source.get('text') or '')):
            count[ref] = count.get(ref, 0) + 1
    items = []
    seen = set()
    for item in sorted(indexed, key=lambda x: (x['date'], x['source'])):
        common = [ref for ref in item['references'] if count[ref] >= 2]
        key = (item['date'], item['source'], item['event'])
        if not common or key in seen:
            continue
        seen.add(key)
        item['references'] = common
        items.append(item)
        if len(items) >= limit:
            break
    return items
