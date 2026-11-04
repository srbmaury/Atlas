"""Isolate configuration before any test module imports the application."""

import os
import tempfile

os.environ['DATA_DIR'] = tempfile.mkdtemp(prefix='atlas-test-')
os.environ['DATABASE_URL'] = os.getenv('ATLAS_TEST_DATABASE_URL') or (
    'sqlite:///' + os.environ['DATA_DIR'] + '/test.db'
)
os.environ['INLINE_WORKER'] = 'false'
os.environ['OPENAI_API_KEY'] = ''
os.environ['AI_PROVIDER'] = 'none'
