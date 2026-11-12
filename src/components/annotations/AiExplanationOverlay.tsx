import { readClipboardText, tauriCopyTextToClipboard } from '../../utils/tauriBridge';
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  AlertCircle,
  Check,
  Clipboard,
  ClipboardPaste,
  Copy,
  GripHorizontal,
  Image as ImageIcon,
  MessageCircle,
  RotateCcw,
  Trash2,
  X,
  Send,
} from 'lucide-react';
import { SparkleIcon } from '../icons/SparkleIcon';
import type { AiJobState } from '../../hooks/useAiExplanations';
import type {
  AiExplanationAnnotation,
  Annotation,
  AttachedImageAnnotation,
  ToolType,
} from '../../lib/types/index';
import { rasterizeResponseCard } from '../../lib/annotations/cardRasterizer';
import { AiResponseRenderer } from './AiResponseRenderer';

interface Props {
  pdfDoc?: PDFDocumentProxy | null;
  pageWidth: number;
  pageHeight: number;
  activeTool?: ToolType;
  annotations: AiExplanationAnnotation[];
  jobs: Record<string, AiJobState>;
  onSubmit: (annotation: AiExplanationAnnotation, prompt: string) => void;
  onCancel: (id: string) => void;
  onCloseJob: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Annotation>) => void;
  onDelete: (id: string) => void;
  onAddAnnotation: (ann: Annotation) => void;
  selectedAnnotationId?: string | null;
  onSelectAnnotation?: (id: string | null) => void;
  onSelectTool?: (tool: ToolType) => void;
}

const DEFAULT_PROMPT = 'Explain this clearly and concisely';

const QUICK_PROMPTS = [
  'Solve step-by-step',
  'Explain clearly',
  'Summarize key points',
  'Explain formulas & math',
  'Define technical terms',
];

const EXTERNAL_PROVIDERS = [
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'claude', label: 'Claude' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'external', label: 'External AI' },
];

interface CardItemProps {
  annotation: AiExplanationAnnotation;
  job?: AiJobState;
  pageWidth: number;
  pageHeight: number;
  isSelected: boolean;
  liveDrag?: { left: number; top: number };
  onDragStart: (
    e: React.PointerEvent,
    annotation: AiExplanationAnnotation,
    currentLeft: number,
    currentTop: number,
  ) => void;
  onDragMove: (e: React.PointerEvent, annotation: AiExplanationAnnotation) => void;
  onDragEnd: (e: React.PointerEvent, annotation: AiExplanationAnnotation) => void;
  onSubmit: (annotation: AiExplanationAnnotation, prompt: string) => void;
  onCancel: (id: string) => void;
  onCloseJob: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Annotation>) => void;
  onDelete: (id: string) => void;
  onAddAnnotation: (ann: Annotation) => void;
  onSelectAnnotation?: (id: string | null) => void;
  onHover?: (id: string | null) => void;
}

const AiExplanationCard: React.FC<CardItemProps> = React.memo(
  ({
    annotation,
    job,
    pageWidth,
    pageHeight,
    isSelected,
    liveDrag,
    onDragStart,
    onDragMove,
    onDragEnd,
    onSubmit,
    onCancel,
    onCloseJob,
    onUpdate,
    onDelete,
    onAddAnnotation,
    onSelectAnnotation,
    onHover,
  }) => {
    const isRunning = job?.phase === 'running';
    const isPromptComposer = !annotation.response && !isRunning;
    const cardRef = useRef<HTMLDivElement | null>(null);
    const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const externalResponseTextareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Local states for prompt composer and responses
    const [promptText, setPromptText] = useState(annotation.prompt || '');
    const [isPasting, setIsPasting] = useState(false);
    const [pastePrompt, setPastePrompt] = useState(annotation.prompt || '');
    const [pasteResp, setPasteResp] = useState('');
    const [provider, setProvider] = useState(annotation.provider || 'external');
    const [copied, setCopied] = useState(false);
    const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);
    const [isJustAppeared, setIsJustAppeared] = useState(
      () => !isPromptComposer && Date.now() - (annotation.createdAt || 0) < 2200,
    );

    useEffect(() => {
      if (!isJustAppeared) return;
      const timer = setTimeout(() => setIsJustAppeared(false), 2200);
      return () => clearTimeout(timer);
    }, [isJustAppeared]);

    const isDropAnimating = isJustAppeared && !liveDrag;

    // Keep prompt in sync if annotation changes externally
    useEffect(() => {
      if (annotation.prompt && !promptText) {
        setPromptText(annotation.prompt);
      }
    }, [annotation.prompt, promptText]);

    // Auto-resize prompt textarea smoothly without layout thrashing
    const adjustPromptHeight = useCallback(() => {
      const el = promptTextareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(Math.max(el.scrollHeight, 48), 120)}px`;
    }, []);

    useLayoutEffect(() => {
      if (isPromptComposer) {
        adjustPromptHeight();
      }
    }, [isPromptComposer, promptText, adjustPromptHeight]);

    const cardWidth = isPromptComposer
      ? Math.min(440, Math.max(280, pageWidth - 24))
      : Math.min(460, Math.max(300, pageWidth - 24));

    // Calculate card coordinates
    let cardLeft: number;
    let cardTop: number;

    if (liveDrag) {
      cardLeft = liveDrag.left;
      cardTop = liveDrag.top;
    } else if (annotation.cardX !== undefined && annotation.cardY !== undefined) {
      cardLeft = annotation.cardX * pageWidth;
      cardTop = annotation.cardY * pageHeight;
    } else {
      const selectionLeft = annotation.x * pageWidth;
      const selectionBottom = (annotation.y + annotation.height) * pageHeight;

      cardLeft = Math.max(8, Math.min(selectionLeft, pageWidth - cardWidth - 8));
      cardTop = Math.max(8, Math.min(pageHeight - 80, selectionBottom + 10));
    }

    const providerName =
      EXTERNAL_PROVIDERS.find((p) => p.id === annotation.provider)?.label ||
      (annotation.provider === 'chat'
        ? 'Cinnabar AI'
        : annotation.provider && annotation.provider !== 'codex'
          ? annotation.provider
          : null);

    const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setPromptText(val);
      // Inline instant auto-resize
      e.target.style.height = 'auto';
      e.target.style.height = `${Math.min(Math.max(e.target.scrollHeight, 48), 120)}px`;
    };

    const handleSubmitPrompt = () => {
      const trimmed = (promptText || annotation.prompt || DEFAULT_PROMPT).trim();
      if (trimmed) {
        if (annotation.cardX === undefined || annotation.cardY === undefined) {
          onUpdate(annotation.id, {
            cardX: cardLeft / pageWidth,
            cardY: cardTop / pageHeight,
          });
        }
        onSubmit(annotation, trimmed);
      }
    };

    const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
        e.preventDefault();
        handleSubmitPrompt();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };

    const handlePromptBlur = () => {
      const trimmed = promptText.trim();
      if (trimmed && trimmed !== annotation.prompt) {
        onUpdate(annotation.id, { prompt: trimmed });
      }
    };

    const handleSelectPreset = (qp: string) => {
      setPromptText(qp);
      if (promptTextareaRef.current) {
        promptTextareaRef.current.value = qp;
        promptTextareaRef.current.focus();
        promptTextareaRef.current.style.height = 'auto';
        promptTextareaRef.current.style.height = `${Math.min(
          Math.max(promptTextareaRef.current.scrollHeight, 48),
          120,
        )}px`;
      }
    };

    const handleCopyText = async (text: string) => {
      try {
        if (!(await tauriCopyTextToClipboard(text))) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch (err) {
        console.error('Failed to copy text:', err);
      }
    };

    const handleQuickPasteFromClipboard = async () => {
      try {
        const text = await readClipboardText();
        if (text && text.trim()) {
          const promptToUse = (promptText || annotation.prompt || DEFAULT_PROMPT).trim();
          onUpdate(annotation.id, {
            prompt: promptToUse,
            response: text.trim(),
            provider: 'external',
            isOpen: true,
            cardX: annotation.cardX ?? cardLeft / pageWidth,
            cardY: annotation.cardY ?? cardTop / pageHeight,
            updatedAt: Date.now(),
          });
          setClipboardNotice(null);
          setIsPasting(false);
          onCloseJob(annotation.id);
        } else {
          setClipboardNotice(
            'No text found in clipboard. If you copied an image or screenshot, please copy text to paste.',
          );
          setTimeout(() => setClipboardNotice(null), 4000);
        }
      } catch {
        setClipboardNotice('Could not access clipboard text. Please copy text first.');
        setTimeout(() => setClipboardNotice(null), 4000);
      }
    };

    const handleSaveExternalResponse = () => {
      const respText = pasteResp.trim();
      if (!respText) return;

      const promptToUse = (pastePrompt || promptText || annotation.prompt || DEFAULT_PROMPT).trim();

      onUpdate(annotation.id, {
        prompt: promptToUse,
        response: respText,
        provider,
        isOpen: true,
        cardX: annotation.cardX ?? cardLeft / pageWidth,
        cardY: annotation.cardY ?? cardTop / pageHeight,
        updatedAt: Date.now(),
      });
      setIsPasting(false);
      onCloseJob(annotation.id);
    };

    const handleRasterizeResponse = async () => {
      const rawResponse = annotation.response;
      if (!rawResponse || !cardRef.current) return;
      try {
        const isDark = document.documentElement.getAttribute('data-ui-theme') === 'dark';
        const raster = await rasterizeResponseCard(
          cardRef.current,
          annotation.prompt || 'Explain this section',
          rawResponse,
          isDark,
        );

        const imgAspect = raster.width / raster.height;
        const renderPixelWidth = Math.min(pageWidth * 0.75, Math.max(380, raster.width / 2));
        const normWidth = Math.min(0.9, renderPixelWidth / pageWidth);
        const normHeight = (normWidth * pageWidth) / (imgAspect * pageHeight);

        const normX = Math.max(0.02, Math.min(annotation.x, 1 - normWidth - 0.02));
        const normY = Math.max(0.02, Math.min(annotation.y, 1 - normHeight - 0.02));

        const imageAnnotation: AttachedImageAnnotation = {
          id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          pageNumber: annotation.pageNumber,
          type: 'image',
          dataUrl: raster.dataUrl,
          x: normX,
          y: normY,
          width: normWidth,
          height: normHeight,
          rotation: 0,
          opacity: 1,
          aspectRatio: raster.width / raster.height,
          name: `AI Explanation: ${annotation.prompt.slice(0, 30)}`,
          createdAt: Date.now(),
          extractedText: annotation.response,
          attachedInInvertedMode: isDark,
          invertInLightMode: true,
        };

        onAddAnnotation(imageAnnotation);
        onDelete(annotation.id);
        onCloseJob(annotation.id);
        onSelectAnnotation?.(imageAnnotation.id);
      } catch (err) {
        console.error('Failed to rasterize AI response:', err);
      }
    };

    const handleClose = () => {
      if (isRunning) void onCancel(annotation.id);
      if (!annotation.response && !isRunning) {
        onDelete(annotation.id);
        onCloseJob(annotation.id);
      } else {
        onUpdate(annotation.id, { isOpen: false, updatedAt: Date.now() });
      }
      onSelectAnnotation?.(null);
    };

    return (
      <div
        ref={cardRef}
        style={{
          width: `${cardWidth}px`,
          left: `${cardLeft}px`,
          top: `${cardTop}px`,
        }}
        role="dialog"
        aria-label="AI explanation note"
        className={`pointer-events-auto absolute z-30 flex flex-col overscroll-contain ${
          isPromptComposer
            ? 'ai-prompt-composer-stack'
            : `macos-ai-popover max-h-[min(78vh,600px)] overflow-hidden ${
                isDropAnimating ? 'ai-response-card-drop-appear' : ''
              } ${isSelected ? 'shadow-2xl ring-1 ring-blue-500/40' : ''}`
        }`}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelectAnnotation?.(annotation.id);
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        {/* Window Header with Drag Handle */}
        {!isPromptComposer && (
          <div
            onPointerDown={(e) => onDragStart(e, annotation, cardLeft, cardTop)}
            onPointerMove={(e) => onDragMove(e, annotation)}
            onPointerUp={(e) => onDragEnd(e, annotation)}
            onPointerCancel={(e) => onDragEnd(e, annotation)}
            onMouseEnter={() => onHover?.(annotation.id)}
            onMouseLeave={() => onHover?.(null)}
            className="flex shrink-0 cursor-grab items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--popover)]/60 px-3.5 py-2 backdrop-blur-xs select-none active:cursor-grabbing"
            title="Drag to move sticky note"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] opacity-70 hover:opacity-100" />
              <span className="font-medium tracking-tight text-[var(--foreground)]">
                AI Assistant
              </span>
              {providerName && (
                <span className="py-0.2 rounded-md border border-purple-500/30 bg-purple-500/15 px-1.5 font-mono text-[9.5px] font-medium text-purple-400">
                  {providerName}
                </span>
              )}
              {isDropAnimating && !isRunning && (
                <span className="py-0.2 animate-fade-in flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/15 px-1.5 text-[9.5px] font-semibold text-blue-400">
                  <SparkleIcon className="h-2.5 w-2.5 text-blue-400" />
                  Placed
                </span>
              )}
              {isRunning && (
                <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                  <span className="h-1.5 w-1.5 animate-ping rounded-full bg-blue-400" />
                  Thinking…
                </span>
              )}
            </div>

            <div
              className="flex shrink-0 items-center gap-1"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {annotation.response && !isRunning && (
                <>
                  <button
                    type="button"
                    className="macos-ai-action-btn h-6 w-6 rounded-md"
                    title="Rasterize explanation into adjustable image on page"
                    onClick={() => void handleRasterizeResponse()}
                    aria-label="Rasterize as Image"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="macos-ai-action-btn h-6 w-6 rounded-md"
                    title={copied ? 'Copied to clipboard' : 'Copy response'}
                    onClick={() => void handleCopyText(annotation.response)}
                    aria-label="Copy Response"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="macos-ai-action-btn h-6 w-6 rounded-md"
                    title="Regenerate"
                    onClick={() => {
                      onCloseJob(annotation.id);
                      onSubmit(annotation, annotation.prompt);
                    }}
                    aria-label="Regenerate"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="macos-ai-action-btn macos-ai-action-btn-danger h-6 w-6 rounded-md"
                    title="Delete"
                    onClick={() => {
                      onDelete(annotation.id);
                      onCloseJob(annotation.id);
                    }}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </>
              )}
              <button
                type="button"
                className="macos-ai-action-btn h-6 w-6 rounded-md"
                onClick={handleClose}
                aria-label="Close"
                title="Close sticky note"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Body */}
        <div
          className={`flex min-h-0 flex-1 flex-col gap-3 overscroll-contain select-text ${
            isPromptComposer ? '' : 'macos-thin-scrollbar overflow-x-hidden overflow-y-auto p-3.5'
          }`}
          onWheel={(event) => event.stopPropagation()}
        >
          {/* Prompt Composer or Thinking State */}
          {(!annotation.response || isRunning) && (
            <>
              {isRunning ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--secondary)]/60 p-3">
                    <div className="text-[10px] font-semibold tracking-wider text-[var(--muted-foreground)] uppercase">
                      Question
                    </div>
                    <div className="text-xs leading-relaxed font-medium text-[var(--foreground)]">
                      {promptText || annotation.prompt || DEFAULT_PROMPT}
                    </div>
                  </div>

                  {/* Clean Text-Driven Shimmer Thinking Box */}
                  <div className="macos-ai-thinking-box flex flex-col gap-2.5 p-3.5">
                    <div className="macos-ai-thinking-shimmer" />
                    <div className="relative z-10 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="ai-text-shimmer text-xs">
                          Thinking & generating explanation…
                        </span>
                        <span className="font-mono text-[10px] text-zinc-500">
                          Analyzing context
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5 pt-0.5">
                        <div className="ai-skeleton-line w-full" />
                        <div className="ai-skeleton-line w-4/5" />
                        <div className="ai-skeleton-line w-3/5" />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1.5 text-xs"
                      onClick={() => void onCancel(annotation.id)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : isPasting ? (
                /* External AI Response Paste Form */
                <div className="animate-fade-in flex flex-col gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--popover)] p-3 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                      <ClipboardPaste className="h-3.5 w-3.5 text-purple-400" />
                      <span>Attach External AI Response</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPasting(false)}
                      className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                      Back
                    </button>
                  </div>

                  {/* Question / Context Input */}
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`paste-prompt-${annotation.id}`}
                      className="text-[10px] font-semibold tracking-wider text-[var(--muted-foreground)] uppercase"
                    >
                      Question / Heading (Optional)
                    </label>
                    <input
                      id={`paste-prompt-${annotation.id}`}
                      type="text"
                      value={pastePrompt}
                      onChange={(e) => setPastePrompt(e.target.value)}
                      placeholder="e.g. Explain this section"
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-2.5 py-1.5 font-sans text-xs text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* AI Response Textarea */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={`paste-resp-${annotation.id}`}
                        className="text-[10px] font-semibold tracking-wider text-[var(--muted-foreground)] uppercase"
                      >
                        AI Response (Markdown & Math)
                      </label>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const text = await readClipboardText();
                            if (text) {
                              setPasteResp(text);
                            }
                          } catch {}
                        }}
                        className="flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300"
                        title="Paste from clipboard"
                      >
                        <Clipboard className="h-3 w-3" /> Paste
                      </button>
                    </div>
                    <textarea
                      ref={externalResponseTextareaRef}
                      id={`paste-resp-${annotation.id}`}
                      autoFocus
                      rows={6}
                      value={pasteResp}
                      onChange={(e) => setPasteResp(e.target.value)}
                      placeholder="Paste response from ChatGPT, Claude, DeepSeek, Gemini, etc..."
                      className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--input)] p-2 font-sans text-xs leading-relaxed text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* Source Provider Tags */}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className="text-[10px] text-[var(--muted-foreground)]">Provider:</span>
                    <div className="flex flex-wrap gap-1">
                      {EXTERNAL_PROVIDERS.map((p) => {
                        const isCurrent = provider === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setProvider(p.id)}
                            className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                              isCurrent
                                ? 'border border-purple-500/40 bg-purple-500/20 font-medium text-purple-300'
                                : 'border border-transparent bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-1.5 border-t border-[var(--border)] pt-1">
                    <button
                      type="button"
                      onClick={() => setIsPasting(false)}
                      className="px-2.5 py-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!pasteResp.trim()}
                      onClick={handleSaveExternalResponse}
                      className="btn-primary flex items-center gap-1 px-3 py-1 text-xs disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> Attach Response
                    </button>
                  </div>
                </div>
              ) : (
                /* Standard AI Composer */
                <div className="ai-prompt-composer-content flex flex-col gap-2">
                  <div className="ai-prompt-presets flex flex-wrap items-center gap-1.5 px-0.5">
                    {QUICK_PROMPTS.map((qp) => (
                      <button
                        key={qp}
                        type="button"
                        onClick={() => handleSelectPreset(qp)}
                        className="ai-prompt-preset"
                      >
                        {qp}
                      </button>
                    ))}
                  </div>

                  <div className="ai-prompt-composer">
                    <textarea
                      ref={promptTextareaRef}
                      id={`ai-prompt-${annotation.id}`}
                      autoFocus
                      rows={2}
                      aria-label="Ask AI about this selection"
                      value={promptText}
                      onChange={handlePromptChange}
                      onKeyDown={handlePromptKeyDown}
                      onBlur={handlePromptBlur}
                      placeholder="Ask about this selection…"
                      className="ai-prompt-composer-input w-full resize-none font-sans text-sm leading-6"
                    />
                    <div className="flex shrink-0 items-center gap-1.5">
                      {/* Clipboard Paste Button */}
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-[var(--muted-foreground)] transition-colors hover:border-[var(--border)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                        onClick={() => void handleQuickPasteFromClipboard()}
                        title="Paste AI response from clipboard"
                        aria-label="Paste response from clipboard"
                      >
                        <ClipboardPaste className="h-3.5 w-3.5" />
                      </button>
                      {/* Accent Blue Send Button */}
                      <button
                        type="button"
                        className="ai-prompt-send"
                        disabled={!promptText.trim()}
                        onClick={handleSubmitPrompt}
                        title="Explain selection (Enter)"
                        aria-label="Send prompt"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Clipboard Non-Text / Image Warning Notice */}
                  {clipboardNotice && (
                    <div
                      className="animate-slide-down flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-[11px] font-medium text-amber-400"
                      role="alert"
                    >
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{clipboardNotice}</span>
                    </div>
                  )}

                  {job?.phase === 'error' && (
                    <div
                      className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-[11px] text-amber-400"
                      role="alert"
                    >
                      {job.message}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Settled AI Response View */}
          {annotation.response && !isRunning && (
            <div className="flex flex-col gap-3">
              {(annotation.prompt || promptText) && (
                <div
                  data-ai-question="true"
                  className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--secondary)]/60 p-3"
                >
                  <div className="text-[10px] font-semibold tracking-wider text-[var(--muted-foreground)] uppercase">
                    Question
                  </div>
                  <div className="text-xs leading-relaxed font-medium text-[var(--foreground)]">
                    {annotation.prompt || promptText}
                  </div>
                </div>
              )}

              <div className="px-0.5 py-0.5">
                <AiResponseRenderer response={annotation.response} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
);

interface BadgeItemProps {
  annotation: AiExplanationAnnotation;
  job?: AiJobState;
  pageWidth: number;
  pageHeight: number;
  isSelected: boolean;
  activeTool?: ToolType;
  liveDrag?: { left: number; top: number };
  onDragStart: (
    e: React.PointerEvent,
    annotation: AiExplanationAnnotation,
    currentLeft: number,
    currentTop: number,
  ) => void;
  onDragMove: (e: React.PointerEvent, annotation: AiExplanationAnnotation) => void;
  onDragEnd: (e: React.PointerEvent, annotation: AiExplanationAnnotation) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onSelectTool?: (tool: ToolType) => void;
  onSelectAnnotation?: (id: string | null) => void;
  onHover?: (id: string | null) => void;
}

const AiCollapsedBadge: React.FC<BadgeItemProps> = React.memo(
  ({
    annotation,
    job,
    pageWidth,
    pageHeight,
    isSelected,
    activeTool,
    liveDrag,
    onDragStart,
    onDragMove,
    onDragEnd,
    onOpen,
    onDelete,
    onSelectTool,
    onHover,
  }) => {
    const isRunning = job?.phase === 'running';
    const hasMovedRef = useRef(false);
    const startPosRef = useRef({ x: 0, y: 0 });

    const badgeSize = 34;
    let badgeLeft: number;
    let badgeTop: number;

    if (liveDrag) {
      badgeLeft = liveDrag.left;
      badgeTop = liveDrag.top;
    } else if (annotation.cardX !== undefined && annotation.cardY !== undefined) {
      badgeLeft = annotation.cardX * pageWidth;
      badgeTop = annotation.cardY * pageHeight;
    } else {
      const selectionLeft = annotation.x * pageWidth;
      const selectionBottom = (annotation.y + annotation.height) * pageHeight;
      badgeLeft = Math.max(8, Math.min(selectionLeft, pageWidth - badgeSize - 8));
      badgeTop = Math.max(8, Math.min(pageHeight - badgeSize - 8, selectionBottom + 10));
    }

    const handlePointerDown = (e: React.PointerEvent) => {
      e.stopPropagation();
      if (activeTool === 'eraser') {
        onDelete(annotation.id);
        onSelectTool?.('select');
        return;
      }
      hasMovedRef.current = false;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      onDragStart(e, annotation, badgeLeft, badgeTop);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      if (Math.hypot(e.clientX - startPosRef.current.x, e.clientY - startPosRef.current.y) > 3) {
        hasMovedRef.current = true;
      }
      onDragMove(e, annotation);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
      e.stopPropagation();
      onDragEnd(e, annotation);
      if (!hasMovedRef.current && activeTool !== 'eraser') {
        onOpen(annotation.id);
      }
    };

    return (
      <div
        style={{
          width: `${badgeSize}px`,
          height: `${badgeSize}px`,
          left: `${badgeLeft}px`,
          top: `${badgeTop}px`,
        }}
        role="button"
        tabIndex={0}
        aria-label="Open AI explanation"
        title={
          annotation.prompt
            ? `AI Explanation: "${annotation.prompt.slice(0, 50)}${annotation.prompt.length > 50 ? '…' : ''}"`
            : 'Open AI explanation'
        }
        className={`pointer-events-auto absolute z-30 flex cursor-pointer items-center justify-center rounded-full transition-all duration-150 select-none ${
          isSelected
            ? 'scale-110 shadow-lg ring-2 ring-[var(--primary)] ring-offset-2'
            : 'shadow-md hover:scale-110'
        } ${
          isRunning
            ? 'animate-pulse border border-[var(--primary)] bg-[var(--primary)] text-white'
            : 'border border-[var(--border)] bg-white text-[var(--primary)] hover:border-[var(--primary)]/50 hover:bg-blue-50/50 hover:shadow-lg dark:bg-[var(--card)] dark:hover:bg-[var(--secondary)]'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={(e) => onDragEnd(e, annotation)}
        onMouseEnter={() => onHover?.(annotation.id)}
        onMouseLeave={() => onHover?.(null)}
        onClick={(e) => {
          e.stopPropagation();
          if (activeTool === 'eraser') {
            onDelete(annotation.id);
            onSelectTool?.('select');
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(annotation.id);
          }
        }}
      >
        <MessageCircle className="h-4 w-4 text-[var(--primary)]" />
        {isRunning && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-300 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-white bg-blue-400" />
          </span>
        )}
      </div>
    );
  },
);

AiCollapsedBadge.displayName = 'AiCollapsedBadge';

export const AiExplanationOverlay: React.FC<Props> = ({
  pageWidth,
  pageHeight,
  activeTool,
  annotations,
  jobs,
  onSubmit,
  onCancel,
  onCloseJob,
  onUpdate,
  onDelete,
  onAddAnnotation,
  selectedAnnotationId,
  onSelectAnnotation,
  onSelectTool,
}) => {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(null);
  const [dragPositions, setDragPositions] = useState<Record<string, { left: number; top: number }>>(
    {},
  );
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    initialLeft: number;
    initialTop: number;
    hasDragged: boolean;
  }>({ clientX: 0, clientY: 0, initialLeft: 0, initialTop: 0, hasDragged: false });

  const handleDragPointerDown = useCallback(
    (
      e: React.PointerEvent,
      annotation: AiExplanationAnnotation,
      currentLeft: number,
      currentTop: number,
    ) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('button, input, textarea, a, select') ||
        (target.closest('[role="button"]') && target.closest('[role="button"]') !== e.currentTarget)
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setActiveDragId(annotation.id);
      onSelectAnnotation?.(annotation.id);

      dragStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        initialLeft: currentLeft,
        initialTop: currentTop,
        hasDragged: false,
      };

      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    },
    [onSelectAnnotation],
  );

  const handleDragPointerMove = useCallback(
    (e: React.PointerEvent, annotation: AiExplanationAnnotation) => {
      if (activeDragId !== annotation.id) return;
      const dx = e.clientX - dragStartRef.current.clientX;
      const dy = e.clientY - dragStartRef.current.clientY;

      if (!dragStartRef.current.hasDragged && Math.hypot(dx, dy) > 3) {
        dragStartRef.current.hasDragged = true;
      }

      if (!dragStartRef.current.hasDragged) return;

      const newLeft = dragStartRef.current.initialLeft + dx;
      const newTop = dragStartRef.current.initialTop + dy;

      setDragPositions((prev) => ({
        ...prev,
        [annotation.id]: { left: newLeft, top: newTop },
      }));
    },
    [activeDragId],
  );

  const handleDragPointerUp = useCallback(
    (e: React.PointerEvent, annotation: AiExplanationAnnotation) => {
      if (activeDragId === annotation.id) {
        setActiveDragId(null);
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}

        if (dragStartRef.current.hasDragged) {
          const pos = dragPositions[annotation.id];
          if (pos) {
            onUpdate(annotation.id, {
              cardX: pos.left / pageWidth,
              cardY: pos.top / pageHeight,
              updatedAt: Date.now(),
            });
          }
        }

        // Clean up drag position so stale coordinates don't leak
        setDragPositions((prev) => {
          if (!prev[annotation.id]) return prev;
          const next = { ...prev };
          delete next[annotation.id];
          return next;
        });
      }
    },
    [activeDragId, dragPositions, onUpdate, pageHeight, pageWidth],
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* 1. Interactive Selection Hitboxes & Dynamic AI Region Highlights */}
      {annotations.map((annotation) => {
        // Regionless responses (pinned from chat) anchor on a tiny box; render no region outline
        if (annotation.width * pageWidth < 6 && annotation.height * pageHeight < 6) return null;
        const job = jobs[annotation.id];
        const isRunning = job?.phase === 'running';
        const isPromptComposer = !annotation.response && !isRunning;
        const isOpen =
          annotation.isOpen !== false ||
          isPromptComposer ||
          isRunning ||
          selectedAnnotationId === annotation.id;

        const isHovered = hoveredAnnotationId === annotation.id;
        const isDragging = activeDragId === annotation.id;

        // When the AI response window is hidden/in bubble phase (!isOpen), keep the region visible.
        // When open, only show the region when hovering on the top drag bar or dragging.
        const isRegionVisible = !isOpen || isHovered || isDragging;

        return (
          <div
            key={`ai-hitbox-${annotation.id}`}
            data-ai-annotation-id={annotation.id}
            className={`absolute transition-opacity duration-150 ${
              activeTool === 'eraser' ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'
            } ${
              isRegionVisible
                ? 'border-2 border-dashed border-[var(--primary)] bg-transparent opacity-100'
                : 'border-2 border-dashed border-transparent bg-transparent opacity-0'
            }`}
            style={{
              left: `${annotation.x * pageWidth}px`,
              top: `${annotation.y * pageHeight}px`,
              width: `${annotation.width * pageWidth}px`,
              height: `${annotation.height * pageHeight}px`,
            }}
            onClick={(event) => {
              if (activeTool === 'eraser') {
                event.stopPropagation();
                onDelete(annotation.id);
                onSelectTool?.('select');
              }
            }}
            role={activeTool === 'eraser' ? 'button' : undefined}
            tabIndex={activeTool === 'eraser' ? 0 : -1}
            aria-label="AI region"
          />
        );
      })}

      {/* 2. Persistent AI Sticky Windows (when open) or Circular Message Icons (when closed) */}
      {annotations.map((annotation) => {
        const job = jobs[annotation.id];
        const isRunning = job?.phase === 'running';
        const isPromptComposer = !annotation.response && !isRunning;
        const isOpen =
          annotation.isOpen !== false ||
          isPromptComposer ||
          isRunning ||
          selectedAnnotationId === annotation.id;

        if (isOpen) {
          return (
            <AiExplanationCard
              key={`ai-card-${annotation.id}`}
              annotation={annotation}
              job={job}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              isSelected={selectedAnnotationId === annotation.id}
              liveDrag={activeDragId === annotation.id ? dragPositions[annotation.id] : undefined}
              onDragStart={handleDragPointerDown}
              onDragMove={handleDragPointerMove}
              onDragEnd={handleDragPointerUp}
              onSubmit={onSubmit}
              onCancel={onCancel}
              onCloseJob={onCloseJob}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddAnnotation={onAddAnnotation}
              onSelectAnnotation={onSelectAnnotation}
              onHover={setHoveredAnnotationId}
            />
          );
        }

        return (
          <AiCollapsedBadge
            key={`ai-badge-${annotation.id}`}
            annotation={annotation}
            job={job}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            isSelected={selectedAnnotationId === annotation.id}
            activeTool={activeTool}
            liveDrag={activeDragId === annotation.id ? dragPositions[annotation.id] : undefined}
            onDragStart={handleDragPointerDown}
            onDragMove={handleDragPointerMove}
            onDragEnd={handleDragPointerUp}
            onOpen={(id) => {
              onUpdate(id, { isOpen: true, updatedAt: Date.now() });
              onSelectAnnotation?.(id);
            }}
            onDelete={onDelete}
            onSelectTool={onSelectTool}
            onSelectAnnotation={onSelectAnnotation}
            onHover={setHoveredAnnotationId}
          />
        );
      })}
    </div>
  );
};
