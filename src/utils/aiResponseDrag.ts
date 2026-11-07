// Shared contract for dragging AI chat responses from the sidebar chat into the PDF canvas.

export const AI_RESPONSE_DRAG_MIME = 'application/x-cinnabar-ai-response';

export interface AiResponseDragPayload {
  /** The user question that produced this response, if any. */
  prompt: string;
  /** The assistant response content (markdown). */
  response: string;
}

type DroppableListener = (isDroppable: boolean) => void;
const droppableListeners = new Set<DroppableListener>();
let currentDroppable = false;

export function isAiResponseDragDroppable(): boolean {
  return currentDroppable;
}

export function setAiResponseDragDroppable(droppable: boolean): void {
  if (currentDroppable === droppable) return;
  currentDroppable = droppable;
  for (const listener of droppableListeners) {
    listener(droppable);
  }
}

export function subscribeAiResponseDragDroppable(listener: DroppableListener): () => void {
  droppableListeners.add(listener);
  listener(currentDroppable);
  return () => {
    droppableListeners.delete(listener);
  };
}

if (typeof window !== 'undefined') {
  const resetDroppable = () => setAiResponseDragDroppable(false);
  window.addEventListener('dragend', resetDroppable);
  window.addEventListener('drop', resetDroppable, true);
}

/** Extract the payload from a drop/drag event's dataTransfer, or null when absent/invalid. */
export function extractAiResponseDragPayload(dataTransfer: DataTransfer): AiResponseDragPayload | null {
  const raw = dataTransfer.getData(AI_RESPONSE_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AiResponseDragPayload>;
    const response = typeof parsed.response === 'string' ? parsed.response : '';
    if (!response.trim()) return null;
    return {
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt : '',
      response,
    };
  } catch {
    return null;
  }
}

/** Find the nearest preceding user message that produced the assistant reply at `assistantIndex`. */
export function findOriginatingPrompt(
  messages: Array<{ role: string; content: string }>,
  assistantIndex: number
): string {
  for (let i = assistantIndex - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'user' && typeof message.content === 'string' && message.content.trim() && message.content !== '(Attached snippet/reference)') {
      return message.content;
    }
  }
  return '';
}
