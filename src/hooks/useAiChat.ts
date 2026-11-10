import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { AiChatAttachment, AiChatMessage, AiChatSession, DocumentInfo } from '../lib/types/index';
import { extractPageText } from '../lib/pdf/pageExtractor';
import { runAiExplanation, cancelAiExplanation, isTauri } from '../utils/tauriBridge';
import { notebookInstructions, parseNotebookReply, type AiNotebookContext, type AiNotebookWrite } from '../lib/ai/notebookActions';
import { getChatRetry } from '../lib/ai/chatRetry';

const STORAGE_KEY = 'cinnabar_ai_chat_sessions';

function loadPersistedSessions(): AiChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((s) => ({
        ...s,
        messages: Array.isArray(s.messages)
          ? s.messages.map((m: Record<string, unknown>) => ({
              ...m,
              content: typeof m.content === 'string' ? m.content : '',
              attachments: Array.isArray(m.attachments)
                ? (m.attachments as AiChatAttachment[]).filter(
                    (a) => a && (typeof a.text === 'string' || typeof a.dataUrl === 'string')
                  )
                : undefined,
            }))
          : [],
      })) as AiChatSession[];
    }
  } catch (err) {
    console.warn('Failed to parse persisted AI chat sessions:', err);
  }
  return [];
}

function savePersistedSessions(sessions: AiChatSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.warn('Failed to persist AI chat sessions:', err);
  }
}

interface UseAiChatOptions {
  pdfDoc?: PDFDocumentProxy | null;
  docInfo?: DocumentInfo | null;
  currentPage: number;
  notebook?: AiNotebookContext;
  onWriteNotebook?: (docKey: string, write: AiNotebookWrite, canApply: () => boolean) => Promise<string>;
  isDocumentLoading?: boolean;
}

export function useAiChat({ pdfDoc, docInfo, currentPage, notebook, onWriteNotebook, isDocumentLoading = false }: UseAiChatOptions) {
  const [sessions, setSessions] = useState<AiChatSession[]>(() => {
    const persisted = loadPersistedSessions();
    if (persisted.length > 0) return persisted;
    const initialSession: AiChatSession = {
      id: `session_${Date.now()}`,
      title: 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      docName: docInfo?.fileName,
      messages: [],
    };
    return [initialSession];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return sessions[0]?.id || `session_${Date.now()}`;
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const activeRequestIdRef = useRef<string | null>(null);
  const notebookRef = useRef({ notebook, onWriteNotebook, isDocumentLoading });
  notebookRef.current = { notebook, onWriteNotebook, isDocumentLoading };
  const documentIdentity = notebook?.docKey ?? docInfo?.filePath ?? docInfo?.fingerprint ?? docInfo?.fileName;

  useEffect(() => {
    setIsLoading(false);
    return () => {
      const requestId = activeRequestIdRef.current;
      activeRequestIdRef.current = null;
      if (requestId) void cancelAiExplanation(requestId);
    };
  }, [documentIdentity, isDocumentLoading]);

  // Sync sessions to localStorage
  useEffect(() => {
    savePersistedSessions(sessions);
  }, [sessions]);

  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || sessions[0] || null;
  }, [sessions, activeSessionId]);

  const createNewSession = useCallback((title = 'New Chat') => {
    const newSession: AiChatSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      docName: docInfo?.fileName,
      messages: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    return newSession.id;
  }, [docInfo?.fileName]);

  const selectSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (filtered.length === 0) {
        const fresh: AiChatSession = {
          id: `session_${Date.now()}`,
          title: 'New Chat',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          docName: docInfo?.fileName,
          messages: [],
        };
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (activeSessionId === id) {
        setActiveSessionId(filtered[0].id);
      }
      return filtered;
    });
  }, [activeSessionId, docInfo?.fileName]);

  const renameSession = useCallback((id: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: newTitle.trim(), updatedAt: Date.now() } : s))
    );
  }, []);

  const clearCurrentSession = useCallback(() => {
    if (!activeSession) return;
    setSessions((prev) =>
      prev.map((s) => (s.id === activeSession.id ? { ...s, messages: [], updatedAt: Date.now() } : s))
    );
  }, [activeSession]);

  const cancelActiveRequest = useCallback(async () => {
    if (!activeRequestIdRef.current) return;
    const reqId = activeRequestIdRef.current;
    activeRequestIdRef.current = null;
    setIsLoading(false);
    await cancelAiExplanation(reqId);
  }, []);

  const sendMessage = useCallback(
    async (
      text: string,
      options?: {
        includePageContext?: boolean;
        pageNumber?: number;
        attachments?: AiChatAttachment[];
        retryMessageId?: string;
      }
    ) => {
      const trimmed = text.trim();
      const attachments = options?.attachments || [];
      if ((!trimmed && attachments.length === 0) || !activeSession || isLoading || activeRequestIdRef.current) return;
      if (notebookRef.current.isDocumentLoading) return;
      const retry = options?.retryMessageId ? getChatRetry(activeSession.messages, options.retryMessageId, documentIdentity) : null;
      if (options?.retryMessageId && !retry) return;
      const requestNotebook = notebookRef.current.notebook;
      const conversation = retry?.history ?? activeSession.messages;
      const availableImages = [...conversation.slice(-6).flatMap((message) => message.attachments ?? []), ...attachments]
        .filter((attachment) => attachment.type === 'image' && attachment.dataUrl);

      const targetPage = options?.pageNumber ?? currentPage;
      const userMessage: AiChatMessage = {
        id: `msg_${Date.now()}_u`,
        docKey: documentIdentity,
        role: 'user',
        content: trimmed || (attachments.length > 0 ? '(Attached snippet/reference)' : ''),
        timestamp: Date.now(),
        pageNumber: options?.includePageContext ? targetPage : undefined,
        status: 'complete',
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      // Auto title session from first user message if still default
      const effectiveText = trimmed || 'Snippet Analysis';
      const shouldAutoTitle = activeSession.title === 'New Chat' && activeSession.messages.length === 0;
      const autoTitle = shouldAutoTitle
        ? effectiveText.length > 28
          ? `${effectiveText.slice(0, 28).trim()}…`
          : effectiveText
        : activeSession.title;

      // Update session with user message
      if (!retry) setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeSession.id) return s;
          return {
            ...s,
            title: autoTitle,
            updatedAt: Date.now(),
            messages: [...s.messages, userMessage],
          };
        })
      );

      setIsLoading(true);
      const requestId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      activeRequestIdRef.current = requestId;

      try {
        let pageTextContext = '';
        if (options?.includePageContext && pdfDoc) {
          try {
            const rawText = await extractPageText(pdfDoc, targetPage);
            if (rawText.trim()) {
              pageTextContext = `\n\n--- Page ${targetPage} Content ---\n${rawText.slice(0, 3000)}`;
            }
          } catch (e) {
            console.warn('Failed to extract page context for chat:', e);
          }
        }

        // Quoted text attachments
        const quoteAttachments = attachments.filter((a) => a.type === 'text' && a.text);
        const quoteContext = quoteAttachments
          .map((q) => `--- Referenced Highlight / Text (Page ${q.pageNumber ?? targetPage}) ---\n"${q.text}"`)
          .join('\n\n');

        // Image attachment (e.g. from snip capture)
        const imageAttachment = attachments.find((a) => a.type === 'image' && a.dataUrl);
        // The CLI image argument still requires a valid PNG for text-only chats.
        let pngDataUrl = imageAttachment?.dataUrl;
        if (!pngDataUrl) {
          const placeholder = document.createElement('canvas');
          placeholder.width = placeholder.height = 1;
          const context = placeholder.getContext('2d');
          if (!context) throw new Error('Could not prepare the AI request image.');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, 1, 1);
          pngDataUrl = placeholder.toDataURL('image/png');
        }

        // Build conversation history prompt
        const historyText = (retry?.history ?? activeSession.messages)
          .slice(-6)
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n\n');

        const docName = docInfo?.fileName || 'PDF Document';
        const fullPrompt = [
          `You are an expert AI reading assistant for Cinnabar PDF reader.`,
          `Document: ${docName}`,
          requestNotebook ? notebookInstructions(requestNotebook, availableImages) : null,
          options?.includePageContext ? `Active Page: ${targetPage}` : null,
          quoteContext || null,
          imageAttachment ? `Attached image ID: ${imageAttachment.id}${imageAttachment.pageNumber !== undefined ? ` (source PDF page ${imageAttachment.pageNumber})` : ''}. Use this attachment ID when the user asks to insert this image.` : null,
          pageTextContext || null,
          historyText ? `\nRecent Conversation:\n${historyText}` : null,
          `\nUser: ${trimmed || 'Please analyze this attached snippet.'}`,
          `\nAssistant: Respond clearly with structured Markdown and concise explanations. Separate paragraphs, headings, and lists with blank lines. Use bullets or tables for descriptive comparisons. Reserve LaTeX for mathematical expressions: use $...$ inline, and put each $$ display delimiter on its own line with the formula between them.`,
          requestNotebook ? 'Final response format: the notebook JSON schema with message, notebookText, and notebookImage. Return this object directly. Do not wrap it in explanation or a Markdown fence.' : null,
        ]
          .filter(Boolean)
          .join('\n');

        let assistantContent = '';
        let assistantError: string | undefined = undefined;
        if (activeRequestIdRef.current !== requestId) return;

        if (isTauri()) {
          const result = await runAiExplanation({
            requestId,
            prompt: fullPrompt,
            pngDataUrl,
            responseFormat: requestNotebook ? 'notebook' : undefined,
          });
          if (activeRequestIdRef.current !== requestId) return;

          if (result.ok) {
            if (requestNotebook) {
              const reply = parseNotebookReply(result.response);
              assistantContent = reply.message;
              if (reply.notebookText !== null || reply.notebookImage) {
                const current = notebookRef.current;
                if (current.isDocumentLoading || current.notebook?.docKey !== requestNotebook.docKey || !current.onWriteNotebook) {
                  throw new Error('The document changed. No notes were added.');
                }
                let write: AiNotebookWrite;
                if (reply.notebookImage) {
                  const image = availableImages.find((attachment) => attachment.id === reply.notebookImage?.attachmentId);
                  if (!image) throw new Error('The referenced image is unavailable. Attach it again and retry.');
                  write = { type: 'image', image, action: reply.notebookImage };
                } else write = { type: 'text', text: reply.notebookText! };
                const receipt = await current.onWriteNotebook(requestNotebook.docKey, write,
                  () => activeRequestIdRef.current === requestId && !notebookRef.current.isDocumentLoading && notebookRef.current.notebook?.docKey === requestNotebook.docKey);
                if (activeRequestIdRef.current !== requestId) return;
                assistantContent += `\n\n*${receipt}*`;
              }
            } else assistantContent = result.response;
          } else {
            assistantError = result.message || 'Failed to get AI response.';
            assistantContent = `⚠️ **Error**: ${assistantError}`;
            if (['missing_cli', 'unauthenticated', 'incompatible_cli'].includes(result.code)) assistantContent += '\n\n*Check the selected CLI in Settings > AI Assistant.*';
          }
        } else {
          // Web / browser fallback with rich realistic preview
          await new Promise((r) => setTimeout(r, 600));
          assistantContent = `### Analysis & Explanation\n\nRegarding your question about **${docName}**${
            options?.includePageContext ? ` (Page ${targetPage})` : ''
          }:\n\n> "${trimmed}"\n\nHere is a structured breakdown:\n\n1. **Core Concept**: The key takeaway highlights the primary mechanism discussed in this section.\n2. **Mathematical Formulation**:\n   $$\n   \\mathcal{L}(\\theta) = \\mathbb{E}_{x \\sim p_{data}} \\left[ \\log D_\\theta(x) \\right] + \\lambda \\cdot \\Omega(\\theta)\n   $$\n3. **Practical Application**: You can reference this directly in your annotations or extract snippets for further review.\n\n*Note: Running in browser dev mode. In desktop app, this queries your local CLI engine.*`;
          if (requestNotebook) assistantContent += '\n\n*Notebook writing is available with the desktop AI. Preview replies do not change your notes.*';
        }

        if (activeRequestIdRef.current !== requestId) return;

        const assistantMessage: AiChatMessage = {
          id: options?.retryMessageId ?? `msg_${Date.now()}_a`,
          docKey: documentIdentity,
          role: 'assistant',
          content: assistantContent,
          timestamp: Date.now(),
          status: assistantError ? 'error' : 'complete',
          error: assistantError,
        };

        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== activeSession.id) return s;
            return {
              ...s,
              updatedAt: Date.now(),
              messages: retry ? s.messages.map((message) => message.id === assistantMessage.id ? assistantMessage : message) : [...s.messages, assistantMessage],
            };
          })
        );
      } catch (err) {
        if (activeRequestIdRef.current !== requestId) return;
        const errorText = err instanceof Error ? err.message : String(err);
        const errorMessage: AiChatMessage = {
          id: options?.retryMessageId ?? `msg_${Date.now()}_err`,
          docKey: documentIdentity,
          role: 'assistant',
          content: `⚠️ **Request failed**: ${errorText}`,
          timestamp: Date.now(),
          status: 'error',
          error: errorText,
        };

        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== activeSession.id) return s;
            return {
              ...s,
              updatedAt: Date.now(),
              messages: retry ? s.messages.map((message) => message.id === errorMessage.id ? errorMessage : message) : [...s.messages, errorMessage],
            };
          })
        );
      } finally {
        if (activeRequestIdRef.current === requestId) {
          activeRequestIdRef.current = null;
          setIsLoading(false);
        }
      }
    },
    [activeSession, currentPage, docInfo?.fileName, isLoading, pdfDoc, documentIdentity]
  );

  const retryMessage = useCallback((messageId: string) => {
    if (!activeSession) return;
    const retry = getChatRetry(activeSession.messages, messageId, documentIdentity);
    if (!retry) return;
    return sendMessage(retry.user.content === '(Attached snippet/reference)' ? '' : retry.user.content, {
      includePageContext: retry.user.pageNumber !== undefined,
      pageNumber: retry.user.pageNumber,
      attachments: retry.user.attachments,
      retryMessageId: messageId,
    });
  }, [activeSession, documentIdentity, sendMessage]);

  return {
    sessions,
    activeSession,
    activeSessionId,
    isLoading,
    createNewSession,
    selectSession,
    deleteSession,
    renameSession,
    clearCurrentSession,
    sendMessage,
    retryMessage,
    canRetryMessage: (messageId: string) => Boolean(activeSession && !isDocumentLoading && getChatRetry(activeSession.messages, messageId, documentIdentity)),
    cancelActiveRequest,
  };
}
