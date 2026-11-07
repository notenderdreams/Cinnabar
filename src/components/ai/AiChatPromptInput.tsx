import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Square,
  FileText,
  Crop,
  X,
  Quote,
} from 'lucide-react';
import type { AiChatAttachment } from '../../lib/types/index';

interface AiChatPromptInputProps {
  isLoading: boolean;
  currentPage: number;
  isSnipCapturing?: boolean;
  pendingAttachments?: AiChatAttachment[];
  onRemoveAttachment?: (id: string) => void;
  onStartSnipCapture?: () => void;
  onAttachSelectedText?: () => void;
  onSendMessage: (
    text: string,
    options?: {
      includePageContext?: boolean;
      pageNumber?: number;
      attachments?: AiChatAttachment[];
    }
  ) => void;
  onCancel: () => void;
}

export const AiChatPromptInput: React.FC<AiChatPromptInputProps> = ({
  isLoading,
  currentPage,
  isSnipCapturing = false,
  pendingAttachments = [],
  onRemoveAttachment,
  onStartSnipCapture,
  onAttachSelectedText,
  onSendMessage,
  onCancel,
}) => {
  const [text, setText] = useState('');
  const [includePageContext, setIncludePageContext] = useState(true);
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
    if ((!trimmed && pendingAttachments.length === 0) || isLoading) return;
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

  const canSend = text.trim().length > 0 || pendingAttachments.length > 0;

  return (
    <div className="border-t border-[var(--border)] bg-[var(--background)] flex flex-col shrink-0 select-none">
      {/* 1. Pending Attachments Strip (Images & Quoted text) */}
      {pendingAttachments.length > 0 && (
        <div className="px-3 pt-2 pb-1 flex flex-wrap gap-2 items-center bg-[var(--card)]/40 border-b border-[var(--border)]/50">
          {pendingAttachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--foreground)] shadow-2xs group"
            >
              {att.type === 'image' && att.dataUrl ? (
                <>
                  <div className="w-7 h-7 rounded overflow-hidden bg-black/20 shrink-0 border border-white/10">
                    <img
                      src={att.dataUrl}
                      alt="Snippet attachment"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-[11px] font-medium text-zinc-300">
                    Snip P.{att.pageNumber ?? currentPage}
                  </span>
                </>
              ) : (
                <>
                  <Quote className="w-3 h-3 text-blue-400 shrink-0" />
                  <span className="text-[11px] text-zinc-300 max-w-[140px] truncate italic">
                    "{typeof att.text === 'string' ? att.text : ''}"
                  </span>
                </>
              )}
              {onRemoveAttachment && (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(att.id)}
                  className="p-0.5 rounded text-zinc-400 hover:text-red-400 hover:bg-white/10 transition-colors"
                  title="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 2. Structured Stable Input Box (No jumping elements) */}
      <div className="p-2.5 flex flex-col gap-2">
        <div className="relative bg-[var(--card)] border border-[var(--border)] rounded-xl focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/15 transition-all overflow-hidden flex flex-col">
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
            className="w-full bg-transparent resize-none text-xs text-[var(--foreground)] placeholder:text-zinc-500 px-3 py-2 focus:outline-none min-h-[38px] max-h-[120px] leading-relaxed"
          />

          {/* Bottom Action Bar (Fixed, never shifts horizontally) */}
          <div className="flex items-center justify-between px-2 py-1.5 border-t border-[var(--border)]/40 bg-[var(--background)]/50">
            {/* Left Toolbar: Attachment Buttons */}
            <div className="flex items-center gap-1">
              {/* Snip Region to Prompt Button */}
              {onStartSnipCapture && (
                <button
                  type="button"
                  onClick={onStartSnipCapture}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                    isSnipCapturing
                      ? 'bg-blue-600 text-white shadow-xs animate-pulse'
                      : 'text-zinc-400 hover:text-[var(--foreground)] hover:bg-[var(--hover)]'
                  }`}
                  title="Snip region from PDF and attach to prompt"
                >
                  <Crop className="w-3 h-3" />
                  <span className="hidden sm:inline">
                    {isSnipCapturing ? 'Snapping…' : 'Snip'}
                  </span>
                </button>
              )}

              {/* Attach Highlighted / Selected Text Button */}
              {onAttachSelectedText && (
                <button
                  type="button"
                  onClick={() => onAttachSelectedText()}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-400 hover:text-[var(--foreground)] hover:bg-[var(--hover)] transition-colors"
                  title="Attach selected text from PDF"
                >
                  <Quote className="w-3 h-3" />
                  <span className="hidden sm:inline">Quote</span>
                </button>
              )}

              {/* Page Context Toggle */}
              <button
                type="button"
                onClick={() => setIncludePageContext((prev) => !prev)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                  includePageContext
                    ? 'bg-blue-500/15 text-blue-500 dark:text-blue-400 border border-blue-500/30'
                    : 'bg-zinc-500/10 text-zinc-400 border border-transparent hover:bg-zinc-500/20'
                }`}
                title="Include page text in context"
              >
                <FileText className="w-2.5 h-2.5" />
                <span>P.{currentPage}</span>
              </button>
            </div>

            {/* Right Toolbar: Send / Stop Action */}
            <div className="flex items-center gap-1">
              {isLoading ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors text-xs font-medium"
                  title="Stop generating"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSend}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all text-xs font-medium ${
                    canSend
                      ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-sm cursor-pointer'
                      : 'text-zinc-500 opacity-40 cursor-not-allowed'
                  }`}
                  title="Send message (Enter)"
                >
                  <span>Ask</span>
                  <Send className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
