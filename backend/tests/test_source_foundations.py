import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'evals'))
from retrieval_eval import evaluate, score_case

from app.research.source_contract import normalize_evidence
from app.routes.web_sources import extract_html, validate_public_url


def test_retrieval_metrics():
    result = score_case(['wrong', 'correct'], ['correct'], k=2)
    assert result['recall_at_k'] == 1
    assert result['mrr_at_k'] == 0.5


def test_evaluation_averages():
    report = evaluate(
        [{'question': 'x', 'candidates': [], 'relevant_ids': ['a']}], lambda q, c: ['a'], k=1
    )
    assert report['mrr_at_k'] == 1


def test_normalize_evidence():
    row = normalize_evidence(
        'web', {'id': '42', 'text': 'Relevant passage', 'url': 'https://example.com'}
    )
    assert row.source_id == '42' and row.provider == 'web'


def test_html_extractor_ignores_scripts_and_nav():
    title, body = extract_html(
        '<title>Test</title><nav>MENU</nav><p>Useful text</p><script>SECRET</script>'
    )
    assert title == 'Test' and 'Useful text' in body
    assert 'MENU' not in body and 'SECRET' not in body


@pytest.mark.parametrize(
    'url',
    [
        'file:///etc/passwd',
        'http://localhost/',
        'http://127.0.0.1/',
        'http://169.254.169.254/',
        'http://user:pass@example.com/',
    ],
)
def test_unsafe_url_rejected(url):
    with pytest.raises(ValueError):
        validate_public_url(url)
