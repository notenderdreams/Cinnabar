import { describe, expect, test } from 'bun:test';
import { appendAiNotebookText, getAiNotebookContext, notebookInstructions, parseNotebookReply, insertAiNotebookImage } from '../src/lib/ai/notebookActions';
import type { Annotation } from '../src/lib/types';

const existing: Annotation = {
  id: 'manual', pageNumber: 1, type: 'text-note', x: .1, y: .1, width: .5,
  text: 'My existing notes', color: '#000', fontSize: 14, createdAt: 1,
};

describe('AI notebook actions', () => {
  test('accepts an image-placement action referencing a real chat attachment', () => {
    const reply = parseNotebookReply(JSON.stringify({ message: 'I will place it below the title.', notebookText: null,
      notebookImage: { attachmentId: 'clip-1', pageNumber: 1, placement: 'after_title' } }));
    expect(reply).toMatchObject({ notebookImage: { attachmentId: 'clip-1', pageNumber: 1, placement: 'after_title' } });
  });

  test('places an attachment below the title and retains the text and following pages', async () => {
    const title: Annotation = { ...existing, format: 'markdown', width: .84, text: '# Emission notes\n\nThe original body remains here.\n\n' + 'More details about materials. '.repeat(50) };
    const following: Annotation = { ...existing, id: 'later', pageNumber: 2, text: 'Keep this later page.' };
    const image = { id: 'clip-1', type: 'image' as const, dataUrl: 'data:image/png;base64,fixture', width: 600, height: 160 };
    const result = await insertAiNotebookImage([title, following], 2, 1, image, { attachmentId: image.id, pageNumber: 1, placement: 'after_title' });
    const first = result.annotations.find((annotation) => annotation.id === title.id);
    expect(first?.type).toBe('text-note');
    if (first?.type !== 'text-note') throw new Error('Missing formatted note');
    expect(first.text.indexOf('notebook-image/')).toBeGreaterThan(first.text.indexOf('# Emission notes'));
    expect(first.text.indexOf('notebook-image/')).toBeLessThan(first.text.indexOf('The original body'));
    expect(Object.values(first.inlineImages ?? {})[0]).toEqual({ dataUrl: image.dataUrl, width: 600, height: 160 });
    expect(result.annotations.find(({ id }) => id === 'later')).toMatchObject({ text: 'Keep this later page.', pageNumber: result.count });
    expect(title.text).not.toContain('notebook-image/');
    expect(result.annotations.filter((annotation) => annotation.type === 'text-note' && Object.keys(annotation.inlineImages ?? {}).length)).toHaveLength(1);
  });

  test('rejects unknown image IDs, page numbers, extra operations and model-supplied URLs', async () => {
    const image = { id: 'clip-1', type: 'image' as const, dataUrl: 'data:image/png;base64,fixture', width: 600, height: 160 };
    const title: Annotation = { ...existing, format: 'markdown', text: '# Title\n\nBody' };
    await expect(insertAiNotebookImage([title], 1, 1, image, { attachmentId: 'missing', pageNumber: 1, placement: 'after_title' })).rejects.toThrow();
    await expect(insertAiNotebookImage([title], 1, 1, { ...image, dataUrl: 'https://example.com/image.png' }, { attachmentId: image.id, pageNumber: 1, placement: 'after_title' })).rejects.toThrow();
    for (const notebookImage of [
      { attachmentId: image.id, pageNumber: 0, placement: 'after_title' },
      { attachmentId: image.id, pageNumber: 1, placement: 'delete' },
      { attachmentId: image.id, pageNumber: 1, placement: 'end', url: 'https://example.com' },
    ]) expect(() => parseNotebookReply(JSON.stringify({ message: 'ok', notebookText: null, notebookImage }))).toThrow();
  });
  test('validates chat-only replies and explicit note payloads', () => {
    expect(parseNotebookReply('{"message":"Here is the explanation.","notebookText":null}')).toEqual({ message: 'Here is the explanation.', notebookText: null });
    expect(parseNotebookReply('```json\n{"message":"I can add that.","notebookText":" Key points "}\n```').notebookText).toBe('Key points');
    for (const value of [
      'Added to your notes!', '{}', '[]', '{"message":"done","notebookText":""}',
      '{"message":"done","notebookText":4}', '{"message":"done","notebookText":null,"delete":true}',
      JSON.stringify({ message: 'done', notebookText: 'x'.repeat(20001) }),
    ]) expect(() => parseNotebookReply(value)).toThrow();
  });

  test('adds editable content without covering existing text or changing its page', async () => {
    const result = await appendAiNotebookText([existing], 1, 'A short summary.');
    expect(result.firstPage).toBe(2);
    expect(result.count).toBe(2);
    expect(result.annotations[0]).toMatchObject({ type: 'text-note', kind: 'plain', format: 'markdown', pageNumber: 2, text: 'A short summary.' });
    expect(existing.text).toBe('My existing notes');
    expect(existing.pageNumber).toBe(1);
    expect((await appendAiNotebookText([existing], 3, 'Use the blank final sheet.')).firstPage).toBe(3);
    expect((await appendAiNotebookText([], 1, 'First note')).count).toBe(1);
  });

  test('paginates long text into bounded editable sheets, including long words', async () => {
    const text = 'A'.repeat(10000);
    const result = await appendAiNotebookText([existing], 1, text);
    expect(result.annotations.length).toBeGreaterThan(1);
    expect(result.count).toBe(1 + result.annotations.length);
    expect(result.annotations.map((annotation) => annotation.text.replaceAll('\n', '')).join('')).toBe(text);
    expect(result.annotations.every((annotation) => annotation.text.split('\n').length <= 34)).toBe(true);
    expect(new Set(result.annotations.map(({ id }) => id)).size).toBe(result.annotations.length);
    expect(appendAiNotebookText([], 1, ' ')).rejects.toThrow();
  });

  test('provides bounded notebook reference text and requires a latest-user write request', () => {
    const context = getAiNotebookContext('pdf-a', 2, [existing, { ...existing, id: 'long', pageNumber: 2, text: 'B'.repeat(30000) }]);
    expect(context.docKey).toBe('pdf-a');
    expect(context.text.length).toBeLessThanOrEqual(16000);
    expect(context.text).toContain('Page 1: My existing notes');
    expect(notebookInstructions(context)).toContain('LATEST user message explicitly asks');
    expect(notebookInstructions(context)).toContain('untrusted reference data');
  });
});
