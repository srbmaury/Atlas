"""Deterministic offline ranking metrics for retrieval evaluations.

Expected ranked IDs are ordered; relevant IDs are an unordered gold set.
Empty gold sets are excluded from recall/MRR denominators and counted separately.
"""

from dataclasses import dataclass
from statistics import mean


@dataclass(frozen=True)
class RetrievalCase:
    query: str
    relevant_ids: frozenset[str]
    ranked_ids: tuple[str, ...]


def evaluate(cases: list[RetrievalCase], k: int = 10) -> dict:
    if k < 1:
        raise ValueError('k must be positive')
    scored = [case for case in cases if case.relevant_ids]
    recalls, reciprocal_ranks, precisions = [], [], []
    for case in scored:
        top = list(dict.fromkeys(case.ranked_ids))[:k]
        hits = [identifier for identifier in top if identifier in case.relevant_ids]
        recalls.append(len(hits) / len(case.relevant_ids))
        precisions.append(len(hits) / k)
        reciprocal_ranks.append(
            next(
                (1 / rank for rank, identifier in enumerate(top, 1) if identifier in case.relevant_ids),
                0.0,
            )
        )
    return {
        'cases': len(cases),
        'answerable_cases': len(scored),
        'unanswerable_cases': len(cases) - len(scored),
        'k': k,
        'recall_at_k': mean(recalls) if recalls else None,
        'precision_at_k': mean(precisions) if precisions else None,
        'mrr_at_k': mean(reciprocal_ranks) if reciprocal_ranks else None,
    }
