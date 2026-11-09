"""Resolve explicit conversational references before the shared RAG search path."""

import re

from .research_queries import search_topic


def retrieval_query(question, history):
    """Carry the last user topic only when the new question explicitly refers back."""
    prior = [turn.content for turn in history if turn.role == 'user'][-1:]
    refers_back = re.search(
        r'\b(it|its|that|their|them|those|this)\b',
        question,
        re.I,
    )
    if prior and refers_back:
        return search_topic(question) + ' ' + search_topic(prior[0])
    return search_topic(question)


def bounded_history(history):
    """Conversation helps resolve references; it is never supporting evidence."""
    return [
        {'role': turn['role'], 'content': turn['content'][:1000]}
        for turn in (history or [])[-4:]
        if turn.get('role') in ('user', 'assistant')
    ]
