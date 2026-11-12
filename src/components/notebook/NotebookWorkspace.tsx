import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NotebookEditor } from '@cinnabar/notebook/editor';
import { PAPER, type NotebookLayout } from '@cinnabar/notebook/layout';
import { serializeNotebook } from '@cinnabar/notebook';
import { useViewportZoom } from '../../hooks/useViewportZoom';
import { centerPageInViewport, fitPageZoom } from '../../lib/pdf/fitViewport';
import { useNotebookSession } from '../../hooks/useNotebookSession';
import type { NotebookTarget } from '../../lib/notebook/navigation';
import { saveNotebookFile, tauriOpenImage } from '../../utils/tauriBridge';

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
  const exportedRevision = useRef('');

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

  useViewportZoom(
    viewport,
    zoom,
    changeZoom,
    file?.id,
    embedded,
    '.independent-paper-stack',
    onActivate,
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
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          void leave();
        } else if (event.metaKey || event.ctrlKey) {
          if (event.key.toLowerCase() === 's') {
            event.preventDefault();
            void save();
          }
          if (['+', '=', '-', '0'].includes(event.key)) {
            event.preventDefault();
            changeZoom(
              event.key === '0'
                ? 0.8
                : Math.min(3, Math.max(0.4, zoom + (event.key === '-' ? -0.15 : 0.15))),
            );
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
                    background: file.document.styles.background,
                  }}
                />
              ))}
              <NotebookEditor
                key={file.id}
                document={file.document}
                zoom={zoom}
                editable
                onChange={notebook.change}
                onLayout={setLayout}
                controlsHost={null}
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
    </section>
  );
}
