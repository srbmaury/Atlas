import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy policy | Atlas' };

export default function PrivacyPage() {
    return (
        <>
            <h1>Privacy policy</h1>
            <p>This policy describes how Atlas processes information when you sign in, upload documents, connect a source, or ask a question.</p>

            <h2>Information Atlas processes</h2>
            <ul>
                <li>Account details such as your email address and display name, plus a session cookie that keeps you signed in.</li>
                <li>Workspace settings, uploaded files and indexed text, questions, saved conversations, answers, and citations.</li>
                <li>Connection details and encrypted provider credentials used to access sources you authorize.</li>
            </ul>

            <h2>Google data and permissions</h2>
            <p>
                If you sign in with Google, Atlas uses your Google account identity through Supabase Auth to sign you in. Connecting a Google source is a separate permission. Gmail access lets Atlas
                search and read messages, Google Drive access lets it search and read supported files, and Calendar access lets it find and read events. These connectors use read-only permissions.
            </p>
            <p>
                Atlas searches connected sources on demand when you select them. Relevant passages or citations can appear in answers and be retained in saved conversations. Disconnecting a source
                removes the connection from Atlas. You can revoke the grant in your Google Account and delete saved conversations separately.
            </p>
            <p>
                Atlas uses Google data to provide the features you request, such as finding messages, files, and events and creating source-backed answers. Atlas does not sell Google user data, use it
                for advertising, or use it to train generalized AI models. Google data is handled in accordance with the{' '}
                <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including its Limited Use requirements.
            </p>

            <h2>Service providers and AI processing</h2>
            <p>
                Hosting, authentication, storage, and email delivery providers process information needed to operate Atlas. When a question uses AI answer generation, Atlas sends the question,
                relevant conversation context, and selected source excerpts to the configured model to produce that answer. For hosted model deployments, the model provider receives that request.
            </p>

            <h2>Retention and deletion</h2>
            <p>
                Atlas stores account and workspace data to provide the service. You can delete documents and conversations, disconnect sources, or delete your account under Settings. If you own shared
                workspaces or organizations, Atlas may require you to transfer or delete them before deleting your account. Disconnecting or deleting data in Atlas does not delete the original records
                from connected services.
            </p>

            <h2>Contact</h2>
            <p>
                For a privacy question or a data request, contact <a href="mailto:contact@srbmaury.com">contact@srbmaury.com</a>. Keep account details, source content, and credentials out of public
                issues.
            </p>
        </>
    );
}
