import type { Dispatch, SetStateAction, RefObject, FormEvent } from 'react';
import { api } from '../lib/api';
import type { User, Workspace, Doc, DocumentPreview, Source, Message, GmailStatus, ChatSummary } from '../lib/types';

type Setter<T> = Dispatch<SetStateAction<T>>;

type Options = {
    register: boolean;
    email: string;
    password: string;
    workspaceId: string;
    workspaceName: string;
    workspaces: Workspace[];
    deleteWorkspaceId: string | null;
    confirmWorkspaceName: string;
    deletingWorkspace: boolean;
    uploading: boolean;
    busy: boolean;
    boot: () => Promise<void>;
    setUser: Setter<User | null>;
    setWorkspaces: Setter<Workspace[]>;
    setWorkspaceId: Setter<string>;
    setBusy: Setter<boolean>;
    setError: Setter<string>;
    setNotice: Setter<string>;
    setPassword: Setter<string>;
    setDocs: Setter<Doc[]>;
    setMessages: (messages: Message[]) => void;
    setPreview: Setter<DocumentPreview | null>;
    setSource: Setter<Source | null>;
    setNewWorkspace: Setter<boolean>;
    setWorkspaceName: Setter<string>;
    setDeletingWorkspace: Setter<boolean>;
    setDeleteWorkspaceId: Setter<string | null>;
    setConfirmWorkspaceName: Setter<string>;
};

export async function bootWorkspace({
    setUser,
    setWorkspaces,
    setWorkspaceId,
    setLoading,
}: {
    setUser: Setter<User | null>;
    setWorkspaces: Setter<Workspace[]>;
    setWorkspaceId: Setter<string>;
    setLoading: Setter<boolean>;
}) {
    try {
        const actor = await api<User>('/me');
        const list = await api<Workspace[]>('/workspaces');
        setUser(actor);
        setWorkspaces(list);
        setWorkspaceId(list[0]?.id || '');
    } catch {
        setUser(null);
    } finally {
        setLoading(false);
    }
}

export async function refreshWorkspaceMetadata({
    workspaceId,
    scope,
    setGmailStatus,
    setChats,
    setError,
}: {
    workspaceId: string;
    scope: RefObject<string>;
    setGmailStatus: (status: GmailStatus) => void;
    setChats: Setter<ChatSummary[]>;
    setError: Setter<string>;
}) {
    if (!workspaceId) return;
    await Promise.all([
        api<GmailStatus>(`/gmail/status?workspaceId=${encodeURIComponent(workspaceId)}`)
            .then((status) => {
                if (scope.current === workspaceId) setGmailStatus(status);
            })
            .catch(() => undefined),
        api<ChatSummary[]>(`/workspaces/${workspaceId}/conversations`)
            .then((chats) => {
                if (scope.current === workspaceId) setChats(chats);
            })
            .catch((error) => setError(error.message)),
    ]);
}

export function createSessionActions({
    register,
    email,
    password,
    workspaceId,
    workspaceName,
    workspaces,
    deleteWorkspaceId,
    confirmWorkspaceName,
    deletingWorkspace,
    uploading,
    busy,
    boot,
    setUser,
    setWorkspaces,
    setWorkspaceId,
    setBusy,
    setError,
    setNotice,
    setPassword,
    setDocs,
    setMessages,
    setPreview,
    setSource,
    setNewWorkspace,
    setWorkspaceName,
    setDeletingWorkspace,
    setDeleteWorkspaceId,
    setConfirmWorkspaceName,
}: Options) {
    async function authenticate(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await api(`/auth/${register ? 'register' : 'login'}`, {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });
            await boot();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    async function addWorkspace(e: FormEvent) {
        e.preventDefault();
        try {
            const value = await api<Workspace>('/workspaces', {
                method: 'POST',
                body: JSON.stringify({ name: workspaceName }),
            });
            setWorkspaces((old) => [...old, value]);
            setWorkspaceId(value.id);
            setNewWorkspace(false);
            setWorkspaceName('');
        } catch (e) {
            setError((e as Error).message);
        }
    }

    async function removeWorkspace() {
        const target = workspaces.find((w) => w.id === deleteWorkspaceId);
        if (!target || target.name !== confirmWorkspaceName || deletingWorkspace || uploading || busy) return;
        setDeletingWorkspace(true);
        try {
            await api(`/workspaces/${target.id}`, {
                method: 'DELETE',
                body: JSON.stringify({ name: confirmWorkspaceName }),
            });
            const remaining = workspaces.filter((w) => w.id !== target.id);
            setWorkspaces(remaining);
            if (workspaceId === target.id) setWorkspaceId(remaining[0]?.id || '');
            setDeleteWorkspaceId(null);
            setConfirmWorkspaceName('');
            setNewWorkspace(false);
            setNotice(`Workspace “${target.name}” deleted.`);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setDeletingWorkspace(false);
        }
    }

    async function signOut() {
        try {
            await api('/auth/logout', { method: 'POST' });
            setUser(null);
            setPassword('');
            setDocs([]);
            setMessages([]);
            setWorkspaceId('');
            setPreview(null);
            setSource(null);
        } catch (e) {
            setError((e as Error).message);
        }
    }
    return { authenticate, addWorkspace, removeWorkspace, signOut };
}
