"""Conservative claim-to-passage checks; never equate a citation with proof."""

import re

from .retrieval import tokens


def verify_claims(answer, sources):
    """Flag unsupported or uncited factual sentences; no false verified claims.

    Lexical overlap is only a screening heuristic, not semantic entailment.
    """
    sentences = [
        sentence.strip()
        for sentence in re.split(r'(?<=[.!?])\s+|\n+', answer or '')
        if sentence.strip()
    ]
    checks = []
    for sentence in sentences:
        if sentence.startswith(('#', '|', '```')) or len(tokens(sentence)) < 3:
            continue
        cited = [int(number) for number in re.findall(r'\[(\d+)\]', sentence)]
        valid = sorted(set(number for number in cited if 1 <= number <= len(sources)))
        claim_terms = set(tokens(re.sub(r'\[\d+\]', '', sentence)))
        matches = []
        for number in valid:
            passage_terms = set(tokens(sources[number - 1].get('text', '')))
            overlap = len(claim_terms & passage_terms) / max(len(claim_terms), 1)
            matches.append({'source_id': number, 'lexical_overlap': round(overlap, 3)})
        best = max((match['lexical_overlap'] for match in matches), default=0)
        checks.append({
            'claim': sentence[:600],
            'source_ids': valid,
            'status': 'needs_review' if valid and best >= 0.5 else 'unsupported',
            'reason': 'Lexical evidence candidate; semantic support not proven'
            if valid and best >= 0.5
            else 'Missing citation or insufficient lexical alignment',
            'matches': matches,
        })
    return {
        'method': 'conservative_lexical_screen',
        'verified': 0,
        'needs_review': sum(row['status'] == 'needs_review' for row in checks),
        'unsupported': sum(row['status'] == 'unsupported' for row in checks),
        'claims': checks[:60],
        'disclaimer': 'No claim is marked verified by lexical overlap alone.',
    }
