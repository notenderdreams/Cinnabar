import { describe, expect, test } from 'bun:test';
import { getChatRetry } from '../src/lib/ai/chatRetry';
import type { AiChatMessage } from '../src/lib/types';

const user: AiChatMessage = {
  id: 'question', docKey: 'pdf-a', role: 'user', content: 'Add that to my notes.', timestamp: 1,
  pageNumber: 3, attachments: [{ id: 'quote', type: 'text', text: 'Original quote', pageNumber: 3 }],
};
const error: AiChatMessage = { id: 'failed', role: 'assistant', content: 'CLI diagnostics', status: 'error', timestamp: 2 };

describe('AI chat retry', () => {
  test('keeps the original question, page and attachments while excluding failure diagnostics and later turns', () => {
    const history: AiChatMessage = { id: 'context', role: 'assistant', content: 'Earlier explanation', timestamp: 0 };
    const later: AiChatMessage = { ...user, id: 'later', content: 'Another question' };
    const retry = getChatRetry([history, user, error, later], error.id, 'pdf-a');
    expect(retry?.user).toEqual(user);
    expect(retry?.history).toEqual([history]);
    expect(retry?.user.pageNumber).toBe(3);
    expect(retry?.user.attachments).toBe(user.attachments);
  });

  test('rejects retries against a different PDF or a successful response', () => {
    expect(getChatRetry([user, error], error.id, 'pdf-b')).toBeNull();
    expect(getChatRetry([user, { ...error, status: 'complete' }], error.id, 'pdf-a')).toBeNull();
    expect(getChatRetry([error], error.id, 'pdf-a')).toBeNull();
    expect(getChatRetry([user, error], 'missing', 'pdf-a')).toBeNull();
  });

  test('supports previously saved errors without document metadata and attachment-only questions', () => {
    const legacy = { ...user, docKey: undefined, content: '(Attached snippet/reference)' };
    expect(getChatRetry([legacy, error], error.id, 'pdf-a')?.user).toEqual(legacy);
  });
});
