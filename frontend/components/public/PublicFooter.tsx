import Link from 'next/link';
import styles from './PublicFooter.module.css';

export function PublicFooter() {
    return (
        <footer className={styles.footer}>
            <nav aria-label="Atlas information">
                <Link href="/about">About Atlas</Link>
                <Link href="/privacy">Privacy policy</Link>
                <Link href="/terms">Terms of service</Link>
            </nav>
        </footer>
    );
}
