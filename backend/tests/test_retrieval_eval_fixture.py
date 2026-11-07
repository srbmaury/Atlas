import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2] / 'evals'))
from retrieval_eval import evaluate, lexical_rank


def test_default_retrieval_fixture_is_present_and_runnable():
    path = Path(__file__).parents[2] / 'evals' / 'retrieval_cases.json'
    cases = json.loads(path.read_text(encoding='utf-8'))['cases']
    assert len(cases) >= 12
    report = evaluate(cases, lexical_rank, k=1)
    assert report['cases'] == len(cases)
    assert 0 <= report['recall_at_k'] <= 1
    assert 0 <= report['precision_at_k'] <= 1
    assert 0 <= report['mrr_at_k'] <= 1
    assert 0 <= report['ndcg_at_k'] <= 1
    assert 0 <= report['hit_rate_at_k'] <= 1
