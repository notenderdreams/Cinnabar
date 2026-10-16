import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { AiChatAttachment, AiChatMessage, AiChatSession, DocumentInfo } from '../utils/types';
import { extractPageText } from '../utils/pageExtractor';
import { runAiExplanation, cancelAiExplanation, isTauri } from '../utils/tauriBridge';

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
}

export function useAiChat({ pdfDoc, docInfo, currentPage }: UseAiChatOptions) {
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
      }
    ) => {
      const trimmed = text.trim();
      const attachments = options?.attachments || [];
      if ((!trimmed && attachments.length === 0) || !activeSession || isLoading) return;

      const targetPage = options?.pageNumber ?? currentPage;
      const userMessage: AiChatMessage = {
        id: `msg_${Date.now()}_u`,
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
      setSessions((prev) =>
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
        const pngDataUrl = imageAttachment?.dataUrl || '';

        // Build conversation history prompt
        const historyText = activeSession.messages
          .slice(-6)
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n\n');

        const docName = docInfo?.fileName || 'PDF Document';
        const fullPrompt = [
          `You are an expert AI reading assistant for Cinnabar PDF reader.`,
          `Document: ${docName}`,
          options?.includePageContext ? `Active Page: ${targetPage}` : null,
          quoteContext || null,
          imageAttachment ? `[Note: A cropped region/diagram from Page ${imageAttachment.pageNumber ?? targetPage} is attached as an image]` : null,
          pageTextContext || null,
          historyText ? `\nRecent Conversation:\n${historyText}` : null,
          `\nUser: ${trimmed || 'Please analyze this attached snippet.'}`,
          `\nAssistant: Respond clearly with structured markdown, formulas using $...$ or $$...$$ where appropriate, and concise explanations.`,
        ]
          .filter(Boolean)
          .join('\n');

        let assistantContent = '';
        let assistantError: string | undefined = undefined;

        if (isTauri()) {
          const result = await runAiExplanation({
            requestId,
            prompt: fullPrompt,
            pngDataUrl,
          });

          if (result.ok) {
            assistantContent = result.response;
          } else {
            assistantError = result.message || 'Failed to get AI response.';
            assistantContent = `⚠️ **Error**: ${assistantError}\n\n*Make sure a local CLI (like Codex or Antigravity) is selected in Settings > AI Assistant.*`;
          }
        } else {
          // Web / browser fallback with rich realistic preview
          await new Promise((r) => setTimeout(r, 600));
          assistantContent = `### Analysis & Explanation\n\nRegarding your question about **${docName}**${
            options?.includePageContext ? ` (Page ${targetPage})` : ''
          }:\n\n> "${trimmed}"\n\nHere is a structured breakdown:\n\n1. **Core Concept**: The key takeaway highlights the primary mechanism discussed in this section.\n2. **Mathematical Formulation**:\n   $$\n   \\mathcal{L}(\\theta) = \\mathbb{E}_{x \\sim p_{data}} \\left[ \\log D_\\theta(x) \\right] + \\lambda \\cdot \\Omega(\\theta)\n   $$\n3. **Practical Application**: You can reference this directly in your annotations or extract snippets for further review.\n\n*Note: Running in browser dev mode. In desktop app, this queries your local CLI engine.*`;
        }

        const assistantMessage: AiChatMessage = {
          id: `msg_${Date.now()}_a`,
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
              messages: [...s.messages, assistantMessage],
            };
          })
        );
      } catch (err) {
        const errorText = err instanceof Error ? err.message : String(err);
        const errorMessage: AiChatMessage = {
          id: `msg_${Date.now()}_err`,
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
              messages: [...s.messages, errorMessage],
            };
          })
        );
      } finally {
        activeRequestIdRef.current = null;
        setIsLoading(false);
      }
    },
    [activeSession, currentPage, docInfo?.fileName, isLoading, pdfDoc]
  );

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
    cancelActiveRequest,
  };
}
