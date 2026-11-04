import type { Metadata } from 'next';
import { AccountSettings } from '../../components/settings/AccountSettings';

export const metadata: Metadata = { title: 'Account & settings — Atlas' };
export default function SettingsPage() {
    return <AccountSettings />;
}
