"""Streaming Gmail answers include multiple sources and disclose bounded coverage."""

import json

from app.research import connected_synthesis
from app.research.source_contract import Evidence


def _gmail_rows(count):
    return [
        Evidence(
            'gmail',
            f'message{i}',
            f'CoinDCX account notice {i}',
            'CoinDCX advises enabling two-factor authentication.',
            f'https://mail.google.com/mail/u/0/#all/message{i}',
        )
        for i in range(count)
    ]


def test_gmail_stream_considers_more_than_three_messages(monkeypatch):
    prompts = []

    def fake_model(url, model, messages, deadline, cancellation):
        prompts.append(json.loads(messages[-1]['content'].split('\n/no_think')[0]))
        return 'CoinDCX advises enabling two-factor authentication [1].', False

    monkeypatch.setattr(connected_synthesis, '_ollama_stream_text', fake_model)
    events = list(
        connected_synthesis.stream_connected(
            'Summarize all emails from CoinDCX',
            _gmail_rows(6),
            'ollama',
            '',
            '',
            lambda: None,
            'http://localhost:11434',
            'model',
        )
    )
    assert len(prompts[0]['sources']) == 6
    assert events[-1]['mode'] == 'connected'
    assert len(events[-1]['sources']) == 6
    assert events[-1]['coverage_note'] is None


def test_gmail_stream_reports_when_source_cap_excludes_messages(monkeypatch):
    monkeypatch.setattr(
        connected_synthesis,
        '_ollama_stream_text',
        lambda *args: ('CoinDCX advises enabling two-factor authentication [1].', False),
    )
    result = list(
        connected_synthesis.stream_connected(
            'Summarize all emails from CoinDCX',
            _gmail_rows(18),
            'ollama',
            '',
            '',
            lambda: None,
            'http://localhost:11434',
            'model',
        )
    )[-1]
    assert result['mode'] == 'connected'
    assert len(result['sources']) == 12
    assert 'Only 12 of 18' in result['coverage_note']
