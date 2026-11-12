import React, { useState, useRef, useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronDown, Plus, History, X, Loader2, BookOpen } from 'lucide-react';
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
  onWriteNotebook?: (
    docKey: string,
    write: AiNotebookWrite,
    canApply: () => boolean,
  ) => Promise<string>;
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
    retryingMessageId,
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
      className={`macos-sidebar absolute inset-y-0 right-0 z-40 flex w-80 flex-col border-l border-[var(--border)] shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] select-none sm:w-96 ${
        isOpen ? 'pointer-events-auto translate-x-0' : 'pointer-events-none translate-x-full'
      }`}
    >
      {/* Top Header & Session Switcher */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--background)] p-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-500">
            <SparkleIcon className="h-3.5 w-3.5" />
          </div>

          {/* Session Switcher Dropdown Button */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen((prev) => !prev)}
            className="flex max-w-[170px] min-w-0 items-center gap-1.5 truncate rounded-lg px-2 py-1 text-xs font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--hover)]"
            title="Switch or manage chat sessions"
          >
            <span className="truncate">{activeSession?.title || 'Chat'}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-zinc-400" />
          </button>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => createNewSession()}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            title="New Chat Session"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setIsDrawerOpen((prev) => !prev)}
            className={`rounded-md p-1.5 transition-colors ${
              isDrawerOpen
                ? 'bg-blue-500/10 text-blue-500'
                : 'text-zinc-400 hover:bg-[var(--hover)] hover:text-[var(--foreground)]'
            }`}
            title="Chat Sessions History"
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <span className="mx-0.5 h-3.5 w-px bg-[var(--border)]" />
          <button
            onClick={onClose}
            className="macos-sidebar-collapse-control ml-1"
            title="Close AI Panel (Cmd+J)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative flex min-h-0 flex-1 flex-col">
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
        <div
          ref={messagesContainerRef}
          className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3.5 py-2"
        >
          {!activeSession || activeSession.messages.length === 0 ? (
            /* Empty State with Quick Starter Prompts */
            <div className="flex h-full flex-col items-center justify-center p-4 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500 shadow-inner">
                <SparkleIcon className="h-5 w-5" />
              </div>
              <h4 className="mb-1 text-xs font-semibold text-[var(--foreground)]">
                AI Reading Companion
              </h4>
              <p className="mb-4 max-w-[240px] text-[11px] leading-relaxed text-zinc-400">
                Ask questions, explain your PDF, or ask me to add a summary to your notebook.
              </p>

              {/* Context Pill */}
              <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] text-zinc-300">
                <BookOpen className="h-3 w-3 text-blue-400" />
                <span className="max-w-[140px] truncate">{docInfo?.fileName || 'Document'}</span>
                <span className="text-zinc-500">·</span>
                <span className="font-medium text-blue-400">Page {currentPage}</span>
              </div>

              {/* Quick Prompt Cards */}
              <div className="flex w-full flex-col gap-1.5 text-left">
                <span className="mb-0.5 pl-1 text-[10px] font-medium tracking-wider text-zinc-400 uppercase">
                  Suggested Prompts
                </span>
                {QUICK_QUESTIONS.map((question, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickQuestionClick(question)}
                    className="group flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 text-left text-xs text-[var(--foreground)] shadow-2xs transition-all hover:bg-[var(--hover)]"
                  >
                    <span className="pr-2 text-[11px] leading-snug">{question}</span>
                    <SparkleIcon className="h-3 w-3 shrink-0 text-zinc-500 transition-colors group-hover:text-blue-400" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {activeSession.messages.map((message, index) =>
                message.id === retryingMessageId ? null : (
                  <AiChatMessageItem
                    key={message.id}
                    message={message}
                    onRetry={
                      canRetryMessage(message.id)
                        ? () => {
                            void retryMessage(message.id);
                          }
                        : undefined
                    }
                    isLoading={isLoading}
                    chatPrompt={
                      message.role === 'assistant'
                        ? findOriginatingPrompt(activeSession.messages, index)
                        : undefined
                    }
                  />
                ),
              )}

              {/* Generating Animation Bubble */}
              {isLoading && (
                <div className="my-2 flex w-fit animate-pulse items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-3 text-xs text-zinc-400 shadow-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
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
