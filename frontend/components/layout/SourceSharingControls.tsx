'use client';
import type { AccessMember } from './OwnershipTransfer';

export type SourceSharing = { provider: string; owned: boolean; shared: boolean; member_ids?: string[] };

export function SourceSharingControls({
    connections,
    members,
    userId,
    busy,
    onChange,
}: {
    connections: SourceSharing[];
    members: AccessMember[];
    userId: string;
    busy: boolean;
    onChange: (connection: SourceSharing, shared: boolean, memberIds: string[]) => void;
}) {
    return (
        <section className="access-sharing" aria-label="Source permissions">
            <h3>Source permissions</h3>
            <p>
                Keep a connection private, grant selected workspace members access, or share with everyone. The provider credential still determines which records can be retrieved. Saved excerpts
                remain in members’ private chats after access is revoked.
            </p>
            {!connections.length && <p>No connections available to manage.</p>}
            {connections.map((connection) => (
                <fieldset key={connection.provider} className="access-source" disabled={busy || !connection.owned}>
                    <legend>
                        {connection.provider}
                        {!connection.owned && ' · managed by its owner'}
                    </legend>
                    <label className="access-share-row">
                        <input type="checkbox" checked={connection.shared} onChange={(event) => onChange(connection, event.target.checked, [])} />
                        Share {connection.provider} with this workspace
                    </label>
                    {connection.shared ? (
                        <small>All current and future workspace members can use this connection.</small>
                    ) : (
                        <>
                            <small>The connection owner always has access. Select additional members below.</small>
                            {members
                                .filter((member) => !connection.owned || member.id !== userId)
                                .map((member) => (
                                    <label key={member.id} className="access-share-row">
                                        <input
                                            type="checkbox"
                                            aria-label={`Allow ${connection.provider} for ${member.email}`}
                                            checked={(connection.member_ids || []).includes(member.id)}
                                            onChange={(event) => {
                                                const ids = new Set(connection.member_ids || []);
                                                if (event.target.checked) ids.add(member.id);
                                                else ids.delete(member.id);
                                                onChange(connection, false, [...ids]);
                                            }}
                                        />
                                        {member.email}
                                    </label>
                                ))}
                        </>
                    )}
                </fieldset>
            ))}
        </section>
    );
}
