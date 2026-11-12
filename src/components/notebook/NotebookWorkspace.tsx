import { useCallback, useEffect, useRef, useState } from 'react';
import { NotebookEditor } from '@cinnabar/notebook/editor';
import { PAPER, type NotebookLayout } from '@cinnabar/notebook/layout';
import { serializeNotebook } from '@cinnabar/notebook';
import { useNotebookSession } from '../../hooks/useNotebookSession';
import type { NotebookTarget } from '../../lib/notebook/navigation';
import { saveNotebookFile, tauriOpenImage } from '../../utils/tauriBridge';

export function NotebookWorkspace({ onBack, initialTarget, embedded = false, zoom: controlledZoom, onZoomChange, onActivate, onDocumentChange, pageRequest, fitRequest }: {
  onBack: () => void; initialTarget?: NotebookTarget; embedded?: boolean;
  zoom?: number; onZoomChange?: (zoom: number) => void; onActivate?: () => void;
  onDocumentChange?: (document: { title: string; pages: number; page: number } | null) => void;
  pageRequest?: { page: number; id: number } | null; fitRequest?: number;
}) {
  const notebook = useNotebookSession(initialTarget);
  const [layout, setLayout] = useState<NotebookLayout>({ pages: [], height: PAPER.height });
  const [localZoom, setLocalZoom] = useState(embedded ? .8 : 1);
  const [page, setPage] = useState(1);
  const zoom = controlledZoom ?? localZoom;
  const changeZoom = onZoomChange ?? setLocalZoom;
  const viewport = useRef<HTMLElement | null>(null);
  const pan = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const previousZoom = useRef(zoom);
  const latest = useRef(notebook); latest.current = notebook;
  const saving = useRef(false);
  const file = notebook.session?.present;
  const exportedRevision = useRef('');

  const save = useCallback(async () => {
    const snapshot = latest.current.session?.present;
    if (!snapshot || saving.current) return;
    saving.current = true;
    try {
      if (await saveNotebookFile(serializeNotebook(snapshot), snapshot.title)) exportedRevision.current = snapshot.revision;
    }
    catch (failure) { latest.current.setError(`Could not save the file. ${String(failure)}`); }
    finally { saving.current = false; }
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
    } catch (failure) { notebook.setError(`Save your notebook file before leaving. ${String(failure)}`); }
  }
  const pageCount = Math.max(1, layout.pages.length, file?.document.minimumSheets ?? 1);

  useEffect(() => {
    onDocumentChange?.(file ? { title: file.title, pages: pageCount, page: Math.min(page, pageCount) } : null);
  }, [file?.title, file?.id, pageCount, page, onDocumentChange]);
  useEffect(() => () => onDocumentChange?.(null), [onDocumentChange]);

  useEffect(() => {
    const element = viewport.current;
    if (element && file) element.scrollLeft = Math.max(0, (element.scrollWidth - element.clientWidth) / 2);
  }, [file?.id]);
  useEffect(() => {
    const element = viewport.current;
    const oldZoom = previousZoom.current;
    previousZoom.current = zoom;
    const stack = element?.querySelector<HTMLElement>('.independent-paper-stack');
    if (!element || !stack || oldZoom === zoom) return;
    element.scrollLeft = stack.offsetLeft + (element.scrollLeft + element.clientWidth / 2 - stack.offsetLeft) * zoom / oldZoom - element.clientWidth / 2;
    element.scrollTop = stack.offsetTop + (element.scrollTop + element.clientHeight / 2 - stack.offsetTop) * zoom / oldZoom - element.clientHeight / 2;
  }, [zoom]);

  useEffect(() => {
    if (!pageRequest || !viewport.current) return;
    const element = viewport.current;
    const stack = element.querySelector<HTMLElement>('.independent-paper-stack');
    if (stack) element.scrollTop = stack.offsetTop + (Math.min(pageCount, Math.max(1, pageRequest.page)) - 1) * (PAPER.height + PAPER.gap) * zoom;
  }, [pageRequest]);
  useEffect(() => {
    if (!fitRequest || !viewport.current) return;
    changeZoom(Math.min(3, Math.max(.4, (viewport.current.clientWidth - 64) / PAPER.width)));
  }, [fitRequest]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      onActivate?.();
      changeZoom(Math.min(3, Math.max(.4, zoom - event.deltaY * .004)));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [zoom, changeZoom, onActivate]);

  return <section className={`standalone-notebook ${embedded ? 'embedded-notebook' : ''}`} aria-label="Notebook workspace"
    onPointerDownCapture={onActivate} onFocusCapture={onActivate}
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        void leave();
      } else if (event.metaKey || event.ctrlKey) {
        if (event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
        if (['+', '=', '-', '0'].includes(event.key)) {
          event.preventDefault();
          changeZoom(event.key === '0' ? .8 : Math.min(3, Math.max(.4, zoom + (event.key === '-' ? -.15 : .15))));
        }
        event.stopPropagation();
      }
    }}>
    {notebook.error && <div role="alert" className="notebook-error">{notebook.error}<button type="button" onClick={() => notebook.setError(null)}>Dismiss</button></div>}
    <main ref={viewport} className="notebook-paper-viewport" aria-label="Notebook paper"
      onScroll={event => {
        const element = event.currentTarget;
        const stack = element.querySelector<HTMLElement>('.independent-paper-stack');
        if (stack) setPage(Math.min(pageCount, Math.max(1, Math.floor((element.scrollTop - stack.offsetTop + element.clientHeight / 2) / ((PAPER.height + PAPER.gap) * zoom)) + 1)));
      }}
      onPointerDownCapture={event => {
        if (event.button !== 1 && !(event.button === 0 && !(event.target as HTMLElement).closest('.independent-paper-stack'))) return;
        event.preventDefault();
        event.stopPropagation();
        const element = event.currentTarget;
        pan.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
        element.setPointerCapture(event.pointerId);
        element.dataset.panning = 'true';
      }}
      onPointerMove={event => {
        const start = pan.current;
        if (!start || start.id !== event.pointerId) return;
        event.currentTarget.scrollLeft = start.left - event.clientX + start.x;
        event.currentTarget.scrollTop = start.top - event.clientY + start.y;
      }}
      onPointerUp={event => {
        if (pan.current?.id !== event.pointerId) return;
        pan.current = null;
        delete event.currentTarget.dataset.panning;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={event => { pan.current = null; delete event.currentTarget.dataset.panning; }}>
      <div className="notebook-pan-canvas">
      {file && <div className="independent-paper-stack" style={{ width: PAPER.width * zoom, height: (pageCount * PAPER.height + (pageCount - 1) * PAPER.gap) * zoom }}>
        {Array.from({ length: pageCount }, (_, index) => <div key={index} className="independent-paper-sheet" aria-hidden="true"
          style={{ top: index * (PAPER.height + PAPER.gap) * zoom, width: PAPER.width * zoom, height: PAPER.height * zoom, background: file.document.styles.background }} />)}
        <NotebookEditor key={file.id} document={file.document} zoom={zoom} editable
          onChange={notebook.change} onLayout={setLayout} controlsHost={null}
          onPickImage={async () => {
            const image = await tauriOpenImage();
            if (!image) return null;
            const blob = await (await fetch(image.dataUrl)).blob();
            return new File([blob], image.fileName, { type: blob.type });
          }}
          undo={notebook.undo} redo={notebook.redo} canUndo={Boolean(notebook.session?.past.length)} canRedo={Boolean(notebook.session?.future.length)} />
      </div>}
      </div>
    </main>
  </section>;
}
