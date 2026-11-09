import type { Annotation } from './types';

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
