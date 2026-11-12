import { describe, expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { emptyNotebook, identifyBlocks, markdownBlocks, migrateNotebook, notebookCarrier, notebookText, withNotebook } from '../src/lib/notebook/document';
import { notebookExtensions } from '../src/lib/notebook/extensions';
import { editNotebookSheet, mergeNotebookData } from '../src/lib/notebook/operations';
import { prepareNotebookMigration } from '../src/lib/notebook/migration';
import { appendAiNotebookText, getAiNotebookContext, insertAiNotebookImage } from '../src/lib/ai/notebookActions';
import { parseAnnotationsJson } from '../src/lib/annotations/annotationTransfer';
import { parseStoredAnnotationRecord } from '../src/lib/storage/storage';
import type { Annotation, TextNoteAnnotation } from '../src/lib/types';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=';
const note = (pageNumber: number, text: string): TextNoteAnnotation => ({ id: `note-${pageNumber}`, type: 'text-note', format: 'markdown',
  pageNumber, text, x: .08, y: .08, width: .84, fontSize: 13, color: '#222222', createdAt: pageNumber });
const schema = getSchema(notebookExtensions(false));
describe('logical notebook documents', () => {
  test('migrates rich Markdown, images and legacy sheet boundaries without changing drawings or plain notes', () => {
    const first = { ...note(1, '# Title\n\n**Bold** and $x^2$\n\n![Caption](notebook-image/image)'), inlineImages: { image: { dataUrl: png, width: 100, height: 80 } } };
    const drawing: Annotation = { id: 'ink', type: 'pen', pageNumber: 2, points: [{ x: .3, y: .6 }], color: '#f00', strokeWidth: 2, opacity: 1, createdAt: 1 };
    const plain = { ...note(3, 'Plain note'), id: 'plain', format: 'plain' as const };
    const original = [first, drawing, plain, note(4, '| A | B |\n|---|---|\n| 1 | 2 |\n\n$$\nx+y\n$$')];
    const untouched = JSON.stringify(original);
    const migrated = migrateNotebook(original, 6);
    const doc = notebookCarrier(migrated)!.notebookDocument!;
    expect(JSON.stringify(original)).toBe(untouched);
    expect(migrated.find((item) => item.id === 'ink')).toBe(drawing);
    expect(migrated.find((item) => item.id === 'plain')).toBe(plain);
    expect(doc.minimumSheets).toBe(6);
    expect(doc.content.content!.filter((node) => node.type === 'sheetBreak')).toHaveLength(3);
    expect(doc.assets.image.dataUrl).toBe(png);
    expect(doc.content.content!.find((node) => node.type === 'image')!.attrs!.src).toBe(png);
    expect(schema.nodeFromJSON(doc.content).check()).toBeUndefined();
    expect(migrateNotebook(migrated, 6)).toBe(migrated);
    expect(notebookText(doc.content)).toContain('x+y');
  });
  test('conversion fails atomically for a missing image or unsupported raw HTML', () => {
    const missing = [note(1, '![Lost](notebook-image/missing)')];
    const before = JSON.stringify(missing);
    expect(() => migrateNotebook(missing, 1)).toThrow('Missing notebook image');
    expect(JSON.stringify(missing)).toBe(before);
    expect(() => markdownBlocks('<script>bad()</script>')).toThrow('Unsupported Markdown');
  });
  test('preserves nested checklists, references, code, links and table content through schema round-trip', () => {
    const markdown = '- [x] Complete\n  - [ ] Nested\n\n> Quote with [link][ref]\n\n[ref]: https://example.com\n\n```ts\nconst value = 1;\n```\n\n---';
    const content = identifyBlocks({ type: 'doc', content: markdownBlocks(markdown) });
    const node = schema.nodeFromJSON(content); node.check();
    expect(notebookText(node.toJSON())).toContain('Nested');
    expect(notebookText(node.toJSON())).toContain('const value = 1;');
    const duplicated = identifyBlocks({ type: 'doc', content: [content.content![0], content.content![0]] });
    expect(duplicated.content![0].attrs!.id).not.toBe(duplicated.content![1].attrs!.id);
  });
  test('reopens structured data through existing persistence and JSON transfer formats', () => {
    const doc = emptyNotebook(3); doc.content.content = markdownBlocks('# Title\n\nText');
    doc.styles.fontSize = 18; doc.content.content[1].attrs!.fontSize = 12;
    doc.assets.image = { dataUrl: png, width: 1, height: 1 };
    const annotations = withNotebook([], doc);
    const reopened = parseStoredAnnotationRecord(JSON.stringify({ annotations, updatedAt: 10 }))!;
    expect(notebookCarrier(reopened.annotations)!.notebookDocument).toEqual(doc);
    expect(notebookCarrier(parseAnnotationsJson(JSON.stringify(annotations)))!.notebookDocument).toEqual(doc);
    expect(getAiNotebookContext('key', 3, reopened.annotations).text).toContain('Title');
  });
  test('deletes sheet content and annotations as one restorable state', () => {
    const doc = emptyNotebook(3); doc.content.content = markdownBlocks('First\n\nSecond\n\nThird');
    const node = schema.nodeFromJSON(doc.content); const positions: number[] = [];
    node.forEach((_node, pos) => positions.push(pos));
    const drawing: Annotation = { id: 'ink', type: 'pen', pageNumber: 2, points: [{ x: .3, y: .6 }], color: '#f00', strokeWidth: 2, opacity: 1, createdAt: 1 };
    const before = withNotebook([drawing], doc);
    const result = editNotebookSheet(before, 3, 2, 'delete', { pages: positions.map((from, i) => ({ from, to: positions[i + 1] ?? node.content.size })), height: 2600 });
    expect(result.count).toBe(2);
    expect(notebookCarrier(result.annotations)!.text).toContain('First');
    expect(notebookCarrier(result.annotations)!.text).toContain('Third');
    expect(notebookCarrier(result.annotations)!.text).not.toContain('Second');
    expect(result.annotations.some((item) => item.id === 'ink')).toBe(false);
    expect(before.some((item) => item.id === 'ink')).toBe(true);
    expect(notebookCarrier(before)!.text).toContain('Second');
  });
  test('AI adds blocks and image assets without moving sheet annotations or rewriting existing blocks', async () => {
    const doc = emptyNotebook(2); doc.content.content = markdownBlocks('# Title\n\nExisting');
    const annotations = withNotebook([], doc);
    const appended = await appendAiNotebookText(annotations, 2, '## Added\n\n- New item');
    const next = notebookCarrier(appended.annotations)!.notebookDocument!;
    expect(next.content.content!.slice(0, 2)).toEqual(doc.content.content);
    expect(notebookCarrier(annotations)!.text).not.toContain('New item');
    const inserted = await insertAiNotebookImage(appended.annotations, 2, 1,
      { id: 'attachment', type: 'image', dataUrl: png, width: 100, height: 100, pageNumber: 1 },
      { attachmentId: 'attachment', pageNumber: null, placement: 'after_title' });
    const imageDoc = notebookCarrier(inserted.annotations)!.notebookDocument!;
    expect(imageDoc.content.content![1].type).toBe('image');
    expect(Object.values(imageDoc.assets)[0].dataUrl).toBe(png);
    expect(imageDoc.minimumSheets).toBe(2);
    expect(schema.nodeFromJSON(imageDoc.content).check()).toBeUndefined();
  });
  test('inserts a blank sheet inside a continued paragraph without losing text', () => {
    const doc = emptyNotebook(); doc.content.content = markdownBlocks('First half and second half');
    const before = withNotebook([], doc); const end = schema.nodeFromJSON(doc.content).content.size;
    const result = editNotebookSheet(before, 2, 1, 'insert', { pages: [{ from: 0, to: 16 }, { from: 16, to: end }], height: 1708 });
    const next = notebookCarrier(result.annotations)!.notebookDocument!;
    const node = schema.nodeFromJSON(next.content); node.check();
    expect(node.textContent).toBe('First half and second half');
    expect(result.count).toBe(3);
    expect(next.content.content!.filter((block) => block.type === 'sheetBreak')).toHaveLength(2);
  });
  test('blocks migration when recovery cannot save, and keeps the first recovery snapshot across retries', async () => {
    const original = [note(1, '# Original')];
    const records = new Map<string, { annotations: Annotation[]; count: number }>();
    const recovery = { exists: async (key: string) => records.has(key), save: async (key: string, annotations: Annotation[], count: number) => { records.set(key, { annotations: structuredClone(annotations), count }); } };
    await expect(prepareNotebookMigration('key', original, 4, { ...recovery, save: async () => { throw new Error('Storage unavailable'); } })).rejects.toThrow('Storage unavailable');
    expect(notebookCarrier(original)).toBeUndefined();
    const migrated = await prepareNotebookMigration('key', original, 4, recovery);
    expect(notebookCarrier(migrated)).toBeDefined();
    await prepareNotebookMigration('key', [note(1, '# Edited')], 2, recovery);
    expect(records.size).toBe(1);
    expect(records.get('key:recovery:before-blocks-v1')).toEqual({ annotations: original, count: 4 });
  });
  test('merges notebook transfers without losing images or sheet annotations', () => {
    const doc = emptyNotebook(); doc.content.content = markdownBlocks('# Existing');
    doc.assets.image = { dataUrl: png, width: 1, height: 1 };
    const incoming = emptyNotebook(2); incoming.styles.fontSize = 18;
    incoming.assets.image = { dataUrl: png, width: 100, height: 100 };
    incoming.content.content = markdownBlocks('# Imported\n\n![Caption](notebook-image/image)', incoming.assets);
    incoming.content = schema.nodeFromJSON(incoming.content).toJSON();
    const result = mergeNotebookData(withNotebook([], doc), withNotebook([], incoming), 1, 1);
    const merged = notebookCarrier(result)!.notebookDocument!;
    expect(Object.keys(merged.assets)).toHaveLength(2);
    expect(merged.minimumSheets).toBe(3);
    expect(notebookText(merged.content)).toContain('Existing');
    expect(notebookText(merged.content)).toContain('Imported');
    expect(merged.content.content!.find((node) => node.type === 'image')!.attrs!.fontSize).toBe(18);
    expect(schema.nodeFromJSON(merged.content).check()).toBeUndefined();
    expect(() => parseAnnotationsJson(withNotebook([], { ...doc, version: 2 } as unknown as typeof doc))).toThrow('Unsupported or invalid');
  });
  test('adds sheets after trailing blank or annotation-only pages', () => {
    const doc = emptyNotebook(3); const before = withNotebook([], doc);
    const end = schema.nodeFromJSON(doc.content).content.size;
    const next = editNotebookSheet(before, 3, 3, 'insert', { pages: [{ from: 0, to: end }], height: 842 });
    expect(next.count).toBe(4);
    const model = notebookCarrier(next.annotations)!.notebookDocument!;
    expect(model.content.content!.filter((block) => block.type === 'sheetBreak')).toHaveLength(3);
    expect(schema.nodeFromJSON(model.content).check()).toBeUndefined();
  });
});
