'use client';
import { useEffect, useState } from 'react';

export type AccessMember = { id: string; email: string; role: string; owner: boolean };

export function OwnershipTransfer({
    name,
    members,
    busy,
    onTransfer,
}: {
    name: string;
    members: AccessMember[];
    busy: boolean;
    onTransfer: (memberId: string, confirmation: string) => Promise<boolean>;
}) {
    const [target, setTarget] = useState('');
    const [confirmation, setConfirmation] = useState('');
    useEffect(() => {
        setTarget('');
        setConfirmation('');
    }, [name]);
    return (
        <form
            className="access-form"
            onSubmit={(event) => {
                event.preventDefault();
                void onTransfer(target, confirmation).then((saved) => {
                    if (saved) {
                        setTarget('');
                        setConfirmation('');
                    }
                });
            }}
        >
            <h3>Transfer ownership</h3>
            <p>The new owner must already be a member. You will remain a manager or organisation admin. Personal connections and private chats keep their current owners.</p>
            <label>
                New owner
                <select aria-label="New owner" required value={target} disabled={busy} onChange={(event) => setTarget(event.target.value)}>
                    <option value="">Choose a member</option>
                    {members
                        .filter((member) => !member.owner)
                        .map((member) => (
                            <option key={member.id} value={member.id}>
                                {member.email}
                            </option>
                        ))}
                </select>
            </label>
            <label>
                Type {name} to confirm
                <input aria-label="Confirm ownership transfer" required value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
            </label>
            <button className="btn danger" disabled={busy || !target || confirmation !== name}>
                Transfer ownership
            </button>
        </form>
    );
}
