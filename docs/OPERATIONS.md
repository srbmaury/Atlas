# Operations checklist

Atlas readiness endpoint: `GET /api/health/ready` checks database access and
the current Alembic revision. Liveness: `GET /api/health/live`.
Workspace owners can inspect ingestion and source-health counts with
`GET /api/workspaces/{workspaceId}/operations`.

## Backups and recovery

Atlas needs **both** its database and its uploaded files in `DATA_DIR/files`.
Backing up one without the other may cause missing or orphaned documents.

For local SQLite: `python ops/backup_sqlite.py data/atlas.db backups/atlas.db`.
The script refuses to overwrite an existing backup and checks SQLite integrity.
Separately back up `DATA_DIR/files` and the encryption key using restricted access.
Test restoration by stopping all Atlas processes, restoring into an isolated data
directory, and verifying documents, credentials and readiness. Do not restore over a
running database.

For PostgreSQL, use your infrastructure's supported `pg_dump`/`pg_restore`
or snapshot procedure, paired with a consistent file-storage snapshot. Validate
restores in a separate environment before relying on them.

## Security and deployment

- Deploy the frontend/backend behind HTTPS and set `COOKIE_SECURE=true`.
- Keep `GMAIL_TOKEN_ENCRYPTION_KEY`, OAuth secrets and database credentials out of
  repositories, container images and logs; back up the encryption key securely.
- Apply an outbound IP firewall blocking private/link-local/metadata addresses
  **before** enabling `ATLAS_WEB_EGRESS_PROTECTED=true`. That flag does not
  itself install an egress firewall.
- Restrict OAuth callback origins to your public HTTPS domain.
- Limit API concurrency and upload sizes at the reverse proxy; separate worker
  capacity from interactive API capacity.
- Configure external log/metrics collection and alerts for readiness failures,
  failed ingestion, high 429/5xx rates, and sustained latency.
- Test provider revocation, token rotation, backup restoration and worker restarts
  using real infrastructure before a public launch.

Public webpage import is disabled unless an outbound firewall or proxy blocks
private, loopback, link-local and metadata IP ranges, including after redirects
and DNS changes. Imports accept HTML under 2 MB with at least 40 characters of
extracted text; authenticated pages and JavaScript-rendered pages are unsupported.

## Load smoke test

Run `load_tests/locustfile.py` only against an isolated Atlas environment you own.
Set `ATLAS_TEST_EMAIL`, `ATLAS_TEST_PASSWORD`, and
`ATLAS_TEST_WORKSPACE_ID`, then start Locust at a low user count. Increase load
gradually while monitoring latency, errors, resource use and ingestion backlog.
Do not stress public third-party APIs.

These steps are deployment requirements, not claims of completed infrastructure.
