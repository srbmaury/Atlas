from app.main import (
    ConnectedQuestion,
    direct_connected_result,
)
from app.sources import Evidence


def test_recent_source_records_are_ranked_from_provider_timestamps():
    body = ConnectedQuestion(
        question='Which of my GitHub repos is most active?',
        include_documents=False,
        providers=['github'],
    )
    evidence = [
        Evidence(
            'github',
            'repo-old',
            'owner/older-project',
            'Last push: 2023-04-01T00:00:00Z',
            'https://github.com/owner/older-project',
            '2023-04-01T00:00:00Z',
        ),
        Evidence(
            'github',
            'repo-new',
            'owner/newer-project',
            'Last push: 2025-02-01T00:00:00Z',
            'https://github.com/owner/newer-project',
            '2025-02-01T00:00:00Z',
        ),
    ]

    result = direct_connected_result(body.question, body, evidence, document_evidence={})

    assert result['mode'] == 'source_results'
    assert result['scope'] == ['github']
    assert '**owner/newer-project**' in result['answer']
    assert [source['url'] for source in result['sources']] == [
        'https://github.com/owner/newer-project',
    ]


def test_source_record_listing_honors_requested_count_without_synthesis():
    body = ConnectedQuestion(
        question='List at least 10 of my projects from GitHub',
        include_documents=False,
        providers=['github'],
    )
    evidence = [
        Evidence(
            'github',
            f'repo-{index}',
            f'srbmaury/project-{index}',
            'A project description',
            f'https://github.com/srbmaury/project-{index}',
        )
        for index in range(12)
    ]

    result = direct_connected_result(body.question, body, evidence, {})

    assert result['mode'] == 'source_results'
    assert result['scope'] == ['github']
    assert result['answer'].startswith('Found 12 matching items in GitHub:')
    assert len(result['sources']) == 10
