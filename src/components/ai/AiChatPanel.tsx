import React, { useState, useRef, useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  ChevronDown,
  Plus,
  History,
  X,
  Loader2,
  BookOpen,
} from 'lucide-react';
import { SparkleIcon } from '../icons/SparkleIcon';
import type { AiChatAttachment, DocumentInfo } from '../../lib/types/index';
import { useAiChat } from '../../hooks/useAiChat';
import { AiChatMessageItem } from './AiChatMessageItem';
import { AiChatPromptInput } from './AiChatPromptInput';
import { AiSessionDrawer } from './AiSessionDrawer';
import { findOriginatingPrompt } from '../../lib/ai/aiResponseDrag';
import type { AiNotebookContext, AiNotebookWrite } from '../../lib/ai/notebookActions';

interface AiChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  pdfDoc?: PDFDocumentProxy | null;
  docInfo?: DocumentInfo | null;
  currentPage: number;
  isSnipCapturing?: boolean;
  pendingAttachments?: AiChatAttachment[];
  onStartSnipCapture?: () => void;
  onAttachSelectedText?: () => void;
  onRemoveAttachment?: (id: string) => void;
  onPasteImages?: (files: File[]) => Promise<void>;
  notebook?: AiNotebookContext;
  onWriteNotebook?: (docKey: string, write: AiNotebookWrite, canApply: () => boolean) => Promise<string>;
  isDocumentLoading?: boolean;
}

const QUICK_QUESTIONS = [
  'Summarize the key points of this page',
  'Explain formulas and definitions found here',
  'What are the core conclusions or takeaways?',
  'Quiz me with 3 questions on this topic',
];

export const AiChatPanel: React.FC<AiChatPanelProps> = ({
  isOpen,
  onClose,
  pdfDoc,
  docInfo,
  currentPage,
  isSnipCapturing = false,
  pendingAttachments = [],
  onStartSnipCapture,
  onAttachSelectedText,
  onRemoveAttachment,
  onPasteImages,
  notebook,
  onWriteNotebook,
  isDocumentLoading,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const {
    sessions,
    activeSession,
    activeSessionId,
    isLoading,
    createNewSession,
    selectSession,
    deleteSession,
    renameSession,
    sendMessage,
    retryMessage,
    canRetryMessage,
    cancelActiveRequest,
  } = useAiChat({ pdfDoc, docInfo, currentPage, notebook, onWriteNotebook, isDocumentLoading });

  // Scroll strictly within messages container without touching window or outer layout
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [activeSession?.messages.length, isLoading]);

  const handleQuickQuestionClick = (question: string) => {
    void sendMessage(question, { includePageContext: true, pageNumber: currentPage });
  };

  return (
    <aside
      id="app-ai-chat-sidebar"
      aria-label="AI Reading Assistant & Chat"
      className={`macos-sidebar absolute inset-y-0 right-0 w-80 sm:w-96 flex flex-col z-40 select-none shadow-2xl border-l border-[var(--border)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'
      }`}
    >
      {/* Top Header & Session Switcher */}
      <div className="p-2.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)] shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded-md bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <SparkleIcon className="w-3.5 h-3.5" />
          </div>

          {/* Session Switcher Dropdown Button */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen((prev) => !prev)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--hover)] transition-colors min-w-0 truncate max-w-[170px]"
            title="Switch or manage chat sessions"
          >
            <span className="truncate">{activeSession?.title || 'Chat'}</span>
            <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
          </button>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => createNewSession()}
            className="p-1.5 rounded-md text-zinc-400 hover:text-[var(--foreground)] hover:bg-[var(--hover)] transition-colors"
            title="New Chat Session"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsDrawerOpen((prev) => !prev)}
            className={`p-1.5 rounded-md transition-colors ${
              isDrawerOpen
                ? 'text-blue-500 bg-blue-500/10'
                : 'text-zinc-400 hover:text-[var(--foreground)] hover:bg-[var(--hover)]'
            }`}
            title="Chat Sessions History"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          <span className="w-px h-3.5 bg-[var(--border)] mx-0.5" />
          <button
            onClick={onClose}
            className="macos-sidebar-collapse-control ml-1"
            title="Close AI Panel (Cmd+J)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 relative flex flex-col">
        {/* Slide-over Sessions Drawer */}
        <AiSessionDrawer
          isOpen={isDrawerOpen}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={selectSession}
          onNewSession={() => createNewSession()}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
          onClose={() => setIsDrawerOpen(false)}
        />

        {/* Message Thread Scroll View */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3.5 py-2 space-y-1 custom-scrollbar">
          {!activeSession || activeSession.messages.length === 0 ? (
            /* Empty State with Quick Starter Prompts */
            <div className="h-full flex flex-col items-center justify-center text-center p-4">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3 shadow-inner">
                <SparkleIcon className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-semibold text-[var(--foreground)] mb-1">
                AI Reading Companion
              </h4>
              <p className="text-[11px] text-zinc-400 mb-4 max-w-[240px] leading-relaxed">
                Ask questions, explain your PDF, or ask me to add a summary to your notebook.
              </p>

              {/* Context Pill */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--card)] border border-[var(--border)] text-[11px] text-zinc-300 mb-5">
                <BookOpen className="w-3 h-3 text-blue-400" />
                <span className="truncate max-w-[140px]">{docInfo?.fileName || 'Document'}</span>
                <span className="text-zinc-500">·</span>
                <span className="text-blue-400 font-medium">Page {currentPage}</span>
              </div>

              {/* Quick Prompt Cards */}
              <div className="w-full flex flex-col gap-1.5 text-left">
                <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider pl-1 mb-0.5">
                  Suggested Prompts
                </span>
                {QUICK_QUESTIONS.map((question, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickQuestionClick(question)}
                    className="w-full text-left p-2.5 rounded-xl bg-[var(--card)] hover:bg-[var(--hover)] border border-[var(--border)] text-xs text-[var(--foreground)] transition-all flex items-center justify-between group shadow-2xs"
                  >
                    <span className="leading-snug pr-2 text-[11px]">{question}</span>
                    <SparkleIcon className="w-3 h-3 text-zinc-500 group-hover:text-blue-400 shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {activeSession.messages.map((message, index) => (
                <AiChatMessageItem
                  key={message.id}
                  message={message}
                  onRetry={canRetryMessage(message.id) ? () => { void retryMessage(message.id); } : undefined}
                  isLoading={isLoading}
                  chatPrompt={message.role === 'assistant' ? findOriginatingPrompt(activeSession.messages, index) : undefined}
                />
              ))}

              {/* Generating Animation Bubble */}
              {isLoading && (
                <div className="flex items-center gap-2 py-3 px-3.5 my-2 rounded-2xl bg-[var(--card)] border border-[var(--border)] text-xs text-zinc-400 w-fit shadow-xs animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                  <span className="font-medium">Analyzing document…</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom Sticky Prompt Input */}
        <AiChatPromptInput
          isLoading={isLoading}
          currentPage={currentPage}
          isSnipCapturing={isSnipCapturing}
          pendingAttachments={pendingAttachments}
          onStartSnipCapture={onStartSnipCapture}
          onAttachSelectedText={onAttachSelectedText}
          onRemoveAttachment={onRemoveAttachment}
          onPasteImages={onPasteImages}
          onSendMessage={sendMessage}
          onCancel={cancelActiveRequest}
        />
      </div>
    </aside>
  );
};
