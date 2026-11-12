"""Deterministic, source-linked research plans and evidence relationships.

This module never uses retrieved source text as instructions. Graph nodes are
limited to evidence returned by the workspace-scoped retrieval tool.
"""

import re

MAX_QUESTIONS = 3
MAX_SOURCES = 8
MAX_EXCERPT = 500


def plan(question: str) -> list[str]:
    """Create bounded retrieval tasks without delegating authority to an LLM."""
    question = question.strip()
    if not question:
        raise ValueError('Research question cannot be empty.')
    tasks = [question]
    for separator in (r'\s+and\s+', r'\s*;\s*'):
        if len(tasks) > 1:
            break
        parts = [part.strip(' ?.\n') for part in re.split(separator, question, flags=re.I)]
        if 1 < len(parts) <= MAX_QUESTIONS and all(len(part) >= 5 for part in parts):
            tasks = parts
    return tasks[:MAX_QUESTIONS]


def evidence_graph(sources: list[dict]) -> dict:
    """Return a small provenance graph, not inferred semantic relationships."""
    nodes = []
    edges = []
    seen_documents = set()
    seen_chunks = set()
    for source in sources[:MAX_SOURCES]:
        document_id = str(
            source.get('document_id')
            or f'{source.get("provider", "source")}:{source.get("name", "")}'
        )
        chunk_id = str(source.get('chunk_id') or '')
        if not document_id or not chunk_id:
            continue
        doc_key = f'document:{document_id}'
        chunk_key = f'chunk:{chunk_id}'
        if doc_key not in seen_documents:
            nodes.append(
                {
                    'id': doc_key,
                    'type': 'document',
                    'name': str(source.get('name') or 'Document')[:200],
                    'provider': source.get('provider', 'documents'),
                }
            )
            seen_documents.add(doc_key)
        if chunk_key in seen_chunks:
            continue
        nodes.append(
            {
                'id': chunk_key,
                'type': 'evidence',
                'page': source.get('page'),
                'excerpt': str(source.get('text') or '')[:MAX_EXCERPT],
            }
        )
        edges.append({'from': doc_key, 'to': chunk_key, 'type': 'contains'})
        seen_chunks.add(chunk_key)
    return {'nodes': nodes, 'edges': edges, 'relationship_scope': 'provenance_only'}
