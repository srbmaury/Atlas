from app.agents.evidence import evidence_graph, plan


def test_plan_splits_bounded_independent_questions():
    assert plan('What changed and Who approved') == ['What changed', 'Who approved']


def test_plan_keeps_single_question_intact():
    assert plan('What happened to the release?') == ['What happened to the release?']


def test_graph_deduplicates_sources_and_limits_excerpts():
    sources = [
        {'document_id': 'd1', 'chunk_id': 'c1', 'name': 'Plan', 'page': 2, 'text': 'x' * 1000},
        {'document_id': 'd1', 'chunk_id': 'c1', 'name': 'Plan', 'page': 2, 'text': 'x' * 1000},
        {'document_id': 'd1', 'chunk_id': 'c2', 'name': 'Plan', 'page': 3, 'text': 'other'},
    ]
    graph = evidence_graph(sources)
    assert len(graph['nodes']) == 3
    assert len(graph['edges']) == 2
    assert len(graph['nodes'][1]['excerpt']) == 500
    assert graph['relationship_scope'] == 'provenance_only'


def test_graph_skips_unidentified_evidence():
    assert evidence_graph([{'text': 'no identifiers'}])['nodes'] == []
