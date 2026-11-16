import { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import {
  NotebookEditor,
  type NotebookReference,
  type NotebookSelection,
} from '@cinnabar/notebook/editor';
import { loadNotebookBlockChoices } from '../../lib/notebook/blockSources';
import { AiChatPanel } from '../ai/AiChatPanel';
import {
  independentNotebookContext,
  applyAiNotebookWrite,
  type AiNotebookBinding,
} from '../../lib/ai/notebookBinding';
import type { AiNotebookReferenceOption } from '../../lib/ai/notebookEdits';
import { createAiClipboardAttachment } from '../../lib/ai/chatClipboard';
import type { AiChatAttachment } from '../../lib/types';
import { PAPER, type NotebookLayout } from '@cinnabar/notebook/layout';
import { BLOCK_TYPES, serializeNotebook } from '@cinnabar/notebook';
import { useViewportZoom, type ZoomStepRequest } from '../../hooks/useViewportZoom';
import { centerPageInViewport, fitPageZoom } from '../../lib/pdf/fitViewport';
import { useNotebookSession } from '../../hooks/useNotebookSession';
import type { NotebookTarget } from '../../lib/notebook/navigation';
import { saveNotebookFile, tauriOpenImage, tauriReadFile } from '../../utils/tauriBridge';

export function NotebookWorkspace({
  onBack,
  initialTarget,
  embedded = false,
  zoom: controlledZoom,
  onZoomChange,
  onActivate,
  onDocumentChange,
  pageRequest,
  fitRequest,
  zoomStepRequest,
  onOpenPdfReference,
  onAiNotebookChange,
  aiOpen = false,
  onCloseAi,
}: {
  onBack: () => void;
  initialTarget?: NotebookTarget;
  embedded?: boolean;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  onActivate?: () => void;
  onDocumentChange?: (document: { title: string; pages: number; page: number } | null) => void;
  pageRequest?: { page: number; id: number } | null;
  fitRequest?: number;
  zoomStepRequest?: ZoomStepRequest | null;
  onAiNotebookChange?: (binding: AiNotebookBinding | null) => void;
  aiOpen?: boolean;
  onCloseAi?: () => void;
  onOpenPdfReference?: (
    data: Uint8Array,
    name: string,
    path: string,
    page: number,
  ) => Promise<boolean>;
}) {
  const notebook = useNotebookSession(initialTarget);
  const [layout, setLayout] = useState<NotebookLayout>({ pages: [], height: PAPER.height });
  const [localZoom, setLocalZoom] = useState(embedded ? 0.8 : 1);
  const [page, setPage] = useState(1);
  const [spacePressed, setSpacePressed] = useState(false);
  const zoom = controlledZoom ?? localZoom;
  const changeZoom = onZoomChange ?? setLocalZoom;
  const viewport = useRef<HTMLElement | null>(null);
  const pendingFit = useRef<{ page: number; zoom: number } | null>(null);
  const pan = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const latest = useRef(notebook);
  latest.current = notebook;
  const saving = useRef(false);
  const file = notebook.session?.present;
  async function openReference(reference: NotebookReference) {
    try {
      await notebook.flush();
      if (reference.kind === 'notebook') {
        await notebook.open(reference.target);
      } else {
        const source = await tauriReadFile(reference.target);
        if (!source) throw new Error('The source PDF is no longer available.');
        if (!onOpenPdfReference) throw new Error('PDF navigation is unavailable.');
        await onOpenPdfReference(source.data, source.fileName, source.filePath, reference.page);
      }
    } catch (error) {
      notebook.setError(String(error));
    }
  }
  const exportedRevision = useRef('');
  const [aiReferences, setAiReferences] = useState<AiNotebookReferenceOption[]>([]);
  const [aiAttachments, setAiAttachments] = useState<AiChatAttachment[]>([]);
  const [aiSelection, setAiSelection] = useState<NotebookSelection>();
  useEffect(() => {
    let alive = true;
    setAiReferences([]);
    setAiAttachments([]);
    setAiSelection(undefined);
    void Promise.all([loadNotebookBlockChoices('pdf'), loadNotebookBlockChoices('notebook')])
      .then((groups) => {
        if (!alive) return;
        setAiReferences(
          groups
            .flatMap((choices, index) =>
              choices.flatMap((choice) => {
                const attrs = choice.content[0]?.attrs;
                if (!attrs || typeof attrs.target !== 'string' || typeof attrs.label !== 'string')
                  return [];
                return [
                  {
                    id: `${index === 0 ? 'pdf' : 'notebook'}:${choice.id}`,
                    kind: index === 0 ? ('pdf' as const) : ('notebook' as const),
                    target: attrs.target,
                    label: attrs.label,
                    page: 1,
                  },
                ];
              }),
            )
            .slice(0, 100),
        );
      })
      .catch(() => {
        /* Reference discovery is optional. */
      });
    return () => {
      alive = false;
    };
  }, [file?.id]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.code !== 'Space' ||
        event.repeat ||
        (target instanceof HTMLElement &&
          (target.isContentEditable || target.closest('input, textarea, select, button')))
      )
        return;
      setSpacePressed(true);
      // Prevent Space from scrolling the canvas before a drag starts.
      if (viewport.current?.contains(target as Node)) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false);
    };
    const reset = () => {
      setSpacePressed(false);
      const element = viewport.current;
      if (element && pan.current && element.hasPointerCapture(pan.current.id))
        element.releasePointerCapture(pan.current.id);
      pan.current = null;
      if (element) delete element.dataset.panning;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
      reset();
    };
  }, []);

  const save = useCallback(async () => {
    const snapshot = latest.current.session?.present;
    if (!snapshot || saving.current) return;
    saving.current = true;
    try {
      if (await saveNotebookFile(serializeNotebook(snapshot), snapshot.title))
        exportedRevision.current = snapshot.revision;
    } catch (failure) {
      latest.current.setError(`Could not save the file. ${String(failure)}`);
    } finally {
      saving.current = false;
    }
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current.saveStatus === 'Saved on this device') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  async function leave() {
    try {
      if (notebook.session?.present.revision !== exportedRevision.current) await notebook.flush();
      onBack();
    } catch (failure) {
      notebook.setError(`Save your notebook file before leaving. ${String(failure)}`);
    }
  }
  const pageCount = Math.max(1, layout.pages.length, file?.document.minimumSheets ?? 1);
  const aiBinding = useMemo<AiNotebookBinding | null>(
    () =>
      file
        ? {
            context: {
              ...independentNotebookContext(file, pageCount, page, aiReferences),
              selection: aiSelection,
            },
            write: async (key, write, canApply) => {
              const session = latest.current.session;
              if (
                !session ||
                key !== `notebook:${session.present.id}` ||
                write.revision !== session.present.revision ||
                !canApply()
              )
                throw new Error('The notebook changed. Retry using its latest version.');
              const document = applyAiNotebookWrite(session.present.document, write, aiReferences);
              await latest.current.applyAi(write.revision, document, canApply);
              return 'Notebook updated. You can undo this change.';
            },
          }
        : null,
    [file, pageCount, page, aiReferences, aiSelection],
  );
  useEffect(() => {
    onAiNotebookChange?.(aiBinding);
  }, [aiBinding, onAiNotebookChange]);
  useEffect(() => () => onAiNotebookChange?.(null), [onAiNotebookChange]);

  useEffect(() => {
    onDocumentChange?.(
      file ? { title: file.title, pages: pageCount, page: Math.min(page, pageCount) } : null,
    );
  }, [file?.title, file?.id, pageCount, page, onDocumentChange]);
  useEffect(() => () => onDocumentChange?.(null), [onDocumentChange]);

  useEffect(() => {
    const element = viewport.current;
    if (element && file)
      element.scrollLeft = Math.max(0, (element.scrollWidth - element.clientWidth) / 2);
  }, [file?.id]);
  useEffect(() => {
    if (!pageRequest || !viewport.current) return;
    const element = viewport.current;
    const stack = element.querySelector<HTMLElement>('.independent-paper-stack');
    if (stack)
      element.scrollTop =
        stack.offsetTop +
        (Math.min(pageCount, Math.max(1, pageRequest.page)) - 1) *
          (PAPER.height + PAPER.gap) *
          zoom;
  }, [pageRequest]);
  useEffect(() => {
    if (!fitRequest || !viewport.current) return;
    const element = viewport.current;
    const fitted = fitPageZoom(
      element.clientWidth,
      element.clientHeight,
      PAPER.width,
      PAPER.height,
    );
    if (fitted === zoom) {
      const sheet = element.querySelectorAll<HTMLElement>('.independent-paper-sheet')[page - 1];
      if (sheet) centerPageInViewport(element, sheet);
    } else {
      pendingFit.current = { page, zoom: fitted };
      changeZoom(fitted);
    }
  }, [fitRequest]);

  const stepZoom = useViewportZoom(
    viewport,
    zoom,
    changeZoom,
    file?.id,
    embedded,
    '.independent-paper-stack',
    onActivate,
    true,
    zoomStepRequest,
  );

  useLayoutEffect(() => {
    const pending = pendingFit.current;
    if (!pending || pending.zoom !== zoom || !viewport.current) return;
    const sheet = viewport.current.querySelectorAll<HTMLElement>('.independent-paper-sheet')[
      pending.page - 1
    ];
    if (sheet) centerPageInViewport(viewport.current, sheet);
    pendingFit.current = null;
  }, [zoom]);

  return (
    <section
      className={`standalone-notebook ${embedded ? 'embedded-notebook' : ''}`}
      aria-label="Notebook workspace"
      onPointerDownCapture={onActivate}
      onFocusCapture={onActivate}
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (aiOpen && !embedded) {
            onCloseAi?.();
            return;
          }
          void leave();
        } else if (event.metaKey || event.ctrlKey) {
          // Let the app's AI shortcut work while the editor or chat input has focus.
          if (event.key.toLowerCase() === 'j' && !event.shiftKey && !event.altKey) return;
          if (event.key.toLowerCase() === 's') {
            event.preventDefault();
            void save();
          }
          if (['+', '=', '-', '0'].includes(event.key)) {
            event.preventDefault();
            if (event.key === '0') changeZoom(0.8);
            else stepZoom(event.key === '-' ? -0.15 : 0.15, 0.4);
          }
          event.stopPropagation();
        }
      }}
    >
      {notebook.error && (
        <div role="alert" className="notebook-error">
          {notebook.error}
          <button type="button" onClick={() => notebook.setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      <main
        ref={viewport}
        className="notebook-paper-viewport"
        aria-label="Notebook paper"
        data-hand-mode={spacePressed || undefined}
        onScroll={(event) => {
          const element = event.currentTarget;
          const stack = element.querySelector<HTMLElement>('.independent-paper-stack');
          if (stack)
            setPage(
              Math.min(
                pageCount,
                Math.max(
                  1,
                  Math.floor(
                    (element.scrollTop - stack.offsetTop + element.clientHeight / 2) /
                      ((PAPER.height + PAPER.gap) * zoom),
                  ) + 1,
                ),
              ),
            );
        }}
        onPointerDownCapture={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('button, input, textarea, select, a')) return;
          const background = !target.closest('.independent-paper-stack');
          if (event.button !== 1 && !(event.button === 0 && (spacePressed || background))) return;
          pendingFit.current = null;
          event.preventDefault();
          event.stopPropagation();
          const element = event.currentTarget;
          pan.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: element.scrollLeft,
            top: element.scrollTop,
          };
          element.setPointerCapture(event.pointerId);
          element.dataset.panning = 'true';
        }}
        onPointerMove={(event) => {
          const start = pan.current;
          if (!start || start.id !== event.pointerId) return;
          event.currentTarget.scrollLeft = start.left - event.clientX + start.x;
          event.currentTarget.scrollTop = start.top - event.clientY + start.y;
        }}
        onPointerUp={(event) => {
          if (pan.current?.id !== event.pointerId) return;
          pan.current = null;
          delete event.currentTarget.dataset.panning;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={(event) => {
          pan.current = null;
          delete event.currentTarget.dataset.panning;
        }}
      >
        <div className="notebook-pan-canvas">
          {file && (
            <div
              className="independent-paper-stack"
              style={{
                width: PAPER.width * zoom,
                height: (pageCount * PAPER.height + (pageCount - 1) * PAPER.gap) * zoom,
              }}
            >
              {Array.from({ length: pageCount }, (_, index) => (
                <div
                  key={index}
                  className="independent-paper-sheet"
                  aria-hidden="true"
                  style={{
                    top: index * (PAPER.height + PAPER.gap) * zoom,
                    width: PAPER.width * zoom,
                    height: PAPER.height * zoom,
                    background: `var(--notebook-paper-background, ${file.document.styles.background})`,
                  }}
                />
              ))}
              <NotebookEditor
                key={`${file.id}:${BLOCK_TYPES.join(',')}`}
                document={file.document}
                onSelectionChange={setAiSelection}
                zoom={zoom}
                editable
                onChange={notebook.change}
                onLayout={setLayout}
                controlsHost={null}
                loadBlockChoices={loadNotebookBlockChoices}
                onOpenReference={(reference) => void openReference(reference)}
                onPickImage={async () => {
                  const image = await tauriOpenImage();
                  if (!image) return null;
                  const blob = await (await fetch(image.dataUrl)).blob();
                  return new File([blob], image.fileName, { type: blob.type });
                }}
                undo={notebook.undo}
                redo={notebook.redo}
                canUndo={Boolean(notebook.session?.past.length)}
                canRedo={Boolean(notebook.session?.future.length)}
              />
            </div>
          )}
        </div>
      </main>
      {!embedded && aiBinding && (
        <AiChatPanel
          isOpen={aiOpen}
          onClose={() => onCloseAi?.()}
          currentPage={page}
          notebook={aiBinding.context}
          onWriteNotebook={aiBinding.write}
          pendingAttachments={aiAttachments}
          onRemoveAttachment={(id) =>
            setAiAttachments((items) => items.filter((item) => item.id !== id))
          }
          onPasteImages={async (files) => {
            const identity = latest.current.session?.present.id;
            const attachments = await Promise.all(files.map(createAiClipboardAttachment));
            if (latest.current.session?.present.id === identity)
              setAiAttachments((items) => [...items, ...attachments]);
          }}
        />
      )}
    </section>
  );
}
