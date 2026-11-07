from app.citation_audit import audit_citations


def test_citation_audit_detects_missing_and_wrong_refs():
    sources = [{'text': 'The launch deadline is October 12.'}]
    report = audit_citations(
        'The launch deadline is October 12 [1].\nThe budget is approved [9].\nNo citation here.',
        sources,
    )
    assert report['claims'][0]['status'] == 'lexically_supported'
    assert report['claims'][1]['status'] == 'invalid_citation'
    assert report['claims'][2]['status'] == 'missing_citation'


def test_citation_audit_flags_unrelated_evidence():
    result = audit_citations(
        'The production system runs on Mars [1].', [{'text': 'Launch dates are tentative.'}]
    )
    assert result['needs_review'] == 1


def test_numeric_claim_requires_matching_number():
    result = audit_citations(
        'The release is scheduled for 2027 [1].', [{'text': 'The release is scheduled for 2026.'}]
    )
    assert result['claims'][0]['status'] == 'number_mismatch'


def test_negated_claim_needs_review():
    result = audit_citations(
        'The feature is not available [1].', [{'text': 'The feature is available.'}]
    )
    assert result['claims'][0]['status'] == 'possible_negation_mismatch'


def test_contracted_negation_is_not_treated_as_supported_positive_claim():
    result = audit_citations(
        "The feature isn't available [1].",
        [{'text': 'The feature is available.'}],
    )
    assert result['claims'][0]['status'] == 'possible_negation_mismatch'


def test_positive_claim_is_flagged_against_contracted_negative_evidence():
    result = audit_citations(
        "The service is available [1].",
        [{'text': "The service isn't available."}],
    )
    assert result['claims'][0]['status'] == 'possible_negation_mismatch'


def test_ordinary_positive_claim_remains_supported():
    result = audit_citations(
        "The service is available [1].",
        [{'text': 'The service is available to customers.'}],
    )
    assert result['claims'][0]['status'] == 'lexically_supported'

 
def test_lexical_match_is_never_reported_as_verified_entailment():
    result = audit_citations(
        'The service is available [1].',
        [{'text': 'The service is available to customers.'}],
    )
    claim = result['claims'][0]
    assert claim['status'] == 'lexically_supported'
    assert claim['entailment'] == 'not_evaluated'
    assert claim['requires_human_review'] is True
    assert result['semantic_entailment_verified'] is False
    assert result['claims_requiring_human_review'] == 1
