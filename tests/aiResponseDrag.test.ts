import { describe, test, expect } from 'bun:test';
import {
  AI_RESPONSE_DRAG_MIME,
  extractAiResponseDragPayload,
  findOriginatingPrompt,
  setAiResponseDragDroppable,
  subscribeAiResponseDragDroppable,
  isAiResponseDragDroppable,
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
});
