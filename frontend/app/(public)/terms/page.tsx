import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Terms of service | Atlas' };

export default function TermsPage() {
    return (
        <>
            <h1>Terms of service</h1>
            <p>These terms apply when you use Atlas to research uploaded documents or connected sources.</p>

            <h2>Accounts and source access</h2>
            <p>
                Keep your account and source credentials secure. Upload or connect material only when you have permission to access it and to use it in Atlas. Your connected accounts remain subject to
                the terms and permissions of their providers.
            </p>

            <h2>Your content</h2>
            <p>
                You retain your rights in the content you provide. You allow Atlas to process it as needed to operate the features you request, including indexing uploads, retrieving evidence, and
                generating answers. See the <Link href="/privacy">privacy policy</Link> for details about data handling.
            </p>

            <h2>Acceptable use</h2>
            <p>Do not use Atlas to access accounts or data without authorization, violate others’ rights, distribute malicious files, or disrupt the service.</p>

            <h2>Generated answers and availability</h2>
            <p>
                Generated answers can be incomplete or incorrect. Check the cited sources before relying on an answer. Some features depend on third-party services and may be unavailable when those
                services change or when access is revoked.
            </p>

            <h2>Contact</h2>
            <p>
                For questions about these terms, contact <a href="mailto:contact@srbmaury.com">contact@srbmaury.com</a>.
            </p>
        </>
    );
}
