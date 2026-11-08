# Atlas source setup

Atlas supports uploaded documents and 11 connected sources. Atlas reads connected sources on demand. Connect a provider in **Sources**, then select it for a question in **Ask Atlas**. Atlas does not copy connected content into the document library or synchronize it in the background.

Set a stable, private `GMAIL_TOKEN_ENCRYPTION_KEY` on the backend before connecting a source. Generate it with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Set backend variables in `.env` for local development or in the service environment for hosted deployments. Keep secrets out of Git. Disconnecting deletes the saved credential in Atlas. Revoke the grant or token separately at the provider.

## Uploaded documents

Upload files from **Documents** in the workspace. Atlas indexes PDF, DOCX, TXT, Markdown, CSV, JSON, and HTML files. Scanned PDFs can use OCR when Tesseract is available. Once indexing finishes, select **Documents** in **Ask Atlas** to search the indexed text.

## Google Workspace

Use a Google Cloud OAuth client of type **Web application** and enable each API you use in the project that owns the client. For an External app in Testing, add the Google account under **Google Auth Platform → Audience → Test users**.

### Gmail

1. In [Google Cloud Console](https://console.cloud.google.com/), create or choose a project, enable the **Gmail API**, configure the OAuth consent screen, and create an OAuth client of type **Web application**.
2. Add this Authorized redirect URI for local development:

   ```text
   http://localhost:3000/api/gmail/callback
   ```

3. Add the client ID and secret to `.env`:

   ```dotenv
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/gmail/callback
   ```

4. Make sure `GMAIL_TOKEN_ENCRYPTION_KEY` is set, restart the API and frontend, then open **Sources → Gmail → Connect Gmail** and authorize read-only access.

Gmail search is opt-in per Ask Atlas question. Email is fetched on demand, not indexed automatically. The connector uses the restricted `gmail.readonly` scope; public deployments may need Google's verification and security assessment. Review Google's current requirements before publishing.

### Google Drive

Use the same Google Cloud project and OAuth Web application as Gmail. Enable the **Google Drive API** and add this additional Authorized redirect URI:

```text
http://localhost:3000/api/drive/callback
```

Set the Drive redirect in `.env` and restart:

```dotenv
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/api/drive/callback
```

Connect from **Sources → Google Drive**. Atlas uses read-only Drive access and reads files on demand. It can extract text from Google Docs, Sheets (CSV), PDF, DOCX, and supported text files. Slides and image-only Drive PDFs are not supported as Drive evidence. Drive access uses the restricted `drive.readonly` scope; review Google's verification and security-assessment requirements before public launch.

### Google Calendar

1. Enable the [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com). Atlas requests `https://www.googleapis.com/auth/calendar.readonly`.
2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the backend. These can be the same credentials used for Gmail and Drive.
3. Register the Calendar callback from the table below under **Authorized redirect URIs**. On a hosted deployment, also set `ATLAS_CONNECTED_OAUTH_REDIRECT_BASE` on the backend.
4. Open **Sources → Google Calendar**, connect the Google account, and grant read-only Calendar access. Atlas searches available event text from the primary calendar.

## Engineering and collaboration

### GitHub

Create a fine-grained personal access token scoped to the repositories Atlas should access, with read-only **Metadata**, **Issues**, **Pull requests**, and **Contents** permissions. Contents access is needed for source-code search. Add it under **Sources → GitHub**.

Atlas can search repositories, issues, pull requests, and source-code files. Code searches are scoped to the connected account by default; add an explicit `repo:owner/name` qualifier to narrow a search to one repository. Results and file snippets are limited to repositories and records visible to the token. Atlas never writes to connected repositories.

### Notion

Create an internal integration in [Notion My integrations](https://www.notion.so/profile/integrations), copy its secret, and share the pages or parent pages you want Atlas to read with that integration. Add the token under **Sources → Notion**.

Notion integrations only see pages shared with them. Atlas searches accessible page titles and reads page blocks on demand; a valid token does not grant automatic access to every workspace page.

### Slack

Slack message search requires a **user-scoped OAuth token** with the `search:read` user token scope. Bot tokens may authenticate but cannot use message search.

1. Create or open the Atlas app in the [Slack API console](https://api.slack.com/apps).
2. Under **OAuth & Permissions → User Token Scopes**, add `search:read`.
3. Reinstall the app to the intended workspace and authorize the requested access.
4. Copy the **User OAuth Token** (not the Bot User OAuth Token) and add it under **Sources → Slack**.

The user token can search content that the authorizing Slack user can access. Slack may require you to reauthorize Atlas after changing scopes.

### Linear

Obtain a [Linear OAuth access token](https://linear.app/developers/graphql#oauth) with read access and enter it under **Sources → Linear**. Atlas sends it as a bearer token. Atlas searches issue titles and descriptions accessible to the connected account.

### Jira

The Jira connector takes a bearer token in **Sources → Jira** and requires `ATLAS_JIRA_BASE_URL=https://TENANT.atlassian.net` on the backend. The token must be accepted by the configured host for profile and issue search requests. Atlas does not use email-and-token Basic authentication.

Standard Jira Cloud OAuth 2.0 (3LO) tokens use Atlassian's API gateway, which Atlas's current tenant-host configuration does not support. [Atlassian's API routing documentation](https://developer.atlassian.com/cloud/oauth/getting-started/making-calls-to-api/)

## Microsoft 365

1. Register a [Microsoft Entra Web application](https://learn.microsoft.com/en-us/graph/auth-register-app-v2) that supports the intended organizational accounts. Register the callback for each connector you plan to use.
2. Set `MICROSOFT_CLIENT_ID` and the confidential application's `MICROSOFT_CLIENT_SECRET` on the backend. For hosted deployments, also set `ATLAS_CONNECTED_OAUTH_REDIRECT_BASE`.
3. Configure the Microsoft Graph **delegated** permissions below and grant admin consent if your organization requires it.
4. Open the relevant connector in **Sources** and authorize with a work or school account.

| Source | Delegated Graph permissions | Search coverage |
| --- | --- | --- |
| OneDrive | `User.Read`, `Files.Read` | File metadata in the user's default drive |
| Outlook | `User.Read`, `Mail.Read` | Message subjects and previews |
| SharePoint | `User.Read`, `Sites.Read.All`, `Files.Read.All` | Accessible file metadata and search snippets |

Atlas also requests `openid`, `profile`, and `offline_access`. SharePoint and OneDrive do not extract full file contents through these connectors.

## OAuth callbacks

| Source | Local callback | Hosted callback path |
| --- | --- | --- |
| Gmail | `http://localhost:3000/api/gmail/callback` | `/api/gmail/callback` |
| Google Drive | `http://localhost:3000/api/drive/callback` | `/api/drive/callback` |
| Google Calendar | `http://localhost:3000/api/connected-oauth/calendar/callback` | `/api/connected-oauth/calendar/callback` |
| OneDrive | `http://localhost:3000/api/connected-oauth/onedrive/callback` | `/api/connected-oauth/onedrive/callback` |
| Outlook | `http://localhost:3000/api/connected-oauth/outlook/callback` | `/api/connected-oauth/outlook/callback` |
| SharePoint | `http://localhost:3000/api/connected-oauth/sharepoint/callback` | `/api/connected-oauth/sharepoint/callback` |

For hosted deployments, replace `https://atlas.example.com` with the public Atlas origin and apply the relevant variables on the backend:

```dotenv
GOOGLE_REDIRECT_URI=https://atlas.example.com/api/gmail/callback
GOOGLE_DRIVE_REDIRECT_URI=https://atlas.example.com/api/drive/callback
ATLAS_CONNECTED_OAUTH_REDIRECT_BASE=https://atlas.example.com/api/connected-oauth
```

Register the full HTTPS URL for each connector with its identity provider. Atlas appends `/<provider>/callback` to the connected OAuth base for Calendar and Microsoft sources. Apply the environment changes before starting a fresh connection.

If Google shows `redirect_uri_mismatch`, compare the redirect sent by Atlas with the exact URI saved on the OAuth client. If a Gmail or Calendar API call fails after consent, verify the corresponding API is enabled in the OAuth client's project and the account granted the requested scope.
