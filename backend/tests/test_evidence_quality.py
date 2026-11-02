from app.evidence_quality import canonical_url, prepare_evidence
from app.sources import Evidence


def item(provider, sid, title, text, url=None):
    return Evidence(provider, sid, title, text, url)


def test_cross_provider_duplicate_same_url():
    rows = [
        item('github', 'one', 'Cache issue', 'Cache bug', 'https://example.com/a'),
        item('notion', 'two', 'Mirror', 'Cache bug', 'https://example.com/a'),
    ]
    assert len(prepare_evidence('cache', rows)) == 1


def test_preserves_distinct_provider_ids_when_no_url():
    rows = [item('github', 'same', 'Cache', 'alpha'), item('linear', 'same', 'Cache', 'alpha')]
    assert len(prepare_evidence('cache', rows)) == 2


def test_prefers_title_relevance():
    rows = [
        item('github', '1', 'Nothing', 'Nothing relevant'),
        item('jira', '2', 'Cache invalidation', 'Discuss invalidation'),
    ]
    assert prepare_evidence('cache invalidation', rows)[0].source_id == '2'


def test_matches_filename_terms_separated_by_underscores():
    row = item('drive', 'resume', 'Saurabh_Maurya_Resume_AI_Engineer.pdf', 'Experienced engineer')

    assert prepare_evidence('resume', [row]) == [row]


def test_canonical_url_safely_handles_bad_values():
    assert canonical_url('file:///etc/hosts') == ''
    assert canonical_url('https://EXAMPLE.com/a#fragment') == 'https://example.com/a'


def test_repository_activity_ranks_by_last_push_not_prompt_overlap():
    rows = [
        Evidence(
            'github',
            'older',
            'older-project',
            'Last push: 2023-04-01T00:00:00Z',
            date='2023-04-01T00:00:00Z',
        ),
        Evidence(
            'github',
            'newer',
            'newer-project',
            'Last push: 2025-02-01T00:00:00Z',
            date='2025-02-01T00:00:00Z',
        ),
    ]

    result = prepare_evidence('Which of my GitHub repos is most active?', rows)

    assert [row.source_id for row in result] == ['newer', 'older']


def test_repository_listing_keeps_github_repos_without_prompt_word_overlap():
    rows = [item('github', 'r1', 'owner/project-one', 'A data tooling project')]

    result = prepare_evidence('List at least 10 of my projects from GitHub', rows)

    assert [row.source_id for row in result] == ['r1']
