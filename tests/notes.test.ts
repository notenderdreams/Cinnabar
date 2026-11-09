import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { notebookKey, loadNotePageCount, notePageCount } from '../src/lib/notes';
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
});
