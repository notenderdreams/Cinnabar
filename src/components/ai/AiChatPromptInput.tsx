import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square, FileText, Crop, X, Quote } from 'lucide-react';
import type { AiChatAttachment } from '../../lib/types/index';
import { getClipboardImageFiles } from '../../lib/ai/chatClipboard';

interface AiChatPromptInputProps {
  isLoading: boolean;
  currentPage: number;
  isSnipCapturing?: boolean;
  pendingAttachments?: AiChatAttachment[];
  onRemoveAttachment?: (id: string) => void;
  onPasteImages?: (files: File[]) => Promise<void>;
  onStartSnipCapture?: () => void;
  onAttachSelectedText?: () => void;
  onSendMessage: (
    text: string,
    options?: {
      includePageContext?: boolean;
      pageNumber?: number;
      attachments?: AiChatAttachment[];
    },
  ) => void;
  onCancel: () => void;
}

export const AiChatPromptInput: React.FC<AiChatPromptInputProps> = ({
  isLoading,
  currentPage,
  isSnipCapturing = false,
  pendingAttachments = [],
  onRemoveAttachment,
  onPasteImages,
  onStartSnipCapture,
  onAttachSelectedText,
  onSendMessage,
  onCancel,
}) => {
  const [text, setText] = useState('');
  const [includePageContext, setIncludePageContext] = useState(true);
  const [pendingPastes, setPendingPastes] = useState(0);
  const isPasting = pendingPastes > 0;
  const [pasteError, setPasteError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea height stably without jumping
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 38), 120)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if ((!trimmed && pendingAttachments.length === 0) || isLoading || isPasting) return;
    onSendMessage(trimmed, {
      includePageContext,
      pageNumber: currentPage,
      attachments: pendingAttachments,
    });
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '38px';
    }
  };

  const canSend = !isPasting && (text.trim().length > 0 || pendingAttachments.length > 0);

  return (
    <div
      className="flex shrink-0 flex-col border-t border-[var(--border)] bg-[var(--background)] select-none"
      data-ai-chat-composer
      onPasteCapture={(event) => {
        const files = getClipboardImageFiles(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation();
        if (!onPasteImages) return;
        setPendingPastes((count) => count + 1);
        setPasteError(null);
        void onPasteImages(files)
          .catch((error: unknown) => {
            setPasteError(
              error instanceof Error ? error.message : 'Could not attach the pasted image.',
            );
          })
          .finally(() => setPendingPastes((count) => count - 1));
      }}
    >
      {isPasting && (
        <p role="status" className="px-3 pt-2 text-xs text-[var(--muted-foreground)]">
          Adding image…
        </p>
      )}
      {pasteError && (
        <p role="alert" className="px-3 pt-2 text-xs text-red-500">
          {pasteError}
        </p>
      )}
      {/* 1. Pending Attachments Strip (Images & Quoted text) */}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)]/50 bg-[var(--card)]/40 px-3 pt-2 pb-1">
          {pendingAttachments.map((att) => (
            <div
              key={att.id}
              className="group flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 pr-1 pl-1.5 text-xs text-[var(--foreground)] shadow-2xs"
            >
              {att.type === 'image' && att.dataUrl ? (
                <>
                  <div className="h-7 w-7 shrink-0 overflow-hidden rounded border border-white/10 bg-black/20">
                    <img
                      src={att.dataUrl}
                      alt="Image attachment"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <span className="text-[11px] font-medium text-zinc-300">
                    {att.pageNumber !== undefined ? `Snip P.${att.pageNumber}` : 'Pasted image'}
                  </span>
                </>
              ) : (
                <>
                  <Quote className="h-3 w-3 shrink-0 text-blue-400" />
                  <span className="max-w-[140px] truncate text-[11px] text-zinc-300 italic">
                    "{typeof att.text === 'string' ? att.text : ''}"
                  </span>
                </>
              )}
              {onRemoveAttachment && (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(att.id)}
                  className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-red-400"
                  title="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 2. Structured Stable Input Box (No jumping elements) */}
      <div className="flex flex-col gap-2 p-2.5">
        <div className="relative flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition-all focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/15">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              pendingAttachments.length > 0
                ? 'Ask a question about this attached snippet/quote...'
                : `Ask about page ${currentPage} or document...`
            }
            rows={1}
            className="max-h-[120px] min-h-[38px] w-full resize-none bg-transparent px-3 py-2 text-xs leading-relaxed text-[var(--foreground)] placeholder:text-zinc-500 focus:outline-none"
          />

          {/* Bottom Action Bar (Fixed, never shifts horizontally) */}
          <div className="flex items-center justify-between border-t border-[var(--border)]/40 bg-[var(--background)]/50 px-2 py-1.5">
            {/* Left Toolbar: Attachment Buttons */}
            <div className="flex items-center gap-1">
              {/* Snip Region to Prompt Button */}
              {onStartSnipCapture && (
                <button
                  type="button"
                  onClick={onStartSnipCapture}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                    isSnipCapturing
                      ? 'animate-pulse bg-blue-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:bg-[var(--hover)] hover:text-[var(--foreground)]'
                  }`}
                  title="Snip region from PDF and attach to prompt"
                >
                  <Crop className="h-3 w-3" />
                  <span className="hidden sm:inline">{isSnipCapturing ? 'Snapping…' : 'Snip'}</span>
                </button>
              )}

              {/* Attach Highlighted / Selected Text Button */}
              {onAttachSelectedText && (
                <button
                  type="button"
                  onClick={() => onAttachSelectedText()}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
                  title="Attach selected text from PDF"
                >
                  <Quote className="h-3 w-3" />
                  <span className="hidden sm:inline">Quote</span>
                </button>
              )}

              {/* Page Context Toggle */}
              <button
                type="button"
                onClick={() => setIncludePageContext((prev) => !prev)}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
                  includePageContext
                    ? 'border border-blue-500/30 bg-blue-500/15 text-blue-500 dark:text-blue-400'
                    : 'border border-transparent bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20'
                }`}
                title="Include page text in context"
              >
                <FileText className="h-2.5 w-2.5" />
                <span>P.{currentPage}</span>
              </button>
            </div>

            {/* Right Toolbar: Send / Stop Action */}
            <div className="flex items-center gap-1">
              {isLoading ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex items-center gap-1 rounded-lg bg-red-500/15 px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/25"
                  title="Stop generating"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSend}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    canSend
                      ? 'cursor-pointer bg-blue-600 text-white shadow-sm hover:bg-blue-500'
                      : 'cursor-not-allowed text-zinc-500 opacity-40'
                  }`}
                  title="Send message (Enter)"
                >
                  <span>Ask</span>
                  <Send className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
