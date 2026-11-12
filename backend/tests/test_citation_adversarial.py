"""Adversarial regression tests for citation heuristics.

These tests intentionally do not claim semantic entailment verification.
"""
from app.citation_audit import audit_citations


def _status(answer, evidence):
    return audit_citations(answer, [{'text': evidence}])['claims'][0]['status']


def test_missing_reference_is_not_accepted():
    assert _status('Revenue grew 20%.', 'Revenue grew 20%.') == 'missing_citation'


def test_fabricated_number_is_rejected():
    assert _status('Revenue grew 30% [1].', 'Revenue grew 20%.') == 'number_mismatch'


def test_negated_claim_is_flagged():
    assert _status('The service is not available [1].', 'The service is available.') == 'possible_negation_mismatch'


def test_unknown_reference_is_rejected():
    assert _status('Revenue grew 20% [2].', 'Revenue grew 20%.') == 'invalid_citation'


def test_lexical_overlap_is_not_semantic_verification():
    report = audit_citations('The service is available [1].', [{'text': 'The service is available.'}])
    assert report['semantic_entailment_verified'] is False
    assert report['claims'][0]['requires_human_review'] is True
