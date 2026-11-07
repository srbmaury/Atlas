"""GitHub source-code search behavior and scope regressions."""

from app import external_sources


def test_code_search_is_recognized_without_misclassifying_issue_search():
    assert external_sources.github_wants_code('Find the function that validates uploads')
    assert external_sources.github_wants_code('Where is the OAuth callback implemented?')
    assert not external_sources.github_wants_code('Show my open pull requests')


def test_code_search_query_is_scoped_to_connected_account():
    query = external_sources.github_code_search_query(
        'Find the token refresh implementation', 'atlas-user'
    )
    assert 'token' in query
    assert 'refresh' in query
    assert 'user:atlas-user' in query
    assert 'in:file' in query


def test_code_search_query_preserves_explicit_repository_scope():
    query = external_sources.github_code_search_query(
        'Find the retry function repo:owner/project', 'atlas-user'
    )
    assert 'repo:owner/project' in query
    assert 'user:atlas-user' not in query



def test_explicit_github_url_is_parsed_and_forces_repository_scope():
    question = 'Analyse my repo https://github.com/srbmaury/Atlas'
    assert external_sources.github_repository_from_query(question) == 'srbmaury/Atlas'
    assert external_sources.github_wants_code(question)
    assert external_sources.github_wants_flow(question)
    query = external_sources.github_code_search_query(question, 'connected-user')
    assert 'repo:srbmaury/Atlas' in query
    assert 'user:connected-user' not in query


def test_repository_only_flow_does_not_leak_results_from_other_repositories(monkeypatch):
    calls = []

    def fake_http(url, token, provider, params=None, method='GET', accept='application/json'):
        if url.endswith('/user'):
            return {'login': 'connected-user'}
        calls.append(params['q'])
        return {
            'items': [
                {
                    'sha': 'wrong',
                    'path': 'README.md',
                    'html_url': 'https://github.com/srbmaury/srbmaury/blob/main/README.md',
                    'repository': {'full_name': 'srbmaury/srbmaury'},
                    'text_matches': [{'fragment': 'wrong repository'}],
                },
                {
                    'sha': 'right',
                    'path': 'README.md',
                    'html_url': 'https://github.com/srbmaury/Atlas/blob/main/README.md',
                    'repository': {'full_name': 'srbmaury/Atlas'},
                    'text_matches': [{'fragment': 'Atlas repository'}],
                },
            ]
        }

    monkeypatch.setattr(external_sources, 'http_json', fake_http)
    results = external_sources.source_search(
        'github', 'secret-token', 'Analyse my repo https://github.com/srbmaury/Atlas'
    )
    assert len(results) == 1
    assert results[0]['scope'] == 'srbmaury/Atlas'
    assert results[0]['metadata']['path'] == 'README.md'
    assert 'import' in calls[0].split()
    assert 'README' not in calls[0].split()
    assert all('repo:srbmaury/Atlas' in query for query in calls)


def test_github_code_search_returns_file_snippets_and_links(monkeypatch):
    calls = []

    def fake_http(url, token, provider, params=None, method='GET', accept='application/json'):
        calls.append((url, params, accept))
        if url.endswith('/user'):
            return {'login': 'atlas-user'}
        assert url.endswith('/search/code')
        return {
            'items': [
                {
                    'sha': 'abc123',
                    'path': 'backend/app/auth.py',
                    'html_url': 'https://github.com/atlas-user/project/blob/main/backend/app/auth.py',
                    'repository': {'full_name': 'atlas-user/project'},
                    'text_matches': [
                        {'fragment': 'def refresh_access_token():\\n    return token'}
                    ],
                }
            ]
        }

    monkeypatch.setattr(external_sources, 'http_json', fake_http)
    results = external_sources.source_search(
        'github', 'secret-token', 'Find the refresh_access_token function'
    )

    assert len(results) == 1
    assert results[0]['title'] == 'atlas-user/project/backend/app/auth.py'
    assert 'def refresh_access_token' in results[0]['excerpt']
    assert results[0]['url'].endswith('/backend/app/auth.py')
    assert calls[1][1]['q'].endswith('user:atlas-user in:file')
    assert calls[1][2] == 'application/vnd.github.text-match+json'
    assert all('secret-token' not in str(result) for result in results)


def test_flow_trace_intent_and_layer_labels():
    assert external_sources.github_wants_flow('Trace the code flow for document upload')
    assert external_sources.github_wants_flow('Show the request flow end-to-end')
    assert not external_sources.github_wants_flow('Find the upload function')
    assert (
        external_sources.github_flow_layer('frontend/hooks/useConversation.ts') == 'Frontend / UI'
    )
    assert external_sources.github_flow_layer('backend/app/routes/documents.py') == 'API / routing'
    assert external_sources.github_flow_layer('backend/app/db.py') == 'Database / persistence'


def test_flow_search_follows_symbols_and_deduplicates_files(monkeypatch):
    calls = []

    def fake_http(url, token, provider, params=None, method='GET', accept='application/json'):
        calls.append((url, params, accept))
        if url.endswith('/user'):
            return {'login': 'atlas-user'}
        query = params['q']
        if 'upload' in query and 'send_question' not in query and 'DocumentService' not in query:
            return {
                'items': [
                    {
                        'sha': 'one',
                        'path': 'frontend/hooks/useConversation.ts',
                        'html_url': 'https://github.com/atlas-user/app/blob/main/frontend/hooks/useConversation.ts',
                        'repository': {'full_name': 'atlas-user/app'},
                        'text_matches': [
                            {
                                'fragment': "export function send_question() { return api('/documents'); }"
                            }
                        ],
                    },
                    {
                        'sha': 'two',
                        'path': 'backend/app/services/documents.py',
                        'html_url': 'https://github.com/atlas-user/app/blob/main/backend/app/services/documents.py',
                        'repository': {'full_name': 'atlas-user/app'},
                        'text_matches': [{'fragment': 'class DocumentService:'}],
                    },
                ]
            }
        symbol = 'send_question' if 'send_question' in query else 'DocumentService'
        path = (
            'backend/app/routes/documents.py' if symbol == 'send_question' else 'backend/app/db.py'
        )
        return {
            'items': [
                {
                    'sha': symbol,
                    'path': path,
                    'html_url': f'https://github.com/atlas-user/app/blob/main/{path}',
                    'repository': {'full_name': 'atlas-user/app'},
                    'text_matches': [{'fragment': f'# reference to {symbol}'}],
                }
            ]
        }

    monkeypatch.setattr(external_sources, 'http_json', fake_http)
    results = external_sources.source_search(
        'github', 'secret-token', 'Trace the code flow for upload documents'
    )

    assert len(results) == 4
    assert any(item['title'].startswith('[Frontend / UI]') for item in results)
    assert any(item['title'].startswith('[API / routing]') for item in results)
    assert any(item['title'].startswith('[Database / persistence]') for item in results)
    assert any('Reference lookup for' in item['excerpt'] for item in results)
    assert all('secret-token' not in str(item) for item in results)
    assert len(calls) == 4


def test_explicit_repository_code_search_falls_back_to_tree_and_contents(monkeypatch):
    import base64

    calls = []

    def fake_http(url, token, provider, params=None, method='GET', accept='application/json'):
        calls.append(url)
        if url.endswith('/user'):
            return {'login': 'connected-user'}
        if url.endswith('/search/code'):
            return {'items': []}
        if url.endswith('/repos/srbmaury/Atlas'):
            return {'default_branch': 'main'}
        if '/git/trees/main' in url:
            return {
                'tree': [
                    {'type': 'blob', 'path': 'README.md', 'size': 100},
                    {'type': 'blob', 'path': 'backend/app/main.py', 'size': 200},
                    {'type': 'blob', 'path': 'node_modules/pkg/index.js', 'size': 20},
                ]
            }
        if '/contents/' in url:
            path = url.rsplit('/contents/', 1)[1]
            body = f'# {path}\nThis file describes the Atlas application.'
            return {
                'encoding': 'base64',
                'content': base64.b64encode(body.encode()).decode(),
                'sha': 'blob-' + path,
                'html_url': f'https://github.com/srbmaury/Atlas/blob/main/{path}',
            }
        raise AssertionError(f'Unexpected GitHub endpoint: {url}')

    monkeypatch.setattr(external_sources, 'http_json', fake_http)
    results = external_sources.source_search(
        'github',
        'secret-token',
        'Find the refresh implementation in https://github.com/srbmaury/Atlas',
    )

    assert results
    assert all(item['scope'] == 'srbmaury/Atlas' for item in results)
    assert {item['metadata']['path'] for item in results} == {
        'README.md',
        'backend/app/main.py',
    }
    assert all('Repository file retrieved' in item['excerpt'] for item in results)
    assert all('secret-token' not in str(item) for item in results)
    assert any('/git/trees/main' in url for url in calls)


def test_repository_rating_intent_lists_owned_repositories():
    assert external_sources.github_wants_repositories('Rate my GitHub')
    assert external_sources.github_wants_repositories('Review my GitHub projects')


def test_explicit_repository_flow_falls_back_when_code_search_is_unindexed(monkeypatch):
    import base64

    def fake_http(url, token, provider, params=None, method='GET', accept='application/json'):
        if url.endswith('/user'):
            return {'login': 'connected-user'}
        if url.endswith('/search/code'):
            return {'items': []}
        if url.endswith('/repos/srbmaury/Atlas'):
            return {'default_branch': 'main'}
        if '/git/trees/main' in url:
            return {'tree': [{'type': 'blob', 'path': 'README.md', 'size': 40}]}
        if '/contents/README.md' in url:
            body = '# Atlas\\nRepository overview'
            return {
                'encoding': 'base64',
                'content': base64.b64encode(body.encode()).decode(),
                'sha': 'readme-sha',
                'html_url': 'https://github.com/srbmaury/Atlas/blob/main/README.md',
            }
        raise AssertionError(f'Unexpected GitHub endpoint: {url}')

    monkeypatch.setattr(external_sources, 'http_json', fake_http)
    results = external_sources.source_search(
        'github',
        'secret-token',
        'Analyse my repo https://github.com/srbmaury/Atlas',
    )
    assert len(results) == 1
    assert results[0]['scope'] == 'srbmaury/Atlas'
    assert results[0]['metadata']['path'] == 'README.md'
