"""Regressions for irrelevant evidence and misleading answer fallbacks."""

from types import SimpleNamespace

from app.connected_synthesis import stream_connected
from app.retrieval import has_query_support, tokens


def test_format_words_are_not_retrieval_concepts():
    assert tokens('Write 10 lines about Kosovo') == ['kosovo']
    assert has_query_support('Write 10 lines about Kosovo', 'Pristina is the capital of Kosovo.')
    assert not has_query_support(
        'Write 10 lines about Kosovo', 'A system design guide lists ten search problems.'
    )


def evidence(title, body, source_id='a'):
    return SimpleNamespace(
        provider='documents',
        title=title,
        excerpt=body,
        source_id=source_id,
        as_prompt=lambda n: {'source_id': n, 'provider': 'documents', 'title': title, 'text': body},
    )


def test_missing_citations_never_turn_into_retrieval_dump():
    events = list(
        stream_connected(
            'Write 10 lines about Kosovo',
            [evidence('Europe.pdf', 'Kosovo has its capital in Pristina.')],
            'openai',
            'key',
            'model',
            lambda: SimpleNamespace(
                responses=SimpleNamespace(
                    create=lambda **kwargs: [
                        SimpleNamespace(
                            type='response.output_text.delta',
                            delta='Pristina is a large port on Mars.',
                        )
                    ]
                )
            ),
            '',
            '',
        )
    )
    result = events[-1]
    assert result['type'] == 'complete'
    assert result['mode'] == 'citation_check_failed'
    assert result['sources'] == []
    assert 'I found' not in result['answer']


def test_supported_writing_draft_gets_citations_from_matching_passages():
    draft = (
        'Agricultural expansion and timber logging are causes of deforestation. '
        'Mining and forest fires also remove forest cover.'
    )
    source = evidence(
        'Forest causes',
        'Agricultural expansion, timber logging, mining and forest fires drive deforestation and remove forest cover.',
    )

    events = list(
        stream_connected(
            'Write a paragraph about deforestation',
            [source],
            'openai',
            'key',
            'model',
            lambda: SimpleNamespace(
                responses=SimpleNamespace(
                    create=lambda **kwargs: [
                        SimpleNamespace(type='response.output_text.delta', delta=draft)
                    ]
                )
            ),
            '',
            '',
        )
    )

    result = events[-1]
    assert result['mode'] == 'connected'
    assert result['answer'] == (
        'Agricultural expansion and timber logging are causes of deforestation. [1]\n'
        'Mining and forest fires also remove forest cover. [1]'
    )
    assert result['sources'][0]['source_id'] == 1


def test_partial_answer_keeps_supported_claims_and_marks_omitted_claims():
    draft = 'Agricultural expansion and logging drive deforestation [1]. The trees were exactly 500 years old [1].'
    source = evidence('Forest causes', 'Agricultural expansion and logging drive deforestation.')
    events = list(
        stream_connected(
            'Write a paragraph about deforestation',
            [source],
            'openai',
            'key',
            'model',
            lambda: SimpleNamespace(
                responses=SimpleNamespace(
                    create=lambda **kwargs: [
                        SimpleNamespace(type='response.output_text.delta', delta=draft)
                    ]
                )
            ),
            '',
            '',
        )
    )

    result = events[-1]
    assert result['mode'] == 'connected'
    assert result['answer'] == 'Agricultural expansion and logging drive deforestation [1].'
    assert 'Some claims were omitted' in result['coverage_note']


def test_valid_cited_answer_remains_synthesis():
    events = list(
        stream_connected(
            'Write about Kosovo',
            [evidence('Europe.pdf', 'Pristina is the capital of Kosovo.')],
            'openai',
            'key',
            'model',
            lambda: SimpleNamespace(
                responses=SimpleNamespace(
                    create=lambda **kwargs: [
                        SimpleNamespace(
                            type='response.output_text.delta', delta='Pristina is the capital. [1]'
                        )
                    ]
                )
            ),
            '',
            '',
        )
    )
    assert events[-1]['mode'] == 'connected'
    assert events[-1]['sources'][0]['title'] == 'Europe.pdf'
