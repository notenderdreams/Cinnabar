import { describe, expect, test } from 'bun:test';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { readPdfOverview, withPdfDeadline } from '../src/lib/pdf/documentOverview';

const document = (overrides: Record<string, unknown> = {}) => ({
  getMetadata: async () => ({ info: { Title: 'Book title', Author: 'Writer' } }),
  getOutline: async () => [{ title: 'Chapter', dest: 'chapter' }],
  getDestination: async () => [{ num: 1, gen: 0 }],
  getPageIndex: async () => 2,
  ...overrides,
} as unknown as PDFDocumentProxy);

describe('bounded PDF document opening', () => {
  test('keeps metadata and resolves named outline destinations normally', async () => {
    expect(await readPdfOverview(document())).toEqual({ title: 'Book title', author: 'Writer', outline: [{ title: 'Chapter', pageNumber: 3 }] });
  });

  test('does not let missing metadata keep the reader in Opening PDF', async () => {
    expect(await readPdfOverview(document({ getMetadata: () => new Promise(() => {}) }), 5)).toEqual({ outline: [] });
  });

  test('also bounds outline loading and destination resolution', async () => {
    expect(await readPdfOverview(document({ getOutline: () => new Promise(() => {}) }), 5)).toEqual({ outline: [] });
    expect(await readPdfOverview(document({ getDestination: () => new Promise(() => {}) }), 5)).toEqual({ outline: [] });
  });

  test('allows readable PDFs without metadata and rejects a stalled main loading task', async () => {
    expect(await readPdfOverview(document({ getMetadata: async () => { throw new Error('Missing XMP'); }, getOutline: async () => null }))).toEqual({ title: undefined, author: undefined, outline: [] });
    expect(withPdfDeadline(new Promise(() => {}), 5)).rejects.toThrow('PDF loading timed out');
  });
});
