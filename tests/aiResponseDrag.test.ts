import { describe, test, expect } from 'bun:test';
import {
  AI_RESPONSE_DRAG_MIME,
  extractAiResponseDragPayload,
  findOriginatingPrompt,
  setAiResponseDragDroppable,
  subscribeAiResponseDragDroppable,
  isAiResponseDragDroppable,
  setActiveAiResponseDrag,
  getActiveAiResponseDrag,
  subscribeActiveAiResponseDrag,
  extractPlainTextPreview,
  createAiResponseDragGhost,
  getTransparentDragImage,
} from '../src/utils/aiResponseDrag';

describe('aiResponseDrag', () => {
  test('extractAiResponseDragPayload extracts valid JSON payload', () => {
    const payload = { prompt: 'What is this?', response: 'This is an explanation.' };
    const fakeDataTransfer = {
      getData: (mime: string) => (mime === AI_RESPONSE_DRAG_MIME ? JSON.stringify(payload) : ''),
    } as unknown as DataTransfer;

    const extracted = extractAiResponseDragPayload(fakeDataTransfer);
    expect(extracted).not.toBeNull();
    expect(extracted?.prompt).toBe('What is this?');
    expect(extracted?.response).toBe('This is an explanation.');
  });

  test('extractAiResponseDragPayload returns null on empty or missing data', () => {
    const fakeEmpty = {
      getData: () => '',
    } as unknown as DataTransfer;
    expect(extractAiResponseDragPayload(fakeEmpty)).toBeNull();

    const fakeInvalidJson = {
      getData: () => '{ invalid json',
    } as unknown as DataTransfer;
    expect(extractAiResponseDragPayload(fakeInvalidJson)).toBeNull();

    const fakeBlankResponse = {
      getData: () => JSON.stringify({ prompt: 'test', response: '   ' }),
    } as unknown as DataTransfer;
    expect(extractAiResponseDragPayload(fakeBlankResponse)).toBeNull();
  });

  test('findOriginatingPrompt locates the closest preceding user prompt', () => {
    const messages = [
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: '(Attached snippet/reference)' },
      { role: 'user', content: 'Second question' },
      { role: 'assistant', content: 'Second answer' },
    ];

    expect(findOriginatingPrompt(messages, 4)).toBe('Second question');
    expect(findOriginatingPrompt(messages, 1)).toBe('First question');
  });

  test('droppable state updates listeners and resets properly', () => {
    const states: boolean[] = [];
    const unsubscribe = subscribeAiResponseDragDroppable((droppable) => {
      states.push(droppable);
    });

    setAiResponseDragDroppable(true);
    expect(isAiResponseDragDroppable()).toBe(true);

    setAiResponseDragDroppable(false);
    expect(isAiResponseDragDroppable()).toBe(false);

    unsubscribe();

    setAiResponseDragDroppable(true);
    // Listener should not have received this new update after unsubscribe
    expect(states[states.length - 1]).toBe(false);

    // Clean up
    setAiResponseDragDroppable(false);
  });

  test('active drag state updates listeners and resets properly', () => {
    const states: Array<{ prompt: string; response: string } | null> = [];
    const unsubscribe = subscribeActiveAiResponseDrag((payload) => {
      states.push(payload);
    });

    const testPayload = { prompt: 'Explain theorem', response: 'Here is the proof...' };
    setActiveAiResponseDrag(testPayload);
    expect(getActiveAiResponseDrag()).toEqual(testPayload);

    setActiveAiResponseDrag(null);
    expect(getActiveAiResponseDrag()).toBeNull();

    unsubscribe();
    setActiveAiResponseDrag(testPayload);
    // Listener should not receive updates after unsubscribe
    expect(states[states.length - 1]).toBeNull();

    // Clean up
    setActiveAiResponseDrag(null);
  });

  test('extractPlainTextPreview strips markdown formatting and truncates cleanly', () => {
    const md = '## Heading\nThis is **bold** and *italic* with `code block`.\n```ts\nconst x = 1;\n```\nCheck [link](https://example.com).';
    const preview = extractPlainTextPreview(md, 120);
    expect(preview.includes('##')).toBe(false);
    expect(preview.includes('**')).toBe(false);
    expect(preview.includes('const x = 1')).toBe(false);
    expect(preview.includes('[code]')).toBe(true);
    expect(preview.includes('link')).toBe(true);

    const truncated = extractPlainTextPreview('A very long sentence that exceeds the small limit requested', 15);
    expect(truncated.endsWith('…')).toBe(true);
    expect(truncated.length <= 16).toBe(true);
  });

  test('createAiResponseDragGhost handles environments and creates styled drag image', () => {
    // Graceful fallback when document is absent
    if (typeof document === 'undefined') {
      expect(createAiResponseDragGhost('prompt', 'response')).toBeNull();
    }

    // Mock document to verify element construction
    const mockCreated = {
      className: '',
      setAttribute: (_name: string, _val: string) => {},
      style: { cssText: '' },
      innerHTML: '',
    };
    const mockDocument = {
      documentElement: { getAttribute: () => 'dark' },
      createElement: () => mockCreated,
      body: { appendChild: (_el: unknown) => {} },
    };

    (globalThis as unknown as { document: typeof mockDocument }).document = mockDocument;
    try {
      const ghost = createAiResponseDragGhost('What is this?', 'It is a complex tensor formula.');
      expect(ghost).not.toBeNull();
      expect(ghost?.className).toBe('cinnabar-ai-drag-ghost');
      expect(mockCreated.innerHTML.includes('AI Response Card')).toBe(true);
      expect(mockCreated.innerHTML.includes('Cinnabar AI')).toBe(true);
      expect(mockCreated.innerHTML.includes('What is this?')).toBe(true);
      expect(mockCreated.innerHTML.includes('complex tensor formula')).toBe(true);
    } finally {
      // @ts-expect-error cleanup global mock
      delete (globalThis as Record<string, unknown>).document;
    }
  });

  test('getTransparentDragImage returns a 1x1 transparent image for suppressing OS ghost', () => {
    if (typeof document === 'undefined') {
      expect(getTransparentDragImage()).toBeNull();
    }

    const mockImg = {
      src: '',
      style: { cssText: '' },
    };
    const mockDocument = {
      createElement: () => mockImg,
      body: { appendChild: (_el: unknown) => {} },
    };

    (globalThis as unknown as { document: typeof mockDocument }).document = mockDocument;
    try {
      const img = getTransparentDragImage();
      expect(img).not.toBeNull();
      expect(img?.src.includes('data:image/gif;base64')).toBe(true);
    } finally {
      // @ts-expect-error cleanup global mock
      delete (globalThis as Record<string, unknown>).document;
    }
  });
});
