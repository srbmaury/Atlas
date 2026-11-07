"""GitHub source-code search behavior and scope regressions."""

from app import external_sources


def test_code_search_is_recognized_without_misclassifying_issue_search():
    assert external_sources.github_wants_code("Find the function that validates uploads")
    assert external_sources.github_wants_code("Where is the OAuth callback implemented?")
    assert not external_sources.github_wants_code("Show my open pull requests")


def test_code_search_query_is_scoped_to_connected_account():
    query = external_sources.github_code_search_query(
        "Find the token refresh implementation", "atlas-user"
    )
    assert "token" in query
    assert "refresh" in query
    assert "user:atlas-user" in query
    assert "in:file" in query


def test_code_search_query_preserves_explicit_repository_scope():
    query = external_sources.github_code_search_query(
        "Find the retry function repo:owner/project", "atlas-user"
    )
    assert "repo:owner/project" in query
    assert "user:atlas-user" not in query


def test_github_code_search_returns_file_snippets_and_links(monkeypatch):
    calls = []

    def fake_http(url, token, provider, params=None, method="GET", accept="application/json"):
        calls.append((url, params, accept))
        if url.endswith("/user"):
            return {"login": "atlas-user"}
        assert url.endswith("/search/code")
        return {
            "items": [
                {
                    "sha": "abc123",
                    "path": "backend/app/auth.py",
                    "html_url": "https://github.com/atlas-user/project/blob/main/backend/app/auth.py",
                    "repository": {"full_name": "atlas-user/project"},
                    "text_matches": [{"fragment": "def refresh_access_token():\\n    return token"}],
                }
            ]
        }

    monkeypatch.setattr(external_sources, "http_json", fake_http)
    results = external_sources.source_search(
        "github", "secret-token", "Find the refresh_access_token function"
    )

    assert len(results) == 1
    assert results[0]["title"] == "atlas-user/project/backend/app/auth.py"
    assert "def refresh_access_token" in results[0]["excerpt"]
    assert results[0]["url"].endswith("/backend/app/auth.py")
    assert calls[1][1]["q"].endswith("user:atlas-user in:file")
    assert calls[1][2] == "application/vnd.github.text-match+json"
    assert all("secret-token" not in str(result) for result in results)
