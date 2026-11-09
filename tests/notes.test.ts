import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { notebookKey, loadNotePageCount, notePageCount, editNotePages } from '../src/lib/notes';
import { loadAnnotationsForDoc, saveAnnotationsForDoc } from '../src/lib/storage/storage';
import type { Annotation } from '../src/lib/types';

describe('PDF-linked notebooks', () => {
  let originalStorage: PropertyDescriptor | undefined;
  beforeEach(() => {
    originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => values.clear(),
    } });
  });
  afterEach(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  test('keeps notebooks independent from source annotations and other PDFs', async () => {
    const source: Annotation = { id: 'source', type: 'text-note', pageNumber: 1, x: .1, y: .1, text: 'PDF annotation', color: '#000', fontSize: 14, createdAt: 1 };
    const note: Annotation = { ...source, id: 'note', text: 'My summary', pageNumber: 3 };
    await saveAnnotationsForDoc('notebook-test-a', [source]);
    await saveAnnotationsForDoc(notebookKey('notebook-test-a'), [note]);
    expect(loadAnnotationsForDoc('notebook-test-a')).toEqual([source]);
    expect(loadAnnotationsForDoc(notebookKey('notebook-test-a'))).toEqual([note]);
    expect(loadAnnotationsForDoc(notebookKey('notebook-test-b'))).toEqual([]);
    expect(notebookKey('')).toBe('');
  });

  test('restores empty pages and recovers occupied pages if page metadata is lost', () => {
    const key = notebookKey('page-count-test');
    localStorage.setItem(`${key}:pages`, '5');
    expect(loadNotePageCount(key)).toBe(5);
    localStorage.setItem(`${key}:pages`, 'invalid');
    expect(loadNotePageCount(key)).toBe(1);
    const note: Annotation = { id: 'note', type: 'text-note', pageNumber: 7, x: .1, y: .1, text: 'Summary', color: '#000', fontSize: 14, createdAt: 1 };
    expect(notePageCount(1, [note])).toBe(7);
    expect(notePageCount(9, [note])).toBe(9);
  });

  test('inserts after the targeted page and preserves later content through deletion', () => {
    const first: Annotation = { id: 'first', type: 'text-note', pageNumber: 1, x: .1, y: .1, text: 'First summary', color: '#000', fontSize: 14, createdAt: 1 };
    const later: Annotation = { ...first, id: 'later', pageNumber: 2, text: 'Later summary' };
    const inserted = editNotePages([first, later], 2, 1, 'insert');
    expect(inserted.count).toBe(3);
    expect(inserted.page).toBe(2);
    expect(inserted.annotations.map(({ id, pageNumber }) => ({ id, pageNumber }))).toEqual([
      { id: 'first', pageNumber: 1 }, { id: 'later', pageNumber: 3 },
    ]);
    expect(editNotePages(inserted.annotations, 3, 2, 'delete')).toEqual({ annotations: [first, later], count: 2, page: 2 });
    const deleted = editNotePages([first, later], 2, 1, 'delete');
    expect(deleted).toEqual({ annotations: [{ ...later, pageNumber: 1 }], count: 1, page: 1 });
    expect([first, later].map(({ pageNumber }) => pageNumber)).toEqual([1, 2]);
  });

  test('deleting the last sheet leaves a blank page and invalid targets do not mutate notes', () => {
    const note: Annotation = { id: 'last', type: 'text-note', pageNumber: 1, x: .1, y: .1, text: 'Last summary', color: '#000', fontSize: 14, createdAt: 1 };
    expect(editNotePages([note], 1, 1, 'delete')).toEqual({ annotations: [], count: 1, page: 1 });
    expect(() => editNotePages([note], 1, 0, 'delete')).toThrow();
    expect(() => editNotePages([note], 1, 2, 'insert')).toThrow();
    expect(note.pageNumber).toBe(1);
  });
});
