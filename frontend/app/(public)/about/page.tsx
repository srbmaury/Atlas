import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'About Atlas | Research workspace' };

export default function AboutPage() {
    return (
        <>
            <h1>Atlas research workspace</h1>
            <p>Atlas helps you research across uploaded documents and connected sources. Ask a question, choose where Atlas should search, and open citations to inspect the source passages.</p>

            <h2>Connect the sources you want to search</h2>
            <p>
                With your permission, Atlas can search Gmail messages, read Google Drive files, and find Google Calendar events. You choose which sources to include in each question. You can also
                connect sources such as Slack, GitHub, and Notion.
            </p>

            <h2>Check the evidence behind an answer</h2>
            <p>Atlas retrieves relevant passages and can use them to draft a cited answer. Review the original sources before relying on a generated answer.</p>
            <p>
                <Link href="/">Open Atlas</Link>
            </p>
        </>
    );
}
