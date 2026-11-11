'use client';
import type { AccessMember } from './OwnershipTransfer';

export type SourceSharing = { provider: string; owned: boolean; shared: boolean; member_ids?: string[]; resource_ids?: string[] };

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
    onChange: (connection: SourceSharing, shared: boolean, memberIds: string[], resourceIds?: string[]) => void;
}) {
    return (
        <section className="access-sharing" aria-label="Source permissions">
            <h3>Source permissions</h3>
            <p>
                Keep a connection private, grant selected workspace members access, or share with everyone. Drive and Slack shares are limited to the files or channels you choose. Saved excerpts
                remain in members’ private chats after access is revoked.
            </p>
            {!connections.length && <p>No connections available to manage.</p>}
            {connections.map((connection) => {
                const scoped = connection.provider === 'drive' || connection.provider === 'slack';
                const needsResources = scoped && !connection.resource_ids?.length;
                const resourceLabel = connection.provider === 'drive' ? 'Drive file IDs' : 'Slack channel IDs';
                return (
                    <fieldset key={connection.provider} className="access-source" disabled={busy || !connection.owned}>
                        <legend>
                            {connection.provider}
                            {!connection.owned && ' · managed by its owner'}
                        </legend>
                        {scoped && connection.owned && (
                            <form
                                className="access-source-scope"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    const value = new FormData(event.currentTarget).get('resource_ids');
                                    const ids = [
                                        ...new Set(
                                            String(value || '')
                                                .split(/[\s,]+/)
                                                .filter(Boolean),
                                        ),
                                    ];
                                    onChange(connection, ids.length > 0 && connection.shared, ids.length ? connection.member_ids || [] : [], ids);
                                }}
                            >
                                <label>
                                    {resourceLabel}
                                    <textarea name="resource_ids" rows={3} defaultValue={(connection.resource_ids || []).join('\n')} />
                                </label>
                                <small>
                                    {connection.provider === 'drive'
                                        ? 'Paste file IDs from their Drive links. Folders and shortcuts are excluded.'
                                        : 'Paste channel IDs from Slack. Direct and group messages are excluded.'}{' '}
                                    Separate IDs with spaces, commas, or new lines. Clearing the list turns off sharing.
                                </small>
                                <button type="submit" className="btn">
                                    Save scope
                                </button>
                            </form>
                        )}
                        <label className="access-share-row">
                            <input type="checkbox" disabled={needsResources} checked={!needsResources && connection.shared} onChange={(event) => onChange(connection, event.target.checked, [])} />
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
                                                disabled={needsResources}
                                                aria-label={`Allow ${connection.provider} for ${member.email}`}
                                                checked={!needsResources && (connection.member_ids || []).includes(member.id)}
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
                );
            })}
        </section>
    );
}
