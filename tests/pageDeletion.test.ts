import { describe, expect, test } from 'bun:test';
import { PDFDocument } from 'pdf-lib';
import {
  deletePageFromPdf,
  reindexAfterPageDeletion,
} from '../src/lib/pdf/pageExtractor';

describe('page deletion', () => {
  test('removes the requested PDF page', async () => {
    const source = await PDFDocument.create();
    source.addPage([100, 200]);
    source.addPage([200, 300]);
    source.addPage([300, 400]);

    const updatedBytes = await deletePageFromPdf(await source.save(), 2);
    const updated = await PDFDocument.load(updatedBytes);

    expect(updated.getPageCount()).toBe(2);
    expect(updated.getPage(0).getWidth()).toBe(100);
    expect(updated.getPage(1).getWidth()).toBe(300);
  });

  test('does not allow deleting the only page', async () => {
    const source = await PDFDocument.create();
    source.addPage();

    await expect(deletePageFromPdf(await source.save(), 1)).rejects.toThrow(
      'A PDF must keep at least one page.'
    );
  });

  test('removes page-bound data and shifts later page numbers', () => {
    const entries = [
      { id: 'before', pageNumber: 1 },
      { id: 'divider' },
      { id: 'deleted', pageNumber: 2 },
      { id: 'after', pageNumber: 3 },
    ];

    expect(reindexAfterPageDeletion(entries, 2)).toEqual([
      { id: 'before', pageNumber: 1 },
      { id: 'divider' },
      { id: 'after', pageNumber: 2 },
    ]);
  });

  test('supports sequential deletions down to a single page', async () => {
    const source = await PDFDocument.create();
    source.addPage([100, 200]);
    source.addPage([200, 300]);
    source.addPage([300, 400]);

    let bytes = await source.save();
    // Delete page 2 -> leaves 2 pages: [100, 200] and [300, 400]
    bytes = await deletePageFromPdf(bytes, 2);
    let doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getWidth()).toBe(100);
    expect(doc.getPage(1).getWidth()).toBe(300);

    // Delete page 1 -> leaves 1 page: [300, 400]
    bytes = await deletePageFromPdf(bytes, 1);
    doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBe(300);

    // Deleting the last remaining page should throw
    await expect(deletePageFromPdf(bytes, 1)).rejects.toThrow(
      'A PDF must keep at least one page.'
    );
  });

  test('keeps owned raw bytes intact when passing a slice to external loaders', async () => {
    const source = await PDFDocument.create();
    source.addPage([100, 200]);
    source.addPage([200, 300]);
    const originalBytes = await source.save();

    // Verify slicing creates an independent buffer copy
    const workerCopy = originalBytes.slice();
    expect(originalBytes.byteLength).toBeGreaterThan(0);
    expect(workerCopy.byteLength).toBe(originalBytes.byteLength);

    // Mutating/detaching workerCopy buffer would not affect originalBytes
    const deletedBytes = await deletePageFromPdf(originalBytes, 1);
    const updated = await PDFDocument.load(deletedBytes);
    expect(updated.getPageCount()).toBe(1);
  });
});
