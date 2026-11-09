import type { Annotation } from './types';
import { reindexAfterPageDeletion, reindexAfterPageInsertion } from './pdf/pageExtractor';

export const notebookKey = (docKey: string) => docKey ? `cinnabar:notebook:v1:${docKey}` : '';

export function loadNotePageCount(key: string): number {
  try {
    const count = Number(localStorage.getItem(`${key}:pages`));
    return Number.isSafeInteger(count) && count > 0 ? count : 1;
  } catch {
    return 1;
  }
}

export function notePageCount(savedCount: number, annotations: Annotation[]): number {
  return annotations.reduce((count, annotation) => Math.max(count, annotation.pageNumber), savedCount);
}

/** Keep notebook contents and navigation together when a sheet is inserted or removed. */
export function editNotePages(annotations: Annotation[], pageCount: number, page: number, action: 'insert' | 'delete') {
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new Error('Note page does not exist.');
  }
  if (action === 'insert') {
    return { annotations: reindexAfterPageInsertion(annotations, page), count: pageCount + 1, page: page + 1 };
  }
  const count = Math.max(1, pageCount - 1);
  return { annotations: reindexAfterPageDeletion(annotations, page), count, page: Math.min(page, count) };
}
