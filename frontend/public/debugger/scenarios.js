const api = 'backend/app/';
const web = 'frontend/';

const step = (id, path, anchor, title, detail, input, state, output, metadata = {}) => ({
    id,
    path,
    anchor,
    title,
    detail,
    values: { input, state, output },
    ...metadata,
});

const uiStep = (id, screen, action, path, anchor, detail, input, state, output) => ({
    ...step(id, web + path, anchor, action, detail, input, state, output),
    screen,
});

const linearScenarios = [
    {
        id: 'sign-in',
        title: 'Google sign-in and session',
        steps: [
            uiStep(
                'click-continue-with-google',
                'Sign-in screen',
                'Click Continue with Google',
                'components/auth/AuthView.tsx',
                'href="/api/auth/google"',
                'The Google button is shown when verified sign-in is configured. It navigates to the Atlas OAuth entry point.',
                {},
                { verifiedAuth: true },
                { method: 'GET', path: '/api/auth/google' },
            ),
            step(
                'start-oauth',
                api + 'routes/auth.py',
                'def google():',
                'Start OAuth',
                'Atlas creates a PKCE challenge and redirects the browser to Supabase.',
                { route: '/api/auth/google' },
                { verifier: '[redacted]', provider: 'google' },
                { redirect: 'Supabase authorize endpoint' },
            ),
            step(
                'exchange-the-callback-code',
                api + 'routes/auth.py',
                'def google_callback(',
                'Exchange the callback code',
                'The callback retrieves the verifier and exchanges the code for a verified identity.',
                { code: '[redacted]' },
                { verifier: '[redacted]' },
                { verifiedIdentity: { id: 'user-42' } },
            ),
            step(
                'resolve-the-atlas-account',
                api + 'routes/auth.py',
                'def verified_account(',
                'Resolve the Atlas account',
                'Atlas resolves the verified identity to a local account so it can use workspace roles and ownership.',
                { id: 'user-42', email: 'reader@example.test' },
                { identityVerified: true },
                { atlasUser: 'user-42' },
            ),
            step(
                'issue-an-atlas-session',
                api + 'routes/auth.py',
                'def issue_login(',
                'Issue an Atlas session',
                'Atlas persists a session and gives the browser an HTTP-only cookie.',
                { user: 'user-42' },
                { token: '[redacted]' },
                { cookie: '[redacted]', httpOnly: true },
            ),
            step(
                'authenticate-the-next-request',
                api + 'api_dependencies.py',
                'def user(',
                'Authenticate the next request',
                'The API resolves the cookie to an active login and user.',
                { cookie: '[redacted]' },
                { expired: false },
                { actor: 'user-42' },
            ),
        ],
    },
    {
        id: 'workspace',
        title: 'Workspace membership and access',
        steps: [
            uiStep(
                'submit-create-workspace',
                'Workspace manager',
                'Submit Create workspace',
                'components/layout/WorkspaceManagerDialog.tsx',
                'onSubmit={onCreate}',
                'The workspace form forwards the name and selected organisation to the workspace creation handler.',
                { name: 'Engineering', organisation_id: 'org-1' },
                { form: 'Create workspace' },
                { handler: 'onCreate' },
            ),
            step(
                'post-workspace',
                web + 'components/auth/sessionActions.ts',
                'async function addWorkspace(',
                'Submit the workspace request',
                'The dialog calls the workspace handler, which posts the name and optional organisation ID.',
                {},
                {},
                { request: 'POST /workspaces' },
                { lines: 2 },
            ),
            step(
                'create-a-workspace',
                api + 'routes/workspaces.py',
                'def create_workspace(',
                'Create a workspace',
                'A workspace has its own owner. An organisation workspace also carries an organisation ID.',
                { name: 'Engineering', organisation_id: 'org-1' },
                { actor: 'owner-1' },
                { workspace: 'ws-1' },
            ),
            uiStep(
                'choose-workspace-member',
                'Workspace settings → Members',
                'Submit the workspace membership form',
                'components/layout/AccessManagement.tsx',
                'Add or update member',
                'A manager selects the viewer role and submits the registered member’s email address.',
                { email: 'reader@example.test', role: 'viewer' },
                { workspace: 'ws-1' },
                { request: 'PUT /members' },
            ),
            step(
                'assign-a-workspace-role',
                api + 'routes/access.py',
                'def grant_workspace_member(',
                'Assign a workspace role',
                'A manager grants a registered account access to this workspace.',
                { email: 'reader@example.test', role: 'viewer' },
                { actorRole: 'manager' },
                { workspace: 'ws-1', member: 'user-42' },
            ),
            step(
                'resolve-the-effective-role',
                api + 'rbac.py',
                'def workspace_role(',
                'Resolve the effective role',
                'Atlas checks ownership and the workspace membership. Organisation membership does not create a workspace role.',
                { actor: 'user-42', workspace: 'ws-1' },
                { memberRole: 'viewer' },
                { role: 'viewer' },
            ),
            step(
                'enforce-the-minimum-role',
                api + 'rbac.py',
                'def require_workspace(',
                'Enforce the minimum role',
                'A viewer can ask questions, while an upload requires editor access.',
                { role: 'viewer', minimum: 'editor' },
                { allowed: false },
                { status: 403 },
            ),
        ],
    },
    {
        id: 'upload',
        title: 'Upload, OCR, and indexing',
        steps: [
            uiStep(
                'choose-a-file-with-add-documents',
                'Documents',
                'Choose a file with Add documents',
                'components/AtlasWorkspace.tsx',
                'void upload(e.target.files)',
                'The file input passes selected files to the upload handler when the workspace role permits editing.',
                { file: 'policy.pdf', size: 184320 },
                { canEdit: true },
                { handler: 'upload' },
            ),
            step(
                'receive-an-uploaded-file',
                api + 'routes/documents.py',
                'async def upload(',
                'Receive an uploaded file',
                'The workspace editor uploads a supported file. Atlas validates the filename and stages the bytes before storing the original.',
                { file: 'policy.pdf', workspace: 'ws-1' },
                { bytes: 184320, actorRole: 'editor' },
                { document: 'doc-1', staged: true },
            ),
            step(
                'store-the-original',
                api + 'original_storage.py',
                'def store_original(',
                'Store the original',
                'Original storage uses the configured private bucket when available. Local mode uses the staged file on disk.',
                { document: 'doc-1', file: 'policy.pdf' },
                { storage: 'private bucket' },
                { objectKey: 'doc-1' },
            ),
            step(
                'claim-a-processing-lease',
                api + 'worker.py',
                'def claim(',
                'Claim a processing lease',
                'A worker claims queued work and uses its generation to protect against stale attempts.',
                { document: 'doc-1', status: 'queued' },
                { lease: 'active', generation: 1 },
                { status: 'processing' },
            ),
            step(
                'extract-text-and-ocr',
                api + 'ingest.py',
                'def extract(',
                'Extract text and OCR',
                'The parser extracts PDF text and can apply OCR to image-only pages.',
                { file: 'policy.pdf' },
                { page: 2, OCR: true },
                { text: 'The notice period is 30 days.' },
            ),
            step(
                'persist-passages',
                api + 'ingest.py',
                'def ingest(',
                'Persist passages',
                'Ingestion splits extracted text, optionally embeds the passages, and marks the document ready.',
                { document: 'doc-1', generation: 1 },
                { passages: 4 },
                { status: 'ready' },
            ),
        ],
    },
    {
        id: 'staged-upload',
        title: 'Staged upload and resume',
        steps: [
            uiStep(
                'choose-a-large-file-with-add-documents',
                'Documents',
                'Choose a large file with Add documents',
                'components/AtlasWorkspace.tsx',
                'void upload(e.target.files)',
                'A large file starts at the same picker. The upload handler selects the staged upload path based on file size.',
                { file: 'manual.pdf', size: 33554432 },
                { canEdit: true },
                { handler: 'upload' },
            ),
            step(
                'create-an-upload-session',
                api + 'uploads.py',
                'def start(',
                'Create an upload session',
                'Atlas records the expected size and owner of the staged upload.',
                { name: 'manual.pdf', size: 33554432 },
                { workspace: 'ws-1', owner: 'user-42' },
                { upload: 'upload-1', offset: 0 },
            ),
            step(
                'append-the-next-part',
                api + 'uploads.py',
                'def append(',
                'Append the next part',
                'The session checks the supplied offset before writing bytes. The client can query the accepted offset before resuming.',
                { upload: 'upload-1', offset: 0, bytes: 1048576 },
                { currentOffset: 0 },
                { offset: 1048576 },
            ),
            step(
                'finalize-the-file',
                api + 'uploads.py',
                'def finish(',
                'Finalize the file',
                'Once the recorded size is complete, Atlas stores the original and creates a queued document.',
                { upload: 'upload-1', offset: 33554432 },
                { expectedBytes: 33554432 },
                { document: 'doc-1', status: 'queued' },
            ),
        ],
    },
    {
        id: 'answer',
        title: 'Ask a question and verify citations',
        steps: [
            uiStep(
                'enter-a-question-and-press-send',
                'Ask Atlas',
                'Enter a question and press Send',
                'components/chat/ResearchComposer.tsx',
                'onSubmit={(e) => {',
                'The composer enables Send when a question and source scope are available. Submitting hands control to the research workspace.',
                { question: 'What is the notice period?' },
                { hasAskSources: true, busy: false },
                { handler: 'onSubmit' },
            ),
            step(
                'dispatch-composer-question',
                web + 'components/chat/ResearchWorkspace.tsx',
                'onSubmit={() => props.onAsk()}',
                'Hand the composer submission to Ask Atlas',
                'The workspace connects the composer submit callback to the research action.',
                { question: 'What is the notice period?' },
                { busy: false },
                { handler: 'onAsk' },
                { lines: 1 },
            ),
            step(
                'send-the-selected-source-scope',
                web + 'lib/researchRequests.ts',
                'function requestResearchAnswer(',
                'Send the selected source scope',
                'The frontend sends the question and selected sources to the connected-chat stream.',
                { question: 'What is the notice period?', include_documents: true, providers: ['slack'] },
                { workspace: 'ws-1' },
                { response: 'NDJSON stream' },
            ),
            step(
                'call-connected-chat-endpoint',
                web + 'lib/researchRequests.ts',
                '/connected-chat/stream`',
                'Open the connected chat stream',
                'The mixed-source request posts the question and selected source flags to the streaming route.',
                { providers: ['slack'], include_documents: true },
                { useConnected: true },
                { response: 'NDJSON stream' },
                { lines: 2 },
            ),
            step(
                'start-the-answer-stream',
                api + 'routes/chat.py',
                'def connected_chat_stream(',
                'Start the answer stream',
                'The API reports retrieval progress and orchestrates evidence collection, access checks, and answer generation.',
                { workspace: 'ws-1' },
                { actor: 'user-42' },
                { event: 'status' },
            ),
            step(
                'collect-permitted-evidence',
                api + 'connected_research.py',
                'def collect_connected_evidence(',
                'Collect permitted evidence',
                'Atlas retrieves document passages and queries selected live providers using the caller’s effective connection scope.',
                { documents: true, providers: ['slack'] },
                { slackChannelIds: ['C123'] },
                { providersWithEvidence: ['documents', 'slack'] },
            ),
            step(
                'rank-document-passages',
                api + 'retrieval.py',
                'def retrieve(',
                'Rank document passages',
                'The document branch limits retrieval to ready documents in the workspace and ranks candidate passages.',
                { workspace: 'ws-1', query: 'notice period' },
                { status: 'ready' },
                { chunk: 'chunk-7', page: 2 },
            ),
            step(
                'generate-a-grounded-answer',
                api + 'connected_synthesis.py',
                'def stream_connected(',
                'Generate a grounded answer',
                'The model receives numbered evidence. Atlas buffers its draft while the API can send status updates. The draft stays buffered until Atlas checks the citation references.',
                { evidence: [{ number: 1, text: 'The notice period is 30 days.' }] },
                { model: 'configured provider' },
                { draft: 'The notice period is 30 days. [1]' },
            ),
            step(
                'release-checked-answer',
                api + 'connected_synthesis.py',
                "if mode == 'connected':",
                'Release the citation-checked answer',
                'Only the connected result emits answer text as a delta. A complete event carries the final result.',
                { citationReferencesValid: true },
                { draft: 'buffered' },
                { events: ['delta', 'complete'] },
                { lines: 2 },
            ),
            step(
                'render-citations',
                web + 'components/chat/ResearchAnswer.tsx',
                'function ResearchAnswer(',
                'Render citations',
                'Atlas renders the answer and links its numbered citations to evidence the user can inspect.',
                { answer: 'The notice period is 30 days. [1]' },
                { sourceCount: 1 },
                { citation: 1, opens: 'Evidence inspector' },
            ),
        ],
    },
    {
        id: 'connect-source',
        title: 'Connect Drive and search it live',
        steps: [
            uiStep(
                'click-connect-google-drive',
                'Connected sources → Google Drive',
                'Click Connect Google Drive',
                'components/sources/SourceConnectionDialog.tsx',
                'onClick={onConnectDrive}',
                'The Drive dialog calls the connection handler when the provider is configured.',
                {},
                { configured: true },
                { handler: 'onConnectDrive' },
            ),
            step(
                'request-drive-authorization',
                web + 'components/sources/useConnectedSourcesController.ts',
                '/drive/connect?workspaceId=',
                'Request the Drive authorization URL',
                'The dialog handler calls Atlas for an authorization URL, then redirects the browser to it.',
                {},
                {},
                { request: 'GET /drive/connect' },
                { lines: 2 },
            ),
            step(
                'start-drive-oauth',
                api + 'connectors/drive.py',
                'def connect(',
                'Start Drive OAuth',
                'Atlas creates an expiring state associated with the caller and workspace before redirecting to Google.',
                { workspace: 'ws-1' },
                { actor: 'owner-1', state: '[redacted]' },
                { redirect: 'Google OAuth' },
            ),
            step(
                'store-the-connection',
                api + 'connectors/drive.py',
                'def callback(',
                'Store the connection',
                'The callback validates the state and stores the encrypted refresh credential. The connection starts private.',
                { state: '[redacted]', code: '[redacted]' },
                { credential: '[encrypted]' },
                { provider: 'drive', shared: false },
            ),
            uiStep(
                'ask-with-drive',
                'Ask Atlas → Source selector',
                'Select Drive and ask about the policy',
                'components/chat/ResearchSourceSelector.tsx',
                'onToggleProvider(p, e.target.checked)',
                'The connection is now available to its owner. Select Drive, then send a question to initiate retrieval.',
                { provider: 'drive', question: 'Find the policy' },
                { connected: true },
                { providers: ['drive'] },
            ),
            step(
                'resolve-search-access',
                api + 'connectors/drive.py',
                'def access_token(',
                'Resolve search access',
                'Atlas checks workspace and connection visibility, then exchanges the refresh credential for a provider access token.',
                { workspace: 'ws-1' },
                { permissionGranted: true },
                { token: '[redacted]' },
            ),
            step(
                'search-and-filter-files',
                api + 'connectors/drive.py',
                'def drive_search(',
                'Search the owner’s Drive',
                'Atlas queries Drive with the owner’s credential. Shared member searches additionally apply the file allowlist.',
                { query: 'policy' },
                { actor: 'connection owner' },
                { visibleFileIds: ['file-1'] },
            ),
            step(
                'read-matching-content',
                api + 'connectors/drive.py',
                'def drive_evidence(',
                'Read matching content',
                'Atlas extracts supported text from selected Drive files to use as answer evidence.',
                { file: 'file-1', mimeType: 'text/plain' },
                { fetched: true },
                { excerpt: 'The notice period is 30 days.' },
            ),
        ],
    },
    {
        id: 'scope',
        title: 'Share Slack channels and revoke access',
        steps: [
            uiStep(
                'save-the-slack-channel-scope',
                'Workspace settings → Source permissions',
                'Save the Slack channel scope',
                'components/layout/SourceSharingControls.tsx',
                'onChange(connection, ids.length',
                'The form parses channel IDs and passes the list and selected audience to the sharing handler.',
                { resource_ids: 'C123' },
                { provider: 'slack', existingMemberIds: ['user-42'] },
                { resourceIds: ['C123'], memberIds: ['user-42'] },
            ),
            step(
                'save-sharing-scope',
                api + 'routes/access.py',
                'def share_connection(',
                'Save sharing scope',
                'Only the credential owner can change sharing. The request records workspace recipients and selected channel IDs.',
                { provider: 'slack', shared: false, member_ids: ['user-42'], resource_ids: ['C123'] },
                { actor: 'owner-1' },
                { allowedChannels: ['C123'] },
            ),
            uiStep(
                'ask-with-shared-slack',
                'Ask Atlas → Source selector',
                'Ask a question using shared Slack',
                'components/chat/ResearchSourceSelector.tsx',
                'onToggleProvider(p, e.target.checked)',
                'An allowed member selects Slack and submits a question. Search runs using the sharing settings that are current at request time.',
                { provider: 'slack', question: 'What is the budget?' },
                { actor: 'user-42' },
                { providers: ['slack'] },
            ),
            step(
                'snapshot-effective-access',
                api + 'rbac.py',
                'def source_scope(',
                'Snapshot effective access',
                'Atlas records the effective allowlist and credential version so it can detect changes while processing.',
                { actor: 'user-42', provider: 'slack' },
                { isOwner: false },
                { allowedChannels: ['C123'] },
            ),
            step(
                'filter-upstream-results',
                api + 'connectors/external_sources.py',
                'def source_search(',
                'Filter upstream results',
                'The Slack adapter keeps verified results from allowed channel IDs and excludes direct and group messages.',
                { allowedChannels: ['C123'] },
                { upstreamChannelIds: ['C123', 'C456', 'D123'] },
                { retainedChannelIds: ['C123'] },
            ),
            step(
                'recheck-before-returning-an-answer',
                api + 'rbac.py',
                'def revalidate_access(',
                'Recheck before returning an answer',
                'If scope changes during a search, Atlas checks again before releasing results and rejects the stale request.',
                { originalScope: ['C123'] },
                { currentScope: ['C456'] },
                { status: 409 },
            ),
        ],
    },
    {
        id: 'saved-chat',
        title: 'Save and reopen a private chat',
        steps: [
            uiStep(
                'send-a-question-to-start-a-chat',
                'Ask Atlas',
                'Send a question to start a chat',
                'components/chat/ResearchComposer.tsx',
                'onSubmit={(e) => {',
                'Sending a question starts the turn. For a new chat, Atlas saves the submitted question before requesting the answer.',
                { question: 'What is the notice period?' },
                { activeChat: null },
                { handler: 'onSubmit' },
            ),
            step(
                'persist-the-transcript',
                web + 'lib/researchRequests.ts',
                'function persistConversation(',
                'Persist the transcript',
                'The client creates a new conversation or updates an existing one with its messages.',
                { title: 'Policy research', messages: [{ role: 'user', content: 'What is the notice period?' }] },
                { existingId: null },
                { method: 'POST' },
            ),
            step(
                'assign-the-authenticated-author',
                api + 'routes/conversations.py',
                'def create_conversation(',
                'Assign the authenticated author',
                'Atlas stores the conversation in the workspace and assigns the authenticated user as author.',
                { workspace: 'ws-1', title: 'Policy research' },
                { actor: 'user-42' },
                { id: 'chat-1', author_id: 'user-42' },
            ),
            step(
                'request-answer-after-saving-question',
                web + 'components/chat/conversationActions.ts',
                'result = await requestResearchAnswer(',
                'Request the answer for the saved turn',
                'The first question already has a conversation ID when Atlas starts its regular research request.',
                { question: 'What is the notice period?' },
                { conversation: 'chat-1', persistedMessages: ['user'] },
                { answer: 'The notice period is 30 days. [1]' },
                { lines: 2 },
            ),
            step(
                'update-completed-transcript',
                web + 'components/chat/conversationActions.ts',
                'const saved = await persistConversation(target, id, title, completed)',
                'Update the chat after generation',
                'When generation completes, Atlas updates the existing conversation with the answer and its result metadata.',
                { id: 'chat-1', method: 'PUT' },
                { messages: ['user'] },
                { messages: ['user', 'assistant'] },
                { lines: 2, transition: { before: { messages: ['user'] }, after: { messages: ['user', 'assistant'] } } },
            ),
            uiStep(
                'open-the-saved-conversation',
                'Ask Atlas → Conversation history',
                'Open the saved conversation',
                'components/chat/ConversationHistory.tsx',
                'onClick={() => (selecting ? toggleSelection(item.id) : onOpenChat(item.id))}',
                'Clicking a history row opens it when bulk selection is off.',
                { id: 'chat-1' },
                { selecting: false },
                { handler: 'onOpenChat' },
            ),
            step(
                'fetch-saved-conversation',
                web + 'components/chat/conversationActions.ts',
                'const item = await api<SavedChat>',
                'Request the selected conversation',
                'The history click reaches the loader, which fetches the conversation by workspace and ID.',
                { workspace: 'ws-1', id: 'chat-1' },
                { actor: 'user-42' },
                { request: 'GET /conversations/chat-1' },
                { lines: 2 },
            ),
            step(
                'enforce-private-history',
                api + 'routes/conversations.py',
                'def owned_conversation(',
                'Enforce private history',
                'Atlas looks up the conversation by workspace, ID, and caller. The author receives the transcript. A different member would get a 404.',
                { conversation: 'chat-1', actor: 'user-42' },
                { author: 'user-42' },
                { status: 200 },
            ),
            step(
                'restore-the-conversation',
                web + 'components/chat/conversationActions.ts',
                'setMessages(item.messages);',
                'Restore the conversation',
                'After loading an authorized chat, the client restores its messages and source scope.',
                { id: 'chat-1', actor: 'user-42' },
                { lastAnswerScope: ['documents'] },
                { activeChat: 'chat-1' },
            ),
        ],
    },
    {
        id: 'web-import',
        title: 'Import a public webpage',
        steps: [
            uiStep(
                'paste-a-url-and-click-add-url',
                'Documents → Web page import',
                'Paste a URL and click Add URL',
                'components/documents/WebPageImportForm.tsx',
                'onSubmit={onSubmit}',
                'The form passes the URL to the import handler, which submits it to the workspace API.',
                { url: 'https://example.test/policy' },
                { busy: false },
                { handler: 'onSubmit' },
            ),
            step(
                'post-webpage-url',
                web + 'components/documents/documentActions.ts',
                '/web-pages`',
                'Submit the URL to the workspace API',
                'The form handler sends the entered URL to the workspace import route.',
                {},
                {},
                { request: 'POST /web-pages' },
                { lines: 2 },
            ),
            step(
                'authorize-the-import',
                api + 'web_sources.py',
                'return save_webpage(workspaceId, body.url, db)',
                'Hand the authorized URL to the importer',
                'The editor-only route accepts a public webpage URL when import is enabled.',
                { url: 'https://example.test/policy' },
                { actorRole: 'editor' },
                { next: 'fetch_page' },
            ),
            step(
                'start-webpage-fetch',
                api + 'web_sources.py',
                'title, body = fetch_page(url)',
                'Call the webpage fetcher',
                'The importer asks the fetcher for a title and readable text before it creates a document.',
                { url: 'https://example.test/policy' },
                { documentCreated: false },
                { next: 'fetch_page' },
                { lines: 1 },
            ),
            step(
                'fetch-and-extract-readable-text',
                api + 'web_sources.py',
                'def fetch_page(',
                'Fetch and extract readable text',
                'The fetcher checks the destination and redirects, then extracts readable HTML content.',
                { url: 'https://example.test/policy' },
                { contentType: 'text/html', addressAllowed: true },
                { title: 'Policy', text: 'Notice period is 30 days.' },
            ),
            step(
                'queue-it-as-a-document',
                api + 'web_sources.py',
                'original_storage.store_original(did, path)',
                'Queue it as a document',
                'The import preserves the original URL in the stored Markdown and queues it for normal indexing.',
                { title: 'Policy', url: 'https://example.test/policy' },
                { filename: 'Policy.md' },
                { status: 'queued' },
            ),
        ],
    },
    {
        id: 'repository',
        title: 'Inspect GitHub repository evidence',
        steps: [
            uiStep(
                'submit-a-repository-question',
                'Repository Evidence',
                'Submit a repository question',
                'components/chat/RepositoryEvidence.tsx',
                'onClick={() => void inspect()}',
                'The question action calls the repository inspection handler using the current repository selection.',
                { repository: 'example/repo', question: 'Trace the upload flow' },
                { busy: false },
                { handler: 'inspect' },
            ),
            step(
                'ask-about-a-repository',
                web + 'components/chat/RepositoryEvidence.tsx',
                'const inspect = async () => {',
                'Build the repository evidence request',
                'The Repository Evidence view submits a question with repository selection and optional web context.',
                { repository: 'example/repo', question: 'Trace the upload flow' },
                { include_web: false },
                { route: 'repository-evidence' },
            ),
            step(
                'resolve-repository-access',
                api + 'routes/repository_evidence.py',
                'def inspect_repository(',
                'Resolve repository access',
                'The API resolves the GitHub connection and scopes the inspection to an accessible repository.',
                { repository: 'example/repo' },
                { githubConnection: 'available' },
                { scope: 'example/repo' },
            ),
            step(
                'read-matching-source-files',
                api + 'connectors/github/repository_files.py',
                'def github_repository_file_search(',
                'Read matching source files',
                'Repository search inspects likely files and returns snippets linked to the repository.',
                { repository: 'example/repo', query: 'upload' },
                { file: 'backend/app/routes/documents.py' },
                { evidence: 'Upload handler snippet' },
            ),
        ],
    },
    {
        id: 'recover',
        title: 'Reset a password and revoke old sessions',
        steps: [
            uiStep(
                'click-forgot-password',
                'Sign-in screen',
                'Click Forgot password?',
                'components/auth/AuthView.tsx',
                'Forgot password?',
                'The sign-in form switches to recovery mode so the user can submit their email address.',
                { email: 'reader@example.test' },
                { forgot: false },
                { forgot: true },
            ),
            uiStep(
                'submit-recovery-email',
                'Sign-in screen → Reset your password',
                'Send the reset link',
                'components/auth/AuthView.tsx',
                "await api('/auth/forgot'",
                'The recovery form sends the entered email to the password recovery endpoint.',
                { email: 'reader@example.test' },
                { forgot: true },
                { request: 'POST /auth/forgot' },
            ),
            step(
                'request-a-recovery-email',
                api + 'routes/auth.py',
                'def forgot(',
                'Request a recovery email',
                'Atlas starts the Supabase recovery flow and sets a short-lived PKCE cookie.',
                { email: 'reader@example.test' },
                { action: 'recovery' },
                { requested: true },
            ),
            uiStep(
                'submit-new-password',
                'Password reset link → Choose a new password',
                'Submit the new password',
                'components/auth/CompleteAuth.tsx',
                "await api(reset ? '/auth/reset'",
                'The email opens a reset form. Submitting includes the recovery code or token and the new password.',
                { password: '[redacted]' },
                { mode: 'reset', recoveryToken: '[redacted]' },
                { request: 'POST /auth/reset' },
            ),
            step(
                'complete-the-recovery',
                api + 'routes/auth.py',
                'def reset(',
                'Complete the recovery',
                'Atlas validates the recovery link before updating the password with Supabase.',
                { code: '[redacted]', password: '[redacted]' },
                { flow: 'recovery' },
                { passwordUpdated: true },
            ),
            step(
                'revoke-the-atlas-session',
                api + 'routes/auth.py',
                'db.query(Login).filter_by(user_id=identifier).delete()',
                'Revoke existing Atlas sessions',
                'A successful password reset deletes the user’s existing sessions and clears the browser cookie. The user must sign in with the new password.',
                { user: 'user-42' },
                { existingSessions: 2 },
                { existingSessions: 0, signInRequired: true },
                { lines: 3, transition: { before: { sessions: 2 }, after: { sessions: 0 } } },
            ),
        ],
    },
    {
        id: 'document-maintenance',
        title: 'Retry or delete a document',
        steps: [
            uiStep(
                'click-reindex',
                'Documents → Document table',
                'Click Reindex',
                'components/documents/DocumentTable.tsx',
                'onClick={() => onRetry(d)}',
                'The row action passes the selected document to the reindex handler.',
                { document: 'doc-1' },
                { canEdit: true },
                { handler: 'onRetry' },
            ),
            step(
                'queue-a-failed-document-again',
                api + 'routes/documents.py',
                'def retry(',
                'Queue a failed document again',
                'An editor can retry indexing so the worker can claim the document again.',
                { document: 'doc-1', status: 'failed' },
                { actorRole: 'editor' },
                { status: 'queued' },
            ),
            step(
                'run-the-queued-attempt',
                api + 'worker.py',
                'def run_one(',
                'Run the queued attempt',
                'The worker claims work, refreshes its lease during processing, and handles a failed attempt.',
                { document: 'doc-1' },
                { generation: 2 },
                { status: 'ready' },
            ),
            uiStep(
                'click-delete-document',
                'Documents → Document table',
                'Choose Delete and confirm',
                'components/documents/DocumentTable.tsx',
                'onClick={() => onRemove(d)}',
                'Deletion is a separate action. The document handler asks for confirmation before sending DELETE.',
                { document: 'doc-1' },
                { canEdit: true, confirmed: true },
                { method: 'DELETE' },
            ),
            step(
                'delete-the-document',
                api + 'routes/documents.py',
                'def delete(',
                'Delete the document',
                'The delete route removes the document and indexed passages and cleans up the original.',
                { document: 'doc-1' },
                { status: 'ready' },
                { deleted: true },
            ),
        ],
    },
    {
        id: 'gmail',
        title: 'Connect Gmail and retrieve messages',
        steps: [
            uiStep(
                'click-connect-gmail',
                'Connected sources → Gmail',
                'Click Connect Gmail',
                'components/sources/gmail/GmailWorkspaceView.tsx',
                'onClick={onConnect}',
                'The mailbox screen calls the Gmail connection handler, starting OAuth for the current workspace.',
                { workspace: 'ws-1' },
                { connected: false },
                { handler: 'onConnect' },
            ),
            step(
                'request-gmail-authorization',
                web + 'components/sources/useConnectedSourcesController.ts',
                '/gmail/connect?workspaceId=',
                'Request the Gmail authorization URL',
                'The mailbox button calls Atlas for an authorization URL and redirects to it.',
                {},
                {},
                { request: 'GET /gmail/connect' },
                { lines: 2 },
            ),
            step(
                'begin-mailbox-authorization',
                api + 'connectors/gmail.py',
                'def connect(',
                'Begin mailbox authorization',
                'Atlas stores an expiring OAuth state for the workspace before redirecting to Google.',
                { workspace: 'ws-1' },
                { provider: 'gmail' },
                { redirect: 'Google OAuth' },
            ),
            step(
                'save-the-mailbox-credential',
                api + 'connectors/gmail.py',
                'def callback(',
                'Save the mailbox credential',
                'The callback validates the authorization and saves the encrypted refresh token.',
                { state: '[redacted]', code: '[redacted]' },
                { authenticated: true },
                { provider: 'gmail', shared: false },
            ),
            uiStep(
                'ask-with-gmail',
                'Ask Atlas → Source selector',
                'Select Gmail and ask about policy emails',
                'components/chat/ResearchSourceSelector.tsx',
                'onIncludeGmail(e.target.checked)',
                'Selecting Gmail includes the mailbox when the next question is sent.',
                { question: 'Find policy emails' },
                { connected: true },
                { include_gmail: true },
            ),
            step(
                'retrieve-matching-messages',
                api + 'connected_research.py',
                'def _search_gmail(',
                'Retrieve matching messages',
                'The research adapter fetches matching messages or reloads exact message IDs for a cited follow-up.',
                { question: 'Find policy emails' },
                { matches: ['mail-1'] },
                { evidence: ['mail-1'] },
            ),
        ],
    },
    {
        id: 'export',
        title: 'Export a conversation',
        steps: [
            uiStep(
                'choose-export-markdown-md',
                'Ask Atlas → Conversation actions',
                'Choose Export Markdown (.md)',
                'components/chat/ResearchWorkspace.tsx',
                "onClick={() => exportConversation('md')}",
                'The conversation actions offer Markdown and PDF export when the transcript is ready.',
                { format: 'md' },
                { busy: false, canCopy: true },
                { handler: 'exportConversation' },
            ),
            step(
                'choose-an-export-format',
                web + 'components/chat/ResearchWorkspace.tsx',
                'function exportConversation(',
                'Choose an export format',
                'The active conversation can be exported after generation finishes.',
                { format: 'md' },
                { busy: false, messageCount: 2 },
                { ready: true },
            ),
            step(
                'format-the-transcript-and-citations',
                web + 'lib/conversationExport.ts',
                'function conversationMarkdown(',
                'Format the transcript and citations',
                'Atlas builds Markdown from the current messages and cited source metadata.',
                { title: 'Policy research' },
                { citation: 1 },
                { extension: '.md', sources: 1 },
            ),
            step(
                'download-markdown',
                web + 'lib/conversationExport.ts',
                'function downloadConversationMarkdown(',
                'Download Markdown',
                'The browser downloads a generated Blob. The PDF path instead renders the transcript for the print dialog.',
                { filename: 'Policy research.md' },
                { mimeType: 'text/markdown' },
                { download: true },
            ),
        ],
    },
];

const upload = linearScenarios.find(({ id }) => id === 'upload');
const staged = linearScenarios.find(({ id }) => id === 'staged-upload');
const uploadBrowser = web + 'lib/uploadDocuments.ts';
const uploadTest = {
    path: web + 'e2e/research.spec.ts',
    anchor: 'expect(chunks).toBe(1);',
};
const uploadApiTest = {
    path: 'backend/tests/test_system.py',
    anchor: 'def test_chunked_upload_offsets_completion_duplicates_and_access(',
};

function uploadDecision(size) {
    const multipart = size <= 8388608;
    return step(
        'select-upload-path',
        uploadBrowser,
        multipart ? 'if (file.size <= 8 * 1024 * 1024)' : 'const job = await api<{ id: string; part_bytes: number }>',
        'Choose the upload request',
        'Files up to and including 8 MiB use multipart upload. Larger files open a staged upload session.',
        { size },
        { thresholdBytes: 8388608 },
        { method: 'POST', endpoint: multipart ? '/documents' : '/uploads' },
        { lines: 5 },
    );
}

const queueUpload = step(
    'commit-queued-document',
    api + 'routes/documents.py',
    'results.append(public_doc(doc))',
    'Return the queued document',
    'Once original storage succeeds, the API commits the document row and returns it with the default queued status.',
    { document: 'doc-1', originalStored: true },
    { committed: true },
    { status: 'queued' },
    { lines: 1, transition: { before: { documentRow: null }, after: { status: 'queued' } } },
);

const indexSteps = [
    {
        ...upload.steps[3],
        anchor: "'status': 'processing',",
        lines: 4,
        transition: { before: { status: 'queued', generation: 0, attempts: 0 }, after: { status: 'processing', generation: 1, attempts: 1 } },
    },
    upload.steps[4],
    step(
        'check-worker-generation',
        api + 'ingest.py',
        "if not doc or doc.generation != generation or doc.status != 'processing':",
        'Check that this worker still owns the attempt',
        'Before replacing chunks, ingestion checks that the job generation and status still match. A worker whose lease was reclaimed cannot publish stale chunks.',
        { workerGeneration: 1 },
        { documentGeneration: 1, status: 'processing' },
        { publishAllowed: true },
        { lines: 2, test: { path: 'backend/tests/test_system.py', anchor: 'def test_stale_job_cannot_publish_after_reindex(' } },
    ),
    {
        ...upload.steps[5],
        anchor: "doc.status, doc.error, doc.pages, doc.chunk_count = 'ready'",
        lines: 3,
        transition: { before: { status: 'processing', chunk_count: 0 }, after: { status: 'ready', chunk_count: 4 } },
    },
    step(
        'poll-document-status',
        web + 'components/AtlasWorkspace.tsx',
        'const timer = window.setInterval(() => {',
        'Refresh readiness in the browser',
        'While a newly uploaded document is queued or processing, the browser refreshes document state every three seconds.',
        { document: 'doc-1' },
        { observedStatus: 'processing' },
        { observedStatus: 'ready' },
        { lines: 3, transition: { before: { searchable: false }, after: { searchable: true } } },
    ),
];

const appendPart = {
    ...staged.steps[2],
    anchor: 'out.write(data)',
    lines: 4,
    values: { input: { offset: 0, bytes: 8388608 }, state: { currentOffset: 0 }, output: { offset: 8388608 } },
    transition: { before: { serverOffset: 0 }, after: { serverOffset: 8388608 } },
    test: uploadApiTest,
};
const reconcile = step(
    'reconcile-lost-ack',
    uploadBrowser,
    'if (state.offset === end) sent = true;',
    'Recover a lost acknowledgement',
    'After the PUT fails at the client, Atlas reads the server offset. If the server already reached the end of this part, the client advances without sending the bytes again.',
    { sentOffset: 0, end: 8388608, response: 'lost' },
    { serverOffset: 8388608 },
    { resend: false, nextOffset: 8388608 },
    { lines: 2, transition: { before: { clientOffset: 0, serverOffset: 8388608 }, after: { clientOffset: 8388608, serverOffset: 8388608 } }, test: uploadTest },
);

const sendPart = step(
    'send-staged-part',
    uploadBrowser,
    'await api(`/workspaces/${workspaceId}/uploads/${job.id}?offset=${offset}`',
    'Send a part at the current offset',
    'The browser sends the selected byte range together with its starting offset.',
    { offset: 0, end: 8388608 },
    { upload: 'upload-1' },
    { method: 'PUT', bytes: 8388608 },
    { lines: 4 },
);
const completeStaging = step(
    'request-staged-completion',
    uploadBrowser,
    'const document = await api<UploadedDocument>',
    'Request completion after all parts',
    'Once the client offset reaches the file size, the browser calls the completion endpoint.',
    { offset: 33554432 },
    { fileSize: 33554432 },
    { method: 'POST', endpoint: '/complete' },
    { lines: 1 },
);
const uploadCases = [
    { id: 'small', title: 'Small file', steps: [upload.steps[0], uploadDecision(184320), upload.steps[1], upload.steps[2], queueUpload, ...indexSteps] },
    { id: 'large', title: 'Large staged file', steps: [staged.steps[0], uploadDecision(33554432), staged.steps[1], sendPart, appendPart, completeStaging, staged.steps[3], ...indexSteps] },
    {
        id: 'lost-ack',
        title: 'Large file · lost acknowledgement',
        steps: [staged.steps[0], uploadDecision(33554432), staged.steps[1], sendPart, appendPart, reconcile, completeStaging, staged.steps[3], ...indexSteps],
    },
];

const answer = linearScenarios.find(({ id }) => id === 'answer');
const scope = linearScenarios.find(({ id }) => id === 'scope');
const scopeFilter = { ...scope.steps[4], anchor: 'channel_id not in resource_ids', lines: 5 };
const scopeCheck = {
    ...scope.steps.at(-1),
    anchor: 'if scopes and provider in scopes and source_scope(db, actor, row) != scopes[provider]:',
    lines: 2,
    transition: { before: { allowedChannels: ['C123'] }, after: { allowedChannels: ['C456'] } },
    test: { path: 'backend/tests/test_rbac.py', anchor: "assert 'Source permissions changed' in response.text" },
};
const answerFailure = step(
    'withhold-unverified-draft',
    api + 'connected_synthesis.py',
    "mode = 'citation_check_failed'",
    'Withhold the unverified draft',
    'If citation repair cannot produce a valid answer, the caller receives a failure result. Atlas does not emit the model draft as an answer delta.',
    { draft: 'The notice period is 30 days. [99]' },
    { citationReferencesValid: false },
    { mode: 'citation_check_failed', answerDelta: false },
    { lines: 1, test: { path: 'backend/tests/test_answer_quality.py', anchor: "assert result['mode'] == 'citation_check_failed'" } },
);
const partial = step(
    'continue-with-partial-coverage',
    api + 'connected_research.py',
    'if failures and not evidence:',
    'Keep evidence from successful sources',
    'Atlas continues when at least one source returned usable evidence. The coverage note records the unavailable source.',
    { providers: ['documents', 'slack'] },
    { failures: ['slack'], usablePassages: 1 },
    { continueWith: ['documents'], partialCoverage: true },
    { lines: 2, test: { path: 'backend/tests/test_answer_quality.py', anchor: 'def test_partial_connector_failure_marks_answer_coverage(' } },
);

const ragPipeline = {
    "id": "rag-pipeline",
    "title": "RAG lab · chunk → retrieve → answer",
    "cases": [
        {
            "id": "hybrid",
            "title": "Hybrid RAG with AI",
            "steps": [
                {
                    "id": "rag-upload-ui",
                    "screen": "Documents · upload",
                    "path": "frontend/lib/uploadDocuments.ts",
                    "anchor": "export async function uploadDocument(",
                    "title": "Upload a document from Atlas",
                    "detail": "The browser submits a file for the selected workspace. Atlas then extracts and indexes its content before questions can retrieve evidence.",
                    "values": {
                        "input": {
                            "file": "leave-policy.pdf",
                            "workspace": "ws-1"
                        },
                        "state": {
                            "method": "POST",
                            "action": "Upload document"
                        },
                        "output": {
                            "request": "POST /workspaces/ws-1/documents"
                        }
                    }
                },
                {
                    "id": "rag-extract",
                    "path": "backend/app/ingest.py",
                    "anchor": "def extract(",
                    "title": "Extract text and OCR",
                    "detail": "Read PDF pages, DOCX blocks, or supported text files. Image-only PDF pages may use OCR.",
                    "values": {
                        "input": {
                            "file": "leave-policy.pdf"
                        },
                        "state": {
                            "page": 1
                        },
                        "output": {
                            "text": "Employees receive 20 days of annual leave. Requests require manager approval."
                        }
                    }
                },
                {
                    "id": "rag-split",
                    "path": "backend/app/ingest.py",
                    "anchor": "def split_text(text, size=1800, overlap=240):",
                    "title": "Split into overlapping chunks",
                    "detail": "The actual splitter uses up to 1,800 characters with 240-character overlap, preferring newline or sentence boundaries. The short passages here illustrate the concept rather than literal chunk sizes.",
                    "values": {
                        "input": {
                            "text": "Employees receive 20 days of annual leave. Requests require manager approval."
                        },
                        "state": {
                            "size": 1800,
                            "overlap": 240
                        },
                        "output": {
                            "illustrativeChunks": [
                                "Employees receive 20 days of annual leave.",
                                "Requests require manager approval."
                            ]
                        }
                    }
                },
                {
                    "id": "rag-embed",
                    "path": "backend/app/ai.py",
                    "anchor": "def embed(texts):",
                    "title": "Generate embeddings",
                    "detail": "The worker embeds batches of 32 passages. OpenAI produces 1,536-dimensional vectors; shorter Ollama vectors are padded. No provider means null embeddings.",
                    "values": {
                        "input": {
                            "chunks": 2
                        },
                        "state": {
                            "provider": "OpenAI / Ollama",
                            "batchSize": 32
                        },
                        "output": {
                            "exampleVector": "[0.12, -0.08, …] illustrative",
                            "dimensions": 1536
                        }
                    }
                },
                {
                    "id": "rag-store",
                    "path": "backend/app/ingest.py",
                    "anchor": "db.add_all(chunks)",
                    "title": "Store indexed chunks",
                    "detail": "Replace existing Chunk rows for this document and commit text, page, ordinal, vector and embedding model. Mark the document ready.",
                    "values": {
                        "input": {
                            "document": "doc-1"
                        },
                        "state": {
                            "workspace": "ws-1",
                            "table": "chunks"
                        },
                        "output": {
                            "status": "ready",
                            "chunkCount": 2
                        }
                    }
                },
                {
                    "id": "rag-query",
                    "path": "backend/app/retrieval.py",
                    "anchor": "def retrieve(workspace_id, query, document_ids=None, limit=8):",
                    "title": "Ask a question",
                    "detail": "Search ready documents in the workspace, optionally filtered by document IDs.",
                    "values": {
                        "input": {
                            "question": "How many annual leave days do employees receive?"
                        },
                        "state": {
                            "workspace": "ws-1"
                        },
                        "output": {
                            "limit": 8
                        }
                    }
                },
                {
                    "id": "rag-lexical",
                    "path": "backend/app/retrieval.py",
                    "anchor": "if engine.dialect.name == 'postgresql':",
                    "title": "Keyword search",
                    "detail": "Use PostgreSQL full-text search, SQLite FTS5, or an in-process BM25 fallback.",
                    "values": {
                        "input": {
                            "query": "How many annual leave days do employees receive?"
                        },
                        "state": {
                            "backend": "PostgreSQL or SQLite"
                        },
                        "output": {
                            "hit": "Employees receive 20 days of annual leave."
                        }
                    }
                },
                {
                    "id": "rag-semantic",
                    "path": "backend/app/retrieval.py",
                    "anchor": "if engine.dialect.name == 'postgresql' and enabled():",
                    "title": "Vector similarity search",
                    "detail": "Embed the question and compare it with stored vectors of the same embedding model, using pgvector or Python cosine similarity.",
                    "values": {
                        "input": {
                            "query": "How many annual leave days do employees receive?"
                        },
                        "state": {
                            "aiEnabled": true
                        },
                        "output": {
                            "hit": "Employees receive 20 days of annual leave."
                        }
                    }
                },
                {
                    "id": "rag-rank",
                    "path": "backend/app/retrieval.py",
                    "anchor": "for ranking, weight in [(lexical, 4.0), (semantic, 1.0)]:",
                    "title": "Fuse, filter, diversify",
                    "detail": "Rank fusion weights lexical hits 4:1 versus semantic hits, filters unsupported matches and diversifies across documents.",
                    "values": {
                        "input": {
                            "lexical": [
                                "Employees receive 20 days of annual leave."
                            ],
                            "semantic": [
                                "Employees receive 20 days of annual leave."
                            ]
                        },
                        "state": {
                            "perDocument": 3
                        },
                        "output": {
                            "selected": [
                                "Employees receive 20 days of annual leave."
                            ]
                        }
                    }
                },
                {
                    "id": "rag-answer",
                    "path": "backend/app/ai.py",
                    "anchor": "def generate(question, sources, history=None, agent_instructions=None, output_format=None):",
                    "title": "Generate grounded answer",
                    "detail": "Pass the question and numbered retrieved evidence to the configured model; the whole document is not sent.",
                    "values": {
                        "input": {
                            "question": "How many annual leave days do employees receive?",
                            "sources": [
                                {
                                    "source_id": 1,
                                    "text": "Employees receive 20 days of annual leave."
                                }
                            ]
                        },
                        "state": {
                            "provider": "OpenAI / Ollama"
                        },
                        "output": {
                            "answer": "Employees receive 20 days of annual leave. [1]"
                        }
                    }
                },
                {
                    "id": "rag-citations",
                    "path": "backend/app/ai.py",
                    "anchor": "refs = {int(n) for n in re.findall",
                    "title": "Validate citations",
                    "detail": "Validate cited source numbers, not claim-level factual correctness.",
                    "values": {
                        "input": {
                            "answer": "Employees receive 20 days of annual leave. [1]"
                        },
                        "state": {
                            "availableSourceIds": [
                                1
                            ]
                        },
                        "output": {
                            "mode": "ai",
                            "citations": [
                                1
                            ]
                        }
                    }
                }
            ]
        },
        {
            "id": "keyword",
            "title": "Keyword-only without AI",
            "steps": [
                {
                    "id": "rag-upload-ui",
                    "screen": "Documents · upload",
                    "path": "frontend/lib/uploadDocuments.ts",
                    "anchor": "export async function uploadDocument(",
                    "title": "Upload a document from Atlas",
                    "detail": "The browser submits a file for the selected workspace. Atlas then extracts and indexes its content before questions can retrieve evidence.",
                    "values": {
                        "input": {
                            "file": "leave-policy.pdf",
                            "workspace": "ws-1"
                        },
                        "state": {
                            "method": "POST",
                            "action": "Upload document"
                        },
                        "output": {
                            "request": "POST /workspaces/ws-1/documents"
                        }
                    }
                },
                {
                    "id": "rag-extract",
                    "path": "backend/app/ingest.py",
                    "anchor": "def extract(",
                    "title": "Extract text and OCR",
                    "detail": "Read PDF pages, DOCX blocks, or supported text files. Image-only PDF pages may use OCR.",
                    "values": {
                        "input": {
                            "file": "leave-policy.pdf"
                        },
                        "state": {
                            "page": 1
                        },
                        "output": {
                            "text": "Employees receive 20 days of annual leave. Requests require manager approval."
                        }
                    }
                },
                {
                    "id": "rag-split",
                    "path": "backend/app/ingest.py",
                    "anchor": "def split_text(text, size=1800, overlap=240):",
                    "title": "Split into overlapping chunks",
                    "detail": "The actual splitter uses up to 1,800 characters with 240-character overlap, preferring newline or sentence boundaries. The short passages here illustrate the concept rather than literal chunk sizes.",
                    "values": {
                        "input": {
                            "text": "Employees receive 20 days of annual leave. Requests require manager approval."
                        },
                        "state": {
                            "size": 1800,
                            "overlap": 240
                        },
                        "output": {
                            "illustrativeChunks": [
                                "Employees receive 20 days of annual leave.",
                                "Requests require manager approval."
                            ]
                        }
                    }
                },
                {
                    "id": "rag-embed",
                    "path": "backend/app/ai.py",
                    "anchor": "def embed(texts):",
                    "title": "Generate embeddings",
                    "detail": "With AI_PROVIDER=none, embed() returns null vectors. Keyword indexing still works.",
                    "values": {
                        "input": {
                            "chunks": 2
                        },
                        "state": {
                            "provider": "none"
                        },
                        "output": {
                            "vectors": [
                                null,
                                null
                            ]
                        }
                    }
                },
                {
                    "id": "rag-store",
                    "path": "backend/app/ingest.py",
                    "anchor": "db.add_all(chunks)",
                    "title": "Store indexed chunks",
                    "detail": "Replace existing Chunk rows for this document and commit text, page, ordinal, vector and embedding model. Mark the document ready.",
                    "values": {
                        "input": {
                            "document": "doc-1"
                        },
                        "state": {
                            "workspace": "ws-1",
                            "table": "chunks"
                        },
                        "output": {
                            "status": "ready",
                            "chunkCount": 2
                        }
                    }
                },
                {
                    "id": "rag-query",
                    "path": "backend/app/retrieval.py",
                    "anchor": "def retrieve(workspace_id, query, document_ids=None, limit=8):",
                    "title": "Ask a question",
                    "detail": "Search ready documents in the workspace, optionally filtered by document IDs.",
                    "values": {
                        "input": {
                            "question": "How many annual leave days do employees receive?"
                        },
                        "state": {
                            "workspace": "ws-1"
                        },
                        "output": {
                            "limit": 8
                        }
                    }
                },
                {
                    "id": "rag-lexical",
                    "path": "backend/app/retrieval.py",
                    "anchor": "if engine.dialect.name == 'postgresql':",
                    "title": "Keyword search",
                    "detail": "Use PostgreSQL full-text search, SQLite FTS5, or an in-process BM25 fallback.",
                    "values": {
                        "input": {
                            "query": "How many annual leave days do employees receive?"
                        },
                        "state": {
                            "backend": "PostgreSQL or SQLite"
                        },
                        "output": {
                            "hit": "Employees receive 20 days of annual leave."
                        }
                    }
                },
                {
                    "id": "rag-rank",
                    "path": "backend/app/retrieval.py",
                    "anchor": "for ranking, weight in [(lexical, 4.0), (semantic, 1.0)]:",
                    "title": "Fuse, filter, diversify",
                    "detail": "Only lexical matches contribute. The system returns matching excerpts without LLM synthesis.",
                    "values": {
                        "input": {
                            "lexical": [
                                "Employees receive 20 days of annual leave."
                            ],
                            "semantic": []
                        },
                        "state": {
                            "aiEnabled": false
                        },
                        "output": {
                            "mode": "local_excerpts",
                            "excerpt": "Employees receive 20 days of annual leave."
                        }
                    }
                }
            ]
        }
    ]
};

export const scenarios = [ragPipeline, ...linearScenarios]
    .filter(({ id }) => id !== 'staged-upload')
    .map((scenario) => {
        if (scenario === upload) return { ...scenario, cases: uploadCases };
        if (scenario === answer) {
            return {
                ...scenario,
                cases: [
                    { id: 'cited', title: 'Valid citations', steps: answer.steps },
                    {
                        id: 'partial',
                        title: 'Slack unavailable',
                        steps: [
                            ...answer.steps.slice(0, 5),
                            { ...answer.steps[5], values: { ...answer.steps[5].values, output: { providersWithEvidence: ['documents'], failures: ['slack'] } } },
                            answer.steps[6],
                            partial,
                            ...answer.steps.slice(7),
                        ],
                    },
                    {
                        id: 'invalid',
                        title: 'Citation repair fails',
                        steps: [
                            ...answer.steps.slice(0, -3),
                            { ...answer.steps.at(-3), values: { ...answer.steps.at(-3).values, output: { draft: 'The notice period is 30 days. [99]' } } },
                            answerFailure,
                        ],
                    },
                ],
            };
        }
        if (scenario === scope) {
            return {
                ...scenario,
                cases: [
                    {
                        id: 'unchanged',
                        title: 'Scope stays the same',
                        steps: [
                            ...scope.steps.slice(0, 4),
                            scopeFilter,
                            { ...scopeCheck, values: { input: { originalScope: ['C123'] }, state: { currentScope: ['C123'] }, output: { allowed: true } }, transition: undefined, test: undefined },
                        ],
                    },
                    { id: 'revoked', title: 'Scope narrowed during synthesis', steps: [...scope.steps.slice(0, 4), scopeFilter, scopeCheck] },
                ],
            };
        }
        return scenario;
    });

export const walkthroughs = scenarios.flatMap((scenario) => scenario.cases || [scenario]);
