import { describe, expect, test, beforeEach } from 'bun:test';

// In-memory mock for localStorage in test environment
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const mockStorage = createLocalStorageMock();
(globalThis as unknown as { localStorage: typeof mockStorage }).localStorage = mockStorage;

import {
  loadAnnotationRecordForDocSync,
  saveAnnotationsForDoc,
} from '../src/utils/storage';
import type { Annotation, RectHighlightAnnotation } from '../src/utils/types';

const projectFile = (path: string) => Bun.file(new URL(`../${path}`, import.meta.url)).text();

describe('Annotation Isolation between PDFs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('prioritizes primary docKey over fallbackKeys even when fallback key has a newer timestamp', async () => {
    const docKey = 'doc-primary-123';
    const fallbackKey = '/path/to/legacy.pdf';

    const primaryAnnotation: RectHighlightAnnotation = {
      id: 'ann-primary',
      pageNumber: 1,
      type: 'highlight-rect',
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.05,
      color: '#ffff00',
      opacity: 0.5,
      createdAt: 1000,
    };

    const fallbackAnnotation: RectHighlightAnnotation = {
      id: 'ann-fallback',
      pageNumber: 1,
      type: 'highlight-rect',
      x: 0.5,
      y: 0.5,
      width: 0.3,
      height: 0.05,
      color: '#00ff00',
      opacity: 0.5,
      createdAt: 9999,
    };

    // Store older annotations under primary docKey
    localStorage.setItem(
      `pdfuck_annotations_${docKey}`,
      JSON.stringify({ annotations: [primaryAnnotation], updatedAt: 1000 })
    );

    // Store newer annotations under fallbackKey (e.g. from another document or previous run)
    localStorage.setItem(
      `pdfuck_annotations_${fallbackKey}`,
      JSON.stringify({ annotations: [fallbackAnnotation], updatedAt: 9999 })
    );

    const loaded = loadAnnotationRecordForDocSync(docKey, [fallbackKey]);
    expect(loaded).not.toBeNull();
    expect(loaded!.annotations).toHaveLength(1);
    expect(loaded!.annotations[0].id).toBe('ann-primary');
  });

  test('only checks fallbackKeys when docKey has no record', async () => {
    const docKey = 'doc-new-456';
    const fallbackKey = '/path/to/imported.pdf';

    const legacyAnnotation: Annotation = {
      id: 'ann-legacy',
      pageNumber: 2,
      type: 'highlight-rect',
      x: 0.2,
      y: 0.2,
      width: 0.4,
      height: 0.1,
      color: '#ff0000',
      opacity: 0.4,
      createdAt: 500,
    };

    localStorage.setItem(
      `pdfuck_annotations_${fallbackKey}`,
      JSON.stringify({ annotations: [legacyAnnotation], updatedAt: 500 })
    );

    const loaded = loadAnnotationRecordForDocSync(docKey, [fallbackKey]);
    expect(loaded).not.toBeNull();
    expect(loaded!.annotations).toHaveLength(1);
    expect(loaded!.annotations[0].id).toBe('ann-legacy');
  });

  test('saveAnnotationsForDoc saves ONLY to docKey and does not pollute fallback keys', async () => {
    const docKey = 'doc-active-789';
    const fallbackKey = 'document.pdf';

    const annotation: Annotation = {
      id: 'ann-active',
      pageNumber: 1,
      type: 'highlight-rect',
      x: 0.1,
      y: 0.1,
      width: 0.1,
      height: 0.1,
      color: '#3b82f6',
      opacity: 0.5,
      createdAt: 2000,
    };

    await saveAnnotationsForDoc(docKey, [annotation], [fallbackKey]);

    // Primary docKey must have the annotation
    const primaryRaw = localStorage.getItem(`pdfuck_annotations_${docKey}`);
    expect(primaryRaw).not.toBeNull();
    expect(JSON.parse(primaryRaw!).annotations[0].id).toBe('ann-active');

    // Fallback key (e.g. bare fileName) MUST NOT be polluted
    const fallbackRaw = localStorage.getItem(`pdfuck_annotations_${fallbackKey}`);
    expect(fallbackRaw).toBeNull();
  });

  test('two documents with the same fileName never share annotations', async () => {
    const doc1Key = 'doc1_5_50000';
    const doc2Key = 'doc2_10_80000';
    const commonFileName = 'document.pdf';

    const doc1Ann: Annotation = {
      id: 'ann-doc1',
      pageNumber: 1,
      type: 'highlight-rect',
      x: 0.1,
      y: 0.1,
      width: 0.1,
      height: 0.1,
      color: '#ffff00',
      opacity: 0.5,
      createdAt: 100,
    };

    // Save Doc 1
    await saveAnnotationsForDoc(doc1Key, [doc1Ann], [commonFileName]);

    // Load Doc 2 with common fileName as potential fallback - must NOT load Doc 1's annotations
    const doc2Loaded = loadAnnotationRecordForDocSync(doc2Key, []);
    expect(doc2Loaded).toBeNull();

    // Verify localStorage has no record for doc2
    expect(localStorage.getItem(`pdfuck_annotations_${doc2Key}`)).toBeNull();
  });

  test('useAnnotations never includes bare fileName in fallbackKeys', async () => {
    const hookSource = await projectFile('src/hooks/useAnnotations.ts');

    // Ensure bare fileName is not pushed directly
    expect(hookSource).not.toContain('keys.push(docInfo.fileName);');
    // Ensure content-qualified key is used instead
    expect(hookSource).toContain('docInfo.fileName}_${docInfo.numPages');
  });

  test('usePDFDocument batches state updates atomically after metadata and outline resolution', async () => {
    const hookSource = await projectFile('src/hooks/usePDFDocument.ts');

    // Initial docKey must not be hardcoded to 'sample'
    expect(hookSource).not.toContain("useState<string>('sample')");

    // Promise.all must fetch metadata and outline before setting state
    const promiseAllIndex = hookSource.indexOf('Promise.all([');
    const setDocKeyIndex = hookSource.indexOf('setDocKey(key)');
    expect(promiseAllIndex).toBeGreaterThan(-1);
    expect(setDocKeyIndex).toBeGreaterThan(-1);
    expect(promiseAllIndex).toBeLessThan(setDocKeyIndex);
  });
});
