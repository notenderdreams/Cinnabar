import { describe, expect, test } from 'bun:test';
import { getClipboardImageFiles } from '../src/lib/ai/chatClipboard';

describe('AI clipboard image selection', () => {
  const image = new File(['image'], 'clipboard.png', { type: 'image/png' });

  test('selects file images and leaves text paste alone', () => {
    const clipboard = {
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => image },
      ], files: [image],
    } as unknown as DataTransfer;
    expect(getClipboardImageFiles(clipboard)).toEqual([image]);
    expect(getClipboardImageFiles({ items: [clipboard.items[0]], files: [] } as unknown as DataTransfer)).toEqual([]);
  });

  test('supports clipboard implementations that expose images through files only', () => {
    const clipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => null }],
      files: [new File(['text'], 'note.txt', { type: 'text/plain' }), image],
    } as unknown as DataTransfer;
    expect(getClipboardImageFiles(clipboard)).toEqual([image]);
  });
});
