'use client';
import { useState, type RefObject, type FormEvent } from 'react';
import { api } from '../lib/api';
import type { Doc } from '../lib/types';

type Options = {
    workspaceId: string;
    maxFileBytes: number;
    scope: RefObject<string>;
    input: RefObject<HTMLInputElement | null>;
    refresh: () => Promise<void>;
    setError: (message: string) => void;
    setNotice: (message: string) => void;
};

/** Upload transport and web imports share workspace scoping and import feedback. */
export function useDocumentImports({ workspaceId, maxFileBytes, scope, input, refresh, setError, setNotice }: Options) {
    const [uploading, setUploading] = useState(false);
    const [webUrl, setWebUrl] = useState('');
    const [webBusy, setWebBusy] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [uploadSummary, setUploadSummary] = useState<{ ids: string[]; duplicates: number } | null>(null);
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
                let staged: string | null = null;
                try {
                    if (file.size > maxFileBytes) throw new Error(`Exceeds the ${Math.round(maxFileBytes / 1024 / 1024)} MB file limit.`);
                    setUploadProgress(`Uploading ${index + 1} of ${list.length}: ${file.name} · 0%`);
                    let documents: (Doc & { duplicate?: boolean })[];
                    if (file.size > 8 * 1024 * 1024) {
                        const job = await api<{ id: string; part_bytes: number }>(`/workspaces/${target}/uploads`, { method: 'POST', body: JSON.stringify({ name: file.name, size: file.size }) });
                        staged = job.id;
                        let offset = 0;
                        while (offset < file.size) {
                            const end = Math.min(offset + job.part_bytes, file.size);
                            let sent = false;
                            for (let attempt = 0; attempt < 3 && !sent; attempt++) {
                                try {
                                    await api(`/workspaces/${target}/uploads/${job.id}?offset=${offset}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/octet-stream' },
                                        body: file.slice(offset, end),
                                    });
                                    sent = true;
                                } catch (error) {
                                    const state = await api<{ offset: number }>(`/workspaces/${target}/uploads/${job.id}`);
                                    if (state.offset === end) sent = true;
                                    else if (state.offset !== offset || attempt === 2) throw error;
                                }
                            }
                            offset = end;
                            setUploadProgress(`Uploading ${index + 1} of ${list.length}: ${file.name} · ${Math.round((offset / file.size) * 100)}%`);
                        }
                        const doc = await api<Doc & { duplicate?: boolean }>(`/workspaces/${target}/uploads/${job.id}/complete`, { method: 'POST' });
                        staged = null;
                        documents = [doc];
                    } else {
                        const data = new FormData();
                        data.append('files', file);
                        documents = (await api<{ documents: (Doc & { duplicate?: boolean })[] }>(`/workspaces/${target}/documents`, { method: 'POST', body: data })).documents;
                    }
                    for (const doc of documents) {
                        if (!doc.id) problems.push(`${doc.name}: ${doc.error}`);
                        else if (doc.duplicate) duplicates++;
                        else added.push(doc.id);
                    }
                } catch (error) {
                    problems.push(`${file.name}: ${(error as Error).message}`);
                    if (staged) await api(`/workspaces/${target}/uploads/${staged}`, { method: 'DELETE' }).catch(() => undefined);
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

    return {
        uploading,
        webUrl,
        setWebUrl,
        webBusy,
        uploadProgress,
        uploadSummary,
        setUploadSummary,
        upload,
        importWebPage,
    };
}
