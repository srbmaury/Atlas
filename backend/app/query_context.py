"""Resolve explicit conversational references before the shared RAG search path."""

import re


def retrieval_query(question, history):
    """Carry the last user topic only when the new question explicitly refers back."""
    prior = [turn.content for turn in history if turn.role == 'user'][-1:]
    refers_back = re.search(
        r'\b(it|its|that|their|them|those|this)\b',
        question,
        re.I,
    )
    if prior and refers_back:
        return question + ' ' + prior[0]
    return question


def bounded_history(history):
    """Conversation helps resolve references; it is never supporting evidence."""
    return [
        {'role': turn['role'], 'content': turn['content'][:1000]}
        for turn in (history or [])[-4:]
        if turn.get('role') in ('user', 'assistant')
    ]
