import type { AiChatMessage } from '../types';

/** Retry the original turn without feeding the failed CLI diagnostics back to the AI. */
export function getChatRetry(messages: AiChatMessage[], failedId: string, docKey?: string) {
  const failedIndex = messages.findIndex((message) => message.id === failedId);
  const failed = messages[failedIndex];
  if (!failed || failed.role !== 'assistant' || failed.status !== 'error') return null;
  for (let index = failedIndex - 1; index >= 0; index--) {
    const user = messages[index];
    if (user.role !== 'user') continue;
    if (user.docKey && user.docKey !== docKey) return null;
    return { user, history: messages.slice(0, index) };
  }
  return null;
}
