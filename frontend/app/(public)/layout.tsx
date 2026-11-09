import Link from 'next/link';
import type { ReactNode } from 'react';
import { AtlasMark } from '../../components/ui/WorkspacePrimitives';
import styles from './public.module.css';

export default function PublicLayout({ children }: { children: ReactNode }) {
    return (
        <div className={styles.site}>
            <header className={styles.header}>
                <Link href="/about" className={styles.brand}>
                    <AtlasMark />
                    Atlas
                </Link>
                <Link href="/">Open workspace</Link>
            </header>
            <main className={styles.content}>{children}</main>
            <footer className={styles.footer}>
                <nav aria-label="Atlas information">
                    <Link href="/about">About Atlas</Link>
                    <Link href="/privacy">Privacy policy</Link>
                    <Link href="/terms">Terms of service</Link>
                </nav>
            </footer>
        </div>
    );
}
