"""Provider contract tests without external credentials or traffic."""

import pytest

from app.connectors import batch_connectors
from app.research.source_contract import normalize_evidence
from app.research.sources import Evidence


@pytest.mark.parametrize('provider', batch_connectors.NEW_PROVIDERS)
def test_each_provider_has_normalizable_provenance(provider):
    hit = batch_connectors._result(
        provider, 'item-1', 'Example record', 'Relevant passage', 'https://example.com/record'
    )
    normalized = normalize_evidence(provider, hit)
    assert normalized.provider == provider
    assert normalized.source_id == 'item-1'
    assert normalized.excerpt == 'Relevant passage'
    assert (
        Evidence(provider, 'item-1', 'Example record', 'Relevant passage').as_prompt(1)['source_id']
        == 1
    )


def test_no_empty_record_identifier():
    assert batch_connectors._result('github', '', 'Example', 'Text', None) is None
