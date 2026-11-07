import React, { useState, useEffect } from 'react';
import { Copy, Check, Sparkles, AlertCircle, FileText, Image as ImageIcon, Quote, GripVertical } from 'lucide-react';
import type { AiChatMessage } from '../../utils/types';
import { AiResponseRenderer } from '../AiResponseRenderer';
import { copyTextToClipboard } from '../../utils/pageExtractor';
import {
  AI_RESPONSE_DRAG_MIME,
  setAiResponseDragDroppable,
  subscribeAiResponseDragDroppable,
} from '../../utils/aiResponseDrag';

interface AiChatMessageItemProps {
  message: AiChatMessage;
  /** The user question that produced this assistant response, for pinning on a page. */
  chatPrompt?: string;
}

export const AiChatMessageItem: React.FC<AiChatMessageItemProps> = React.memo(({ message, chatPrompt }) => {
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
  const canPinToPage = !isUser && Boolean(message.content) && message.status !== 'error' && message.status !== 'sending';

  useEffect(() => {
    if (!isDragging) return;
    const unsubscribe = subscribeAiResponseDragDroppable((droppable) => {
      setIsDroppable(droppable);
    });
    const handleGlobalDragEnd = () => {
      setIsDragging(false);
      setIsDroppable(false);
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
    e.dataTransfer.setData(AI_RESPONSE_DRAG_MIME, JSON.stringify({ prompt: chatPrompt || '', response: message.content }));
    // Graceful fallback for targets that only accept plain text
    e.dataTransfer.setData('text/plain', message.content);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setIsDroppable(false);
    setAiResponseDragDroppable(false);
  };

  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-1.5 my-2.5 pl-6">
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium">
          {message.pageNumber !== undefined && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px]">
              <FileText className="w-2.5 h-2.5" />
              Page {message.pageNumber}
            </span>
          )}
          <span>{formattedTime}</span>
        </div>

        {/* Attached Snippets / Highlights */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-col gap-1.5 w-full max-w-[92%] items-end">
            {message.attachments.map((att) => {
              if (att.type === 'image' && att.dataUrl) {
                return (
                  <div
                    key={att.id}
                    className="rounded-xl overflow-hidden border border-white/20 bg-black/20 shadow-sm max-w-[240px] relative group"
                  >
                    <img
                      src={att.dataUrl}
                      alt="Captured snippet"
                      className="w-full max-h-36 object-contain rounded-lg"
                    />
                    {att.pageNumber && (
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9px] font-mono">
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
                    className="flex items-start gap-1.5 p-2 rounded-xl bg-blue-700/60 border border-white/15 text-[11px] text-white/90 text-left select-text"
                  >
                    <Quote className="w-3 h-3 text-blue-300 shrink-0 mt-0.5" />
                    <span className="line-clamp-3 italic">"{typeof att.text === 'string' ? att.text : ''}"</span>
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}

        {message.content && message.content !== '(Attached snippet/reference)' && (
          <div className="bg-blue-600 dark:bg-blue-600/90 text-white rounded-2xl px-3.5 py-2 text-xs leading-relaxed max-w-[92%] shadow-sm whitespace-pre-wrap break-words select-text">
            {message.content}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5 my-3 pr-4 group select-text">
      <div className="flex items-center justify-between w-full text-[10px] text-zinc-400 font-medium">
        <div className="flex items-center gap-1.5 text-blue-500 dark:text-blue-400">
          <Sparkles className="w-3 h-3" />
          <span className="font-semibold tracking-wide">Cinnabar AI</span>
          <span className="text-zinc-500 font-normal">· {formattedTime}</span>
        </div>
        <div className="flex items-center gap-1">
          {canPinToPage && (
            <span
              draggable
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              className={`p-1 rounded cursor-grab active:cursor-grabbing shrink-0 transition-all duration-150 select-none ${
                isDragging
                  ? isDroppable
                    ? 'opacity-100 scale-125 text-blue-500 dark:text-blue-400'
                    : 'opacity-100 scale-110 text-zinc-300 dark:text-zinc-200'
                  : 'opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/10'
              }`}
              title="Drag response to canvas"
              aria-label="Drag response to canvas"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </span>
          )}
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200"
            title="Copy response"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div
        className={`w-full rounded-2xl p-3.5 text-xs leading-relaxed border ${
          message.status === 'error'
            ? 'bg-red-500/10 border-red-500/30 text-red-200'
            : 'bg-[var(--card)] border-[var(--border)] text-[var(--foreground)] shadow-xs'
        }`}
      >
        {message.status === 'error' && (
          <div className="flex items-center gap-1.5 text-red-400 font-semibold mb-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Request Failed</span>
          </div>
        )}
        <AiResponseRenderer response={message.content} />
      </div>
    </div>
  );
});
