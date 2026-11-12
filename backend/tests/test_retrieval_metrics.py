from app.retrieval_metrics import RetrievalCase, evaluate


def test_ranking_metrics_and_deduplication():
    cases = [
        RetrievalCase('first', frozenset({'a', 'b'}), ('x', 'a', 'a', 'b')),
        RetrievalCase('second', frozenset({'z'}), ('x', 'y')),
        RetrievalCase('unknown', frozenset(), ()),
    ]
    result = evaluate(cases, k=3)
    assert result['answerable_cases'] == 2
    assert result['unanswerable_cases'] == 1
    assert result['recall_at_k'] == 0.5
    assert abs(result['mrr_at_k'] - 0.25) < 1e-9


def test_empty_gold_is_not_reported_as_perfect_recall():
    result = evaluate([RetrievalCase('unknown', frozenset(), ())])
    assert result['recall_at_k'] is None
    assert result['mrr_at_k'] is None


def test_invalid_k():
    import pytest

    with pytest.raises(ValueError):
        evaluate([], k=0)
