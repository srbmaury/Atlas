import type { Doc } from './types';

/**
 * Document polling should only change React state when the visible metadata
 * changes. Compare the fields consumed by the workspace and document library.
 */
export function sameDocumentSnapshot(current: readonly Doc[], next: readonly Doc[]): boolean {
    return (
        current.length === next.length &&
        current.every((doc, index) => {
            const updated = next[index];
            return (
                doc.id === updated.id &&
                doc.name === updated.name &&
                doc.size === updated.size &&
                doc.status === updated.status &&
                doc.error === updated.error &&
                doc.pages === updated.pages &&
                doc.chunk_count === updated.chunk_count &&
                (doc.ocr_pages ?? []).join(',') === (updated.ocr_pages ?? []).join(',')
            );
        })
    );
}
