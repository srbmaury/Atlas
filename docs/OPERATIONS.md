# Operations checklist

Atlas readiness endpoint: `GET /api/health/ready` checks database access and
the current Alembic revision. Liveness: `GET /api/health/live`.
Workspace owners can inspect ingestion and source-health counts with
`GET /api/workspaces/{workspaceId}/operations`.

## Supabase on Render

Use a dedicated Supabase project with the Data API disabled and the `vector`
extension enabled. In Render, set `DATABASE_URL` to the Supabase **Session
pooler** URI on port 5432. Use the `postgresql+psycopg://` scheme and
`sslmode=require`. Atlas runs Alembic migrations at startup.

For original documents, create a **private** Storage bucket and set these
backend variables:

| Variable | Value |
| --- | --- |
| `ATLAS_STORAGE_URL` | Supabase project HTTPS origin, without a path |
| `ATLAS_STORAGE_BUCKET` | Private bucket name, such as `atlas-documents` |
| `ATLAS_STORAGE_KEY` | Supabase server-side secret key |

Store the database URL and storage key in Render's environment settings. Keep
the storage key out of browser code and Git. If all three storage variables are
unset, Atlas uses local files. Configure all three on the API and on any
separate ingestion worker. Temporary uploads remain local until finalized.
Use the same `GMAIL_TOKEN_ENCRYPTION_KEY` across deploys to keep saved connector
credentials readable.

## Verified sign-in with Supabase Auth

Atlas uses its own workspace permissions and session cookie. Supabase Auth
handles email verification, password reset and Google authentication. Keep the
Supabase Data API disabled for the Atlas database.

In the backend environment, configure:

| Variable | Value |
| --- | --- |
| `ATLAS_AUTH_URL` | Supabase project HTTPS origin |
| `ATLAS_AUTH_KEY` | Supabase publishable key (`sb_publishable_…`) |
| `ATLAS_AUTH_ORIGIN` | Atlas public HTTPS origin |

These are separate from the database URL and private Storage key. Configure all
three before deploying with `COOKIE_SECURE=true`. With no auth variables, local
development with `COOKIE_SECURE=false` can still use local sign-in.

For local development with the Atlas frontend on `http://localhost:3000`,
use these URLs in the repository-root `.env` (the auth origin is only needed
when Supabase Auth is configured):

```dotenv
ATLAS_AUTH_ORIGIN=http://localhost:3000
ATLAS_CONNECTED_OAUTH_REDIRECT_BASE=http://localhost:3000/api/connected-oauth
GOOGLE_REDIRECT_URI=http://localhost:3000/api/gmail/callback
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/api/drive/callback
```

The connected OAuth base expands into provider-specific callback URLs such as
`http://localhost:3000/api/connected-oauth/calendar/callback` and
`http://localhost:3000/api/connected-oauth/onedrive/callback`. Register
each required callback with its Google or Microsoft OAuth client. Supabase
Google sign-in uses a **different** Google Cloud authorized redirect:
`https://<supabase-project>.supabase.co/auth/v1/callback` (use the
exact callback shown in the Supabase dashboard).

In the Supabase dashboard:

1. Under **Authentication**, enable email signup and **Confirm email**. Keep
   email confirmation enabled. Atlas only provisions workspaces after Supabase
   reports a verified address.
2. Set the **Site URL** to the Atlas public origin. Allow these redirect URLs
   under **Authentication → URL Configuration**, using your own origin:

   ```text
   https://atlas.example.com/auth/complete?mode=confirm
   https://atlas.example.com/auth/complete?mode=reset
   https://atlas.example.com/api/auth/google/callback
   ```

3. The default Supabase email templates work with Atlas. Open those links in
   the same browser that requested the email, since Atlas uses PKCE. With
   custom SMTP, you can optionally customize **Confirm signup** and
   **Reset password** templates to use
   the corresponding link below. The token is in the URL fragment, which
   keeps it out of HTTP request URLs. Turn off click tracking for these links.

   ```html
   <a href="{{ .RedirectTo }}#token_hash={{ .TokenHash }}">Verify your email</a>
   ```

   ```html
   <a href="{{ .RedirectTo }}#token_hash={{ .TokenHash }}">Reset your password</a>
   ```

4. Enable **Google** under Auth providers. Create a Google OAuth web client
   and add the callback Supabase shows as an authorized redirect URI in
   Google Cloud. The URL ends in `/auth/v1/callback` on the Supabase project
   domain. Enter the Google client ID and secret in Supabase. This is separate
   from Atlas's Gmail and Calendar connector callbacks.
5. Set up **custom SMTP in Supabase Auth** for real users. The built-in sender
   is suitable for testing with project team addresses.

Existing Atlas-only accounts need an explicit migration. Atlas refuses to link
a Supabase identity to an older account based solely on a matching email.
Verify signup, reset, and Google sign-in on a test deployment before enabling
this configuration for users.

### Account deletion

**Settings → Account → Delete account** requires a sign-in within the previous
10 minutes and confirmation of the account email. Transfer or delete any owned
organisations and shared workspaces first. Atlas removes the private workspaces,
saved conversations, connector credentials, sessions, and the Supabase Auth identity.

For Supabase Auth accounts, Atlas uses the existing `ATLAS_STORAGE_KEY` if
Storage and Auth point at the same project. Otherwise configure
`ATLAS_AUTH_ADMIN_KEY` with a server-side `sb_secret_…` key from the Auth project.
Keep it private. Provider grants and prior backups have their own retention
and revocation procedures.

## Backups and recovery

Atlas needs **both** its database and its uploaded originals. Originals live in `DATA_DIR/files` for local storage or the private bucket when Supabase Storage is enabled. Back up both together so document records still point to existing files.

For local SQLite: `python ops/backup_sqlite.py data/atlas.db backups/atlas.db`.
The script refuses to overwrite an existing backup and checks SQLite integrity.
Separately back up `DATA_DIR/files` and the encryption key using restricted access.
Test restoration by stopping all Atlas processes, restoring into an isolated data
directory, and verifying documents, credentials and readiness. Do not restore over a
running database.

For PostgreSQL, use your infrastructure's supported `pg_dump`/`pg_restore`
or snapshot procedure, paired with a consistent file-storage snapshot. When using
Supabase Auth, verify that your recovery procedure also preserves the corresponding
Auth identities. Test sign-in and document downloads in a separate environment
before relying on the backup.

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
