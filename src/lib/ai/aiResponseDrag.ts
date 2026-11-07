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

let activeAiResponseDrag: AiResponseDragPayload | null = null;
type ActiveDragListener = (payload: AiResponseDragPayload | null) => void;
const activeDragListeners = new Set<ActiveDragListener>();

let transparentDragImage: HTMLImageElement | null = null;

/**
 * Returns a 1x1 transparent image element for dataTransfer.setDragImage()
 * so the browser/OS does not render a default translucent ghost/shadow.
 */
export function getTransparentDragImage(): HTMLImageElement | null {
  if (typeof document === 'undefined') return null;
  if (!transparentDragImage) {
    const img = document.createElement('img');
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    img.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
    document.body.appendChild(img);
    transparentDragImage = img;
  }
  return transparentDragImage;
}

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

export function getActiveAiResponseDrag(): AiResponseDragPayload | null {
  return activeAiResponseDrag;
}

export function setActiveAiResponseDrag(payload: AiResponseDragPayload | null): void {
  activeAiResponseDrag = payload;
  if (!payload) {
    setAiResponseDragDroppable(false);
  }
  for (const listener of activeDragListeners) {
    listener(payload);
  }
}

export function subscribeActiveAiResponseDrag(listener: ActiveDragListener): () => void {
  activeDragListeners.add(listener);
  listener(activeAiResponseDrag);
  return () => {
    activeDragListeners.delete(listener);
  };
}

if (typeof window !== 'undefined') {
  const resetDragState = () => {
    setActiveAiResponseDrag(null);
    setAiResponseDragDroppable(false);
  };
  window.addEventListener('dragend', resetDragState);
  window.addEventListener('drop', resetDragState, true);
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

/** Strip markdown noise to build a clean plain-text preview string for drag images and cards. */
export function extractPlainTextPreview(markdown: string, maxLen = 140): string {
  if (!markdown) return '';
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_~>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen).trim()}…`;
}

/**
 * Creates an offscreen DOM element styled like a Cinnabar AI response card
 * and attaches it briefly to document.body so dataTransfer.setDragImage() can
 * snapshot it as the native OS drag ghost.
 */
export function createAiResponseDragGhost(prompt: string, response: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  const isDark = document.documentElement.getAttribute('data-ui-theme') === 'dark';
  const ghost = document.createElement('div');
  ghost.className = 'cinnabar-ai-drag-ghost';
  ghost.setAttribute('aria-hidden', 'true');

  const previewText = extractPlainTextPreview(response, 130);
  const promptText = prompt ? extractPlainTextPreview(prompt, 60) : '';

  const bgColor = isDark ? 'rgba(28, 28, 36, 0.96)' : 'rgba(255, 255, 255, 0.98)';
  const textColor = isDark ? '#f4f4f5' : '#18181b';
  const subtextColor = isDark ? '#a1a1aa' : '#52525b';
  const borderColor = isDark ? 'rgba(96, 165, 250, 0.5)' : 'rgba(59, 130, 246, 0.45)';
  const promptBg = isDark ? 'rgba(59, 130, 246, 0.14)' : 'rgba(59, 130, 246, 0.08)';
  const promptColor = isDark ? '#93c5fd' : '#1d4ed8';

  ghost.style.cssText = `
    position: fixed;
    top: -9999px;
    left: -9999px;
    width: 320px;
    max-width: 320px;
    padding: 12px 14px;
    border-radius: 14px;
    background: ${bgColor};
    color: ${textColor};
    border: 1.5px solid ${borderColor};
    box-shadow: 0 18px 40px -4px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.12);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    pointer-events: none;
    z-index: 99999;
    user-select: none;
    transform: translateZ(0);
  `;

  let contentHtml = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;font-size:11px;font-weight:600;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#3b82f6;"></span>
        <span style="letter-spacing:-0.01em;">AI Response Card</span>
        <span style="font-size:9.5px;font-weight:500;padding:1px 5px;border-radius:4px;background:rgba(168,85,247,0.18);color:#c084fc;border:1px solid rgba(168,85,247,0.3);">Cinnabar AI</span>
      </div>
      <span style="font-size:9.5px;color:#3b82f6;font-weight:600;">Drop to pin</span>
    </div>
  `;

  if (promptText) {
    contentHtml += `
      <div style="font-size:10.5px;color:${promptColor};background:${promptBg};padding:4px 8px;border-radius:6px;margin-bottom:6px;font-style:italic;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid ${isDark ? 'rgba(59,130,246,0.25)' : 'rgba(59,130,246,0.2)'};">
        "${promptText}"
      </div>
    `;
  }

  contentHtml += `
    <div style="font-size:11.5px;line-height:1.45;color:${subtextColor};display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">
      ${previewText}
    </div>
  `;

  ghost.innerHTML = contentHtml;
  document.body.appendChild(ghost);
  return ghost;
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
