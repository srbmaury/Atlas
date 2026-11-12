from types import SimpleNamespace
from unittest.mock import patch

from app.worker import queue_snapshot


class FakeQuery:
    def all(self):
        return [
            SimpleNamespace(status='queued', lease=0, attempts=1),
            SimpleNamespace(status='processing', lease=50, attempts=1),
            SimpleNamespace(status='processing', lease=150, attempts=1),
            SimpleNamespace(status='failed', lease=0, attempts=3),
            SimpleNamespace(status='ready', lease=0, attempts=1),
        ]


class FakeSession:
    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def query(self, *_):
        return FakeQuery()


def test_queue_snapshot_counts_expired_leases_and_terminal_failures():
    with patch('app.worker.Session', return_value=FakeSession()):
        result = queue_snapshot(now=100)
    assert result == {
        'queued': 1,
        'processing': 2,
        'failed': 1,
        'ready': 1,
        'expired_leases': 1,
        'retry_pending': 1,
        'terminal_failures': 1,
    }
