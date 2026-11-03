import math
import re
from collections import Counter
from difflib import SequenceMatcher
from functools import lru_cache

from sqlalchemy import text

from .ai import embed, embedding_model_id, enabled
from .db import Chunk, Document, Session, engine
from .research_queries import QUERY_STOPWORDS

STOP = QUERY_STOPWORDS | set(
    'many write wrote lines line sentences sentence paragraph paragraphs words word short brief describe description ten five three two one overview'.split()
)
GENERIC_FILENAME_TERMS = set(
    'readme improved improvement improvements document documents project projects file files pdf docx txt md guide note notes review brief product summary overview gateway payment option'.split()
)


def tokens(value):
    result = []
    for term in re.findall(r'\w+', value.lower().replace('_', ' ')):
        if term in STOP or len(term) <= 1 or term.isdigit():
            continue
        if len(term) > 4 and term.endswith('ies'):
            term = term[:-3] + 'y'
        elif len(term) > 4 and re.search(r'(ches|shes|sses|xes|zes)$', term):
            term = term[:-2]
        elif len(term) > 3 and term.endswith('s') and not term.endswith(('ss', 'us', 'is')):
            term = term[:-1]
        result.append(term)
    return result


def bm25(query, chunks):
    terms = tokens(query)
    if not terms or not chunks:
        return []
    docs = [Counter(tokens(c.text)) for c in chunks]
    lengths = [sum(d.values()) for d in docs]
    average = sum(lengths) / max(len(docs), 1) or 1
    frequency = {t: sum(t in d for d in docs) for t in set(terms)}
    scored = []
    for c, d, length in zip(chunks, docs, lengths):
        score = 0
        for t in set(terms):
            count = d[t]
            idf = math.log(1 + (len(docs) - frequency[t] + 0.5) / (frequency[t] + 0.5))
            score += idf * count * 2.5 / (count + 1.5 * (0.25 + 0.75 * length / average))
        if score > 0:
            scored.append((c, score))
    return sorted(scored, key=lambda x: x[1], reverse=True)[:60]


def minimum_query_overlap(query):
    """Require direct support for multiple concepts in specific questions."""
    count = len(set(tokens(query)))
    if count <= 2:
        return 1
    return min(3, math.ceil(count * 0.5))


def has_query_support(query, text, title=''):
    terms = set(tokens(query))
    if not terms:
        return True
    overlap = terms & set(tokens(f'{title}\n{text}'))
    return len(overlap) >= minimum_query_overlap(query)


def cosine_similarity(left, right):
    norm_left = math.sqrt(sum(value * value for value in left)) or 1
    norm_right = math.sqrt(sum(value * value for value in right)) or 1
    return sum(a * b for a, b in zip(left, right)) / (norm_left * norm_right)


def diversify_ranked_chunks(ranked, limit, per_document=3):
    """Preserve diverse evidence while retaining high-scoring results.

    Rank each document's strongest passages before filling remaining slots.
    This prevents one lengthy PDF from crowding out comparison evidence.
    """
    if limit <= 0:
        return []
    chosen, counts, used = [], {}, set()
    for item in ranked:
        doc = item.document_id
        if counts.get(doc, 0) >= per_document:
            continue
        chosen.append(item)
        used.add(item.id)
        counts[doc] = counts.get(doc, 0) + 1
        if len(chosen) >= limit:
            return chosen
    for item in ranked:
        if item.id not in used:
            chosen.append(item)
            if len(chosen) >= limit:
                break
    return chosen


def source(chunk, name, ocr=False):
    return {
        'chunk_id': chunk.id,
        'document_id': chunk.document_id,
        'name': name,
        'page': chunk.page,
        'text': chunk.text,
        'location_type': 'page' if name.lower().endswith('.pdf') else 'section',
        'provider': 'documents',
        'source_id': chunk.id,
        'ocr': ocr,
    }


def retrieve(workspace_id, query, document_ids=None, limit=8):
    with Session() as db:
        base = (
            db.query(Chunk)
            .join(Document)
            .filter(Chunk.workspace_id == workspace_id, Document.status == 'ready')
        )
        if document_ids:
            base = base.filter(Chunk.document_id.in_(document_ids))
        else:
            # When the question names an uploaded file, keep retrieval within that file.
            # This works for arbitrary document names and also supports comparisons by
            # retaining each explicitly named document.
            query_terms = set(tokens(query))
            named = []
            for document_id, name in db.query(Document.id, Document.name).filter_by(
                workspace_id=workspace_id
            ):
                stem = re.sub(r'[_-]+', ' ', name.rsplit('.', 1)[0])
                terms = set(tokens(stem)) - GENERIC_FILENAME_TERMS
                if any(
                    term in query_terms
                    or any(
                        len(term) > 4 and SequenceMatcher(None, term, q).ratio() >= 0.9
                        for q in query_terms
                    )
                    for term in terms
                ):
                    named.append(document_id)
            if named:
                base = base.filter(Chunk.document_id.in_(named))
        semantic = []
        semantic_scores = {}
        lexical = []
        if engine.dialect.name == 'postgresql':
            search = "plainto_tsquery('english', :query)"
            lexical = (
                base.filter(text(f"to_tsvector('english', chunks.text) @@ {search}"))
                .order_by(text(f"ts_rank_cd(to_tsvector('english', chunks.text), {search}) DESC"))
                .params(query=query)
                .limit(60)
                .all()
            )
        elif engine.dialect.name == 'sqlite' and _sqlite_fts_available():
            raw_terms = re.findall(r'\w+', query.lower())
            terms = list(
                dict.fromkeys(
                    term
                    for raw_term in raw_terms
                    if raw_term not in STOP and not raw_term.isdigit()
                    for term in (raw_term, *tokens(raw_term))
                )
            )
            match_query = ' OR '.join(f'"{term}"' for term in terms)
            if match_query:
                rows = db.execute(
                    text(
                        'SELECT chunk_id, bm25(chunks_fts) AS rank FROM chunks_fts '
                        'WHERE chunks_fts MATCH :query AND workspace_id = :workspace_id '
                        'ORDER BY rank LIMIT 200'
                    ),
                    {'query': match_query, 'workspace_id': workspace_id},
                ).all()
                fts_ids = [row.chunk_id for row in rows]
                by_id = (
                    {c.id: c for c in base.filter(Chunk.id.in_(fts_ids)).all()} if fts_ids else {}
                )
                lexical = [by_id[row.chunk_id] for row in rows[:60] if row.chunk_id in by_id]
        else:
            chunks = base.all()
            lexical = [c for c, _ in bm25(query, chunks)]
        if engine.dialect.name == 'postgresql' and enabled():
            vector = embed([query])[0]
            semantic = (
                base.filter(
                    Chunk.embedding_model == embedding_model_id(),
                    Chunk.embedding.isnot(None),
                    Chunk.embedding.cosine_distance(vector) < 0.8,
                )
                .order_by(Chunk.embedding.cosine_distance(vector))
                .limit(60)
                .all()
            )
            semantic_scores = {c.id: cosine_similarity(vector, c.embedding) for c in semantic}
        elif engine.dialect.name != 'postgresql' and enabled():
            vector = embed([query])[0]
            ranked = []
            semantic_candidates = base.filter(Chunk.embedding_model == embedding_model_id())
            for c in semantic_candidates.yield_per(100):
                if c.embedding is not None and c.embedding_model == embedding_model_id():
                    similarity = cosine_similarity(vector, c.embedding)
                    if similarity > 0.2:
                        ranked.append((c, similarity))
            semantic = [c for c, _ in sorted(ranked, key=lambda x: x[1], reverse=True)[:60]]
            semantic_scores = {c.id: score for c, score in ranked}
        # Weight exact lexical matches more strongly for precise facts; semantic ranks
        # still recover paraphrases and vocabulary that does not overlap the query.
        scores, candidates = {}, {}
        for ranking, weight in [(lexical, 4.0), (semantic, 1.0)]:
            for rank, c in enumerate(ranking):
                scores[c.id] = scores.get(c.id, 0) + weight / (60 + rank + 1)
                candidates[c.id] = c
        terms = set(tokens(query))
        documents = {
            d.id: d for d in db.query(Document).filter(Document.workspace_id == workspace_id)
        }
        names = {document_id: doc.name for document_id, doc in documents.items()}
        ranked = [
            c
            for c in candidates.values()
            if has_query_support(query, c.text, names.get(c.document_id, ''))
            or (len(terms) > 1 and semantic_scores.get(c.id, 0) >= 0.68)
        ]
        ranked.sort(
            key=lambda c: (
                scores[c.id] + 0.001 * len(terms & set(tokens(c.text))) / max(len(terms), 1)
            ),
            reverse=True,
        )
        selected = diversify_ranked_chunks(ranked, limit)
        return [
            source(
                c,
                names[c.document_id],
                c.page in (documents[c.document_id].ocr_pages or []),
            )
            for c in selected
        ]


@lru_cache(maxsize=1)
def _sqlite_fts_available():
    try:
        with engine.connect() as connection:
            connection.execute(text('SELECT 1 FROM chunks_fts LIMIT 0'))
        return True
    except Exception:
        return False
