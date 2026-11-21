from app.research.decision_links import references, related_sources


def test_explicit_issue_link_only():
    evidence = [
        {'provider': 'jira', 'source_id': '123', 'title': 'ATLAS-42 Fix caching', 'text': 'Task'},
        {
            'provider': 'github',
            'source_id': '456',
            'title': 'Implement ATLAS-42',
            'text': 'Pull request',
        },
        {
            'provider': 'notion',
            'source_id': '789',
            'title': 'Caching discussion',
            'text': 'Redis cache',
        },
    ]
    assert related_sources(evidence) == [
        {'left': 1, 'right': 2, 'references': ['ATLAS-42'], 'status': 'shared_reference'}
    ]


def test_similar_text_not_a_relationship():
    assert (
        related_sources(
            [
                {'provider': 'jira', 'source_id': '1', 'title': 'Caching'},
                {'provider': 'github', 'source_id': '2', 'title': 'Caching'},
            ]
        )
        == []
    )


def test_pr_reference_parsing():
    assert 'PR#18' in references('Implemented in PR #18')


def test_timeline_requires_two_sources_and_explicit_dated_actions():
    from app.research.decision_links import decision_timeline

    sources = [
        {
            'provider': 'jira',
            'source_id': '1',
            'title': 'ATLAS-42',
            'text': '2026-10-15: proposed Redis cache for ATLAS-42.',
        },
        {
            'provider': 'github',
            'source_id': '2',
            'title': 'ATLAS-42',
            'text': 'On 2026-10-20 we merged ATLAS-42 implementation.',
        },
    ]
    events = decision_timeline(sources)
    assert [item['date'] for item in events] == ['2026-10-15', '2026-10-20']
    assert [item['source'] for item in events] == [1, 2]
    assert all(item['status'] == 'source_reported' for item in events)
    assert decision_timeline(sources[:1]) == []


def test_timeline_does_not_infer_events_from_title_or_keywords():
    from app.research.decision_links import decision_timeline

    sources = [
        {
            'provider': 'jira',
            'source_id': 'a',
            'title': 'TASK-31 approved 2026-10-03',
            'text': 'Discussed options.',
        },
        {'provider': 'github', 'source_id': 'b', 'title': 'TASK-31', 'text': 'Release overview.'},
    ]
    assert decision_timeline(sources) == []
