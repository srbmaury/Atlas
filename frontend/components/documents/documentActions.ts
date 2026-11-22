import type { Dispatch, SetStateAction, RefObject, FormEvent } from 'react';
import { api } from '../../lib/api';
import { uploadDocument } from '../../lib/uploadDocuments';
import { sameDocumentSnapshot } from '../../lib/documentSnapshot';
import type { User, Doc, DocumentPreview, Source } from '../../lib/types';

type Setter<T> = Dispatch<SetStateAction<T>>;

type Options = {
    workspaceId: string;
    webUrl: string;
    webBusy: boolean;
    uploading: boolean;
    user: User | null;
    scope: RefObject<string>;
    input: RefObject<HTMLInputElement | null>;
    refresh: () => Promise<void>;
    setWebBusy: Setter<boolean>;
    setWebUrl: Setter<string>;
    setError: Setter<string>;
    setNotice: Setter<string>;
    setUploading: Setter<boolean>;
    setUploadProgress: Setter<string>;
    setUploadSummary: Setter<{ ids: string[]; duplicates: number } | null>;
    setSource: Setter<Source | null>;
    setPreview: Setter<DocumentPreview | null>;
};

export async function refreshDocuments({ workspaceId, scope, setDocs, setSelected }: { workspaceId: string; scope: RefObject<string>; setDocs: Setter<Doc[]>; setSelected: Setter<string[]> }) {
    if (!workspaceId) return;
    const documents = await api<Doc[]>(`/workspaces/${workspaceId}/documents`);
    if (scope.current !== workspaceId) return;
    setDocs((current) => (sameDocumentSnapshot(current, documents) ? current : documents));
    setSelected((current) => {
        const remaining = current.filter((id) => documents.some((document) => document.id === id));
        return remaining.length === current.length ? current : remaining;
    });
}

export function createDocumentActions({
    workspaceId,
    webUrl,
    webBusy,
    uploading,
    user,
    scope,
    input,
    refresh,
    setWebBusy,
    setWebUrl,
    setError,
    setNotice,
    setUploading,
    setUploadProgress,
    setUploadSummary,
    setSource,
    setPreview,
}: Options) {
    async function importWebPage(event: FormEvent) {
        event.preventDefault();
        if (!workspaceId || webBusy || !webUrl.trim()) return;
        const target = workspaceId;
        setWebBusy(true);
        setError('');
        setNotice('');
        try {
            const result = await api<{ name: string; duplicate: boolean }>(`/workspaces/${target}/web-pages`, {
                method: 'POST',
                body: JSON.stringify({ url: webUrl.trim() }),
            });
            if (scope.current === target) {
                setWebUrl('');
                setNotice(result.duplicate ? 'Web page already exists in this workspace.' : `Added ${result.name} to your library for indexing.`);
                await refresh();
            }
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setWebBusy(false);
        }
    }

    async function upload(files: FileList | File[]) {
        if (!files.length || uploading) return;
        const target = workspaceId;
        setUploading(true);
        setError('');
        setNotice('');
        setUploadSummary(null);
        const added: string[] = [];
        let duplicates = 0;
        const problems: string[] = [];
        const list = Array.from(files);
        try {
            for (let index = 0; index < list.length; index++) {
                if (scope.current !== target) break;
                const file = list[index];
                try {
                    if (file.size > user!.max_file_bytes) throw new Error(`Exceeds the ${Math.round(user!.max_file_bytes / 1024 / 1024)} MB file limit.`);
                    setUploadProgress(`Uploading ${index + 1} of ${list.length}: ${file.name} · 0%`);
                    const documents = await uploadDocument(target, file, (percent) => {
                        setUploadProgress(`Uploading ${index + 1} of ${list.length}: ${file.name} · ${percent}%`);
                    });
                    for (const doc of documents) {
                        if (!doc.id) problems.push(`${doc.name}: ${doc.error}`);
                        else if (doc.duplicate) duplicates++;
                        else added.push(doc.id);
                    }
                } catch (error) {
                    problems.push(`${file.name}: ${(error as Error).message}`);
                }
                if (scope.current === target) {
                    setUploadSummary({ ids: [...added], duplicates });
                    await refresh().catch(() => undefined);
                }
            }
            if (scope.current === target && problems.length) setError(problems.join(' '));
        } finally {
            setUploading(false);
            setUploadProgress('');
            if (input.current) input.current.value = '';
        }
    }

    async function remove(doc: Doc) {
        if (!confirm(`Delete “${doc.name}” and its indexed content?`)) return;
        try {
            await api(`/workspaces/${workspaceId}/documents/${doc.id}`, { method: 'DELETE' });
            setSource(null);
            setPreview(null);
            setUploadSummary(null);
            await refresh();
        } catch (e) {
            setError((e as Error).message);
        }
    }

    async function retry(doc: Doc) {
        try {
            await api(`/workspaces/${workspaceId}/documents/${doc.id}/retry`, { method: 'POST' });
            setSource(null);
            setPreview(null);
            await refresh();
        } catch (e) {
            setError((e as Error).message);
        }
    }

    async function inspect(doc: Doc) {
        try {
            setPreview(await api(`/workspaces/${workspaceId}/documents/${doc.id}/chunks`));
        } catch (e) {
            setError((e as Error).message);
        }
    }
    return { importWebPage, upload, remove, retry, inspect };
}
