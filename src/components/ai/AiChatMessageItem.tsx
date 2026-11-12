import React, { useState, useEffect } from 'react';
import { Copy, Check, AlertCircle, FileText, Quote, GripVertical, RotateCcw } from 'lucide-react';
import { SparkleIcon } from '../icons/SparkleIcon';
import type { AiChatMessage } from '../../lib/types/index';
import { AiResponseRenderer } from '../annotations/AiResponseRenderer';
import { copyTextToClipboard } from '../../lib/pdf/pageExtractor';
import {
  AI_RESPONSE_DRAG_MIME,
  setAiResponseDragDroppable,
  subscribeAiResponseDragDroppable,
  setActiveAiResponseDrag,
  getTransparentDragImage,
} from '../../lib/ai/aiResponseDrag';

interface AiChatMessageItemProps {
  message: AiChatMessage;
  /** The user question that produced this assistant response, for pinning on a page. */
  chatPrompt?: string;
  onRetry?: () => void;
  isLoading?: boolean;
}

export const AiChatMessageItem: React.FC<AiChatMessageItemProps> = React.memo(
  ({ message, chatPrompt, onRetry, isLoading = false }) => {
    const [copied, setCopied] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isDroppable, setIsDroppable] = useState(false);
    const isUser = message.role === 'user';

    const handleCopy = async () => {
      try {
        await copyTextToClipboard(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        console.warn('Copy failed:', e);
      }
    };

    // Only settled assistant responses with content can be pinned onto a page
    const canPinToPage =
      !isUser &&
      Boolean(message.content) &&
      message.status !== 'error' &&
      message.status !== 'sending';

    useEffect(() => {
      if (!isDragging) return;
      const unsubscribe = subscribeAiResponseDragDroppable((droppable) => {
        setIsDroppable(droppable);
      });
      const handleGlobalDragEnd = () => {
        setIsDragging(false);
        setIsDroppable(false);
        setActiveAiResponseDrag(null);
        setAiResponseDragDroppable(false);
      };
      window.addEventListener('dragend', handleGlobalDragEnd);
      window.addEventListener('drop', handleGlobalDragEnd, true);
      return () => {
        unsubscribe();
        window.removeEventListener('dragend', handleGlobalDragEnd);
        window.removeEventListener('drop', handleGlobalDragEnd, true);
      };
    }, [isDragging]);

    const handleDragStart = (e: React.DragEvent) => {
      if (!canPinToPage) {
        e.preventDefault();
        return;
      }
      e.stopPropagation();
      setIsDragging(true);
      setIsDroppable(false);
      e.dataTransfer.effectAllowed = 'move';
      const payload = { prompt: chatPrompt || '', response: message.content };
      e.dataTransfer.setData(AI_RESPONSE_DRAG_MIME, JSON.stringify(payload));
      // Graceful fallback for targets that only accept plain text
      e.dataTransfer.setData('text/plain', message.content);

      // Save active drag state so the canvas can render a live response card preview
      setActiveAiResponseDrag(payload);

      // Suppress the OS translucent shadow ghost so only the live in-canvas response card is visible
      const emptyImg = getTransparentDragImage();
      if (emptyImg) {
        e.dataTransfer.setDragImage(emptyImg, 0, 0);
      }
    };

    const handleDragEnd = () => {
      setIsDragging(false);
      setIsDroppable(false);
      setActiveAiResponseDrag(null);
      setAiResponseDragDroppable(false);
    };

    const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (isUser) {
      return (
        <div className="my-2.5 flex flex-col items-end gap-1.5 pl-6">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-400">
            {message.pageNumber !== undefined && (
              <span className="inline-flex items-center gap-1 rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
                <FileText className="h-2.5 w-2.5" />
                Page {message.pageNumber}
              </span>
            )}
            <span>{formattedTime}</span>
          </div>

          {/* Attached Snippets / Highlights */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex w-full max-w-[92%] flex-col items-end gap-1.5">
              {message.attachments.map((att) => {
                if (att.type === 'image' && att.dataUrl) {
                  return (
                    <div
                      key={att.id}
                      className="group relative max-w-[240px] overflow-hidden rounded-xl border border-white/20 bg-black/20 shadow-sm"
                    >
                      <img
                        src={att.dataUrl}
                        alt="Captured snippet"
                        className="max-h-36 w-full rounded-lg object-contain"
                      />
                      {att.pageNumber && (
                        <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] text-white">
                          P.{att.pageNumber}
                        </span>
                      )}
                    </div>
                  );
                }
                if (att.type === 'text' && att.text) {
                  return (
                    <div
                      key={att.id}
                      className="flex items-start gap-1.5 rounded-xl border border-white/15 bg-blue-700/60 p-2 text-left text-[11px] text-white/90 select-text"
                    >
                      <Quote className="mt-0.5 h-3 w-3 shrink-0 text-blue-300" />
                      <span className="line-clamp-3 italic">
                        "{typeof att.text === 'string' ? att.text : ''}"
                      </span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}

          {message.content && message.content !== '(Attached snippet/reference)' && (
            <div className="max-w-[92%] rounded-2xl bg-blue-600 px-3.5 py-2 text-xs leading-relaxed break-words whitespace-pre-wrap text-white shadow-sm select-text dark:bg-blue-600/90">
              {message.content}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="group my-3 flex flex-col items-start gap-1.5 pr-4 select-text">
        <div
          draggable={canPinToPage}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          className={`flex w-full items-center justify-between text-[10px] font-medium text-zinc-400 select-none ${
            canPinToPage ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          title={canPinToPage ? 'Drag response to canvas as sticky card' : undefined}
        >
          <div className="flex items-center gap-1.5 text-blue-500 dark:text-blue-400">
            <SparkleIcon className="h-3 w-3" />
            <span className="font-semibold tracking-wide">Cinnabar AI</span>
            <span className="font-normal text-zinc-500">· {formattedTime}</span>
          </div>
          <div className="flex items-center gap-1">
            {canPinToPage && (
              <span
                className={`shrink-0 cursor-grab rounded p-1 transition-all duration-150 select-none active:cursor-grabbing ${
                  isDragging
                    ? isDroppable
                      ? 'scale-125 text-blue-500 opacity-100 dark:text-blue-400'
                      : 'scale-110 text-zinc-300 opacity-100 dark:text-zinc-200'
                    : 'text-zinc-400 opacity-0 group-hover:opacity-100 hover:bg-zinc-200/60 hover:text-zinc-200 dark:hover:bg-white/10'
                }`}
                title="Drag response to canvas as sticky card"
                aria-label="Drag response to canvas"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            )}
            <button
              onClick={handleCopy}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="rounded p-1 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 hover:text-zinc-200"
              title="Copy response"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            {message.status === 'error' && onRetry && (
              <button
                type="button"
                className="ai-chat-retry"
                onClick={onRetry}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                disabled={isLoading}
                title="Retry response"
                aria-label="Retry response"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div
          className={`w-full rounded-2xl border p-3.5 text-xs leading-relaxed transition-all duration-200 ${
            isDragging
              ? 'scale-[0.98] border-dashed border-blue-500/50 bg-blue-500/5 opacity-40 shadow-inner'
              : message.status === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-200'
                : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-xs'
          }`}
        >
          {message.status === 'error' && (
            <div className="mb-2 flex items-center gap-1.5 font-semibold text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Request Failed</span>
            </div>
          )}
          <AiResponseRenderer response={message.content} />
        </div>
      </div>
    );
  },
);
