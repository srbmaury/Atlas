"""Conservative citation auditing: reference validity, lexical support, and facts.

A passing heuristic is never proof of semantic entailment.
"""

import re

from .retrieval import tokens

REFERENCE = re.compile(r'\[(\d+)\]')
NUMBER = re.compile(r'(?<![\w])(?:\d{1,4}(?:[,.]\d{3})*(?:\.\d+)?%?)(?![\w])')
NEGATION_PATTERN = re.compile(
    r"\b(?:not|never|no|without|neither|cannot|can['’]t|won['’]t|"
    r"don['’]t|doesn['’]t|didn['’]t|isn['’]t|aren['’]t|wasn['’]t|"
    r"weren['’]t|shouldn['’]t|wouldn['’]t|couldn['’]t|mustn['’]t|"
    r"[a-z]+n['’]t)\b",
    re.I,
)


def has_negation(text: str) -> bool:
    """Recognize standalone negation and contracted forms such as isn't/don't."""
    return bool(NEGATION_PATTERN.search(text))


def audit_citations(answer: str, sources: list[dict], *, threshold: float = 0.35) -> dict:
    findings = []
    # Keep citations attached to the preceding clause rather than splitting on decimals.
    statements = [
        s.strip()
        for s in re.split(r'(?<=[.!?])\s+(?=[A-Z*#])|\n+', answer)
        if s.strip() and re.search(r'[A-Za-z]', s)
    ]
    for statement in statements:
        ids = [int(n) for n in REFERENCE.findall(statement)]
        claim = REFERENCE.sub('', statement).strip()
        valid = [n for n in ids if 1 <= n <= len(sources)]
        claim_terms = set(tokens(claim))
        numbers = set(NUMBER.findall(claim))
        claim_negations = has_negation(claim)
        cited_texts = [str(sources[n - 1].get('text', '')) for n in valid]
        overlaps = []
        evidence_numbers = set()
        negation_mismatches = []
        for evidence in cited_texts:
            evidence_terms = set(tokens(evidence))
            overlaps.append(
                len(claim_terms & evidence_terms) / len(claim_terms) if claim_terms else 0
            )
            evidence_numbers.update(NUMBER.findall(evidence))
            evidence_negations = has_negation(evidence)
            negation_mismatches.append(claim_negations != evidence_negations)
        # Multiple citations should support a claim collectively, while a single
        # passage's lexical match remains independently visible in the score.
        combined_terms = set(tokens(' '.join(cited_texts)))
        combined_overlap = (
            len(claim_terms & combined_terms) / len(claim_terms) if claim_terms else 0
        )
        overlap = max(overlaps, default=combined_overlap)
        if len(valid) > 1:
            overlap = max(overlap, combined_overlap)
        if not ids:
            status = 'missing_citation'
        elif len(valid) != len(ids):
            status = 'invalid_citation'
        elif numbers - evidence_numbers:
            status = 'number_mismatch'
        elif negation_mismatches and all(negation_mismatches):
            status = 'possible_negation_mismatch'
        elif not claim_terms or overlap < threshold:
            status = 'needs_review'
        else:
            status = 'lexically_supported'
        findings.append(
            {
                'claim': claim[:500],
                'citations': ids,
                'overlap': round(overlap, 3),
                'status': status,
                'entailment': 'not_evaluated',
                'requires_human_review': True,
            }
        )
    return {
        'claims': findings,
        'needs_review': sum(row['status'] != 'lexically_supported' for row in findings),
        'claims_requiring_human_review': len(findings),
        'semantic_entailment_verified': False,
        'note': 'All claims require human review. Checks detect reference, number, negation, and lexical issues; they do not determine whether evidence entails a claim.',
    }
