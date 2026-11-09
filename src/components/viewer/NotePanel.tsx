import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pdfjsLib } from '../../lib/pdf/pdfWorker';
import { findFocalPageNumber } from '../../lib/pdf/viewerPosition';
import { PDFPage } from './PDFPage';
import type { useAnnotations } from '../../hooks/useAnnotations';
import { useAiExplanations } from '../../hooks/useAiExplanations';
import { copyPageImageToClipboard, copyTextToClipboard } from '../../lib/pdf/pageExtractor';
import { isAnnotationHitByEraser } from '../../lib/annotations/eraserUtils';
import { cropCanvasRegion } from '../../lib/snippets/snippetExtractor';
import type { AiExplanationAnnotation, Annotation, SnippetImageEntry } from '../../lib/types';

type SharedTools = Pick<ComponentProps<typeof PDFPage>,
  'activeTool' | 'selectedColor' | 'highlightColors' | 'strokeWidth' | 'opacity' |
  'highlightStyle' | 'lineHighlightStyle' | 'onChangeHighlightStyle' |
  'onChangeLineHighlightStyle' | 'onSelectTool' | 'selectedAnnotationId' |
  'onSelectAnnotation' | 'onImageDrop' | 'onCursorMove'>;

interface NotePanelProps extends SharedTools {
  notes: ReturnType<typeof useAnnotations>;
  docKey: string;
  page: number;
  pageCount: number;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onPageChange: (page: number) => void;
  pageNavRequest: { page: number; timestamp: number } | null;
  fitPageRequest: { id: number; page: number } | null;
  onAddPage: () => void;
  onActivate: () => void;
  onCapture: (entry: SnippetImageEntry) => void;
  showToast: (message: string, isError?: boolean) => void;
}

export function NotePanel({ notes, docKey, page, pageCount, zoom, onZoomChange,
  onPageChange, pageNavRequest, fitPageRequest, onAddPage, onActivate, onCapture,
  showToast, ...tools }: NotePanelProps) {
  const [paper, setPaper] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const lastReportedPage = useRef(page);
  const tasks = useRef(new Set<ReturnType<typeof pdfjsLib.getDocument>>());
  const ai = useAiExplanations({ pdfDoc: paper, documentName: 'Notes', docKey, updateAnnotation: notes.updateAnnotation, pageIdPrefix: 'note-paper' });
  const annotationsByPage = useMemo(() => {
    const pages = new Map<number, Annotation[]>();
    for (const annotation of notes.annotations) {
      const annotations = pages.get(annotation.pageNumber) ?? [];
      annotations.push(annotation);
      pages.set(annotation.pageNumber, annotations);
    }
    return pages;
  }, [notes.annotations]);

  useEffect(() => () => {
    for (const task of tasks.current) void task.destroy();
    tasks.current.clear();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    void (async () => {
      const pdf = await PDFDocument.create();
      for (let i = 0; i < pageCount; i++) pdf.addPage([595, 842]);
      const data = await pdf.save();
      if (cancelled) return;
      const task = pdfjsLib.getDocument({ data });
      tasks.current.add(task);
      const document = await task.promise;
      if (cancelled) { tasks.current.delete(task); void task.destroy(); return; }
      setPaper(document);
    })().catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [pageCount]);

  // Release the previous document after its replacement has committed.
  useEffect(() => {
    if (!paper) return;
    for (const task of tasks.current) {
      void task.promise.then((document) => {
        if (document !== paper) { tasks.current.delete(task); void task.destroy(); }
      }).catch(() => {});
    }
  }, [paper]);

  useEffect(() => {
    if (!paper || !pageNavRequest || pageNavRequest.page > paper.numPages) return;
    container.current?.querySelector(`#note-paper-${pageNavRequest.page}`)
      ?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [paper, pageNavRequest]);

  useEffect(() => {
    if (!fitPageRequest || !container.current) return;
    onZoomChange(Math.max(.3, Math.min(3.5, (container.current.clientWidth - 48) / 595,
      (container.current.clientHeight - 48) / 842)));
  }, [fitPageRequest, onZoomChange]);

  const eraseAt = (clientX: number, clientY: number) => {
    const pages = container.current?.querySelectorAll<HTMLElement>('[data-pdf-page-number]');
    for (const element of pages ?? []) {
      const bounds = element.getBoundingClientRect();
      if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) continue;
      const number = Number(element.dataset.pdfPageNumber);
      const hit = (annotationsByPage.get(number) ?? []).findLast((annotation) =>
        isAnnotationHitByEraser(annotation, clientX - bounds.left, clientY - bounds.top, bounds.width, bounds.height, 12, zoom));
      if (hit) notes.deleteAnnotation(hit.id);
    }
  };

  const copyPageText = (number: number) => {
    const text = (annotationsByPage.get(number) ?? []).flatMap((annotation) =>
      'text' in annotation && annotation.text ? [annotation.text] : []).join('\n\n');
    void copyTextToClipboard(text);
  };

  const addAi = (number: number, x = .01, y = .01, prompt = '', response = '') => {
    const now = Date.now();
    const annotation: AiExplanationAnnotation = {
      id: crypto.randomUUID(), type: 'ai-explanation', pageNumber: number,
      x, y, width: .8, height: .5, prompt, response, isOpen: true, createdAt: now, updatedAt: now,
    };
    notes.addAnnotation(annotation);
    tools.onSelectAnnotation(annotation.id);
    if (!response) ai.openComposer(annotation.id);
    tools.onSelectTool?.('select');
  };

  return (
    <section className="note-panel" aria-label="PDF notebook" onPointerEnter={onActivate} onFocusCapture={onActivate}>
      {notes.saveStatus === 'error' && <p role="alert">Could not save notes. Your edits are still open.</p>}
      <div className="note-panel-paper pdf-viewer-viewport" ref={container} tabIndex={0} aria-label="Note pages"
        onWheel={onActivate}
        onScroll={() => {
          const element = container.current;
          if (!element) return;
          const bounds = element.getBoundingClientRect();
          const pages = Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-page-number]')).map((page) => {
            const rect = page.getBoundingClientRect();
            return { pageNumber: Number(page.dataset.pdfPageNumber), top: rect.top, bottom: rect.bottom };
          });
          const current = findFocalPageNumber(bounds.top, bounds.height, pages, lastReportedPage.current);
          if (current !== lastReportedPage.current) { lastReportedPage.current = current; onPageChange(current); }
        }}
        onPointerDownCapture={(event) => {
          onActivate();
          if (!(event.target as HTMLElement).closest('button, input, textarea, [contenteditable="true"]')) {
            container.current?.focus({ preventScroll: true });
          }
          if (tools.activeTool === 'eraser') { event.preventDefault(); event.stopPropagation(); eraseAt(event.clientX, event.clientY); }
        }}
        onPointerMove={(event) => { if (tools.activeTool === 'eraser' && event.buttons === 1) eraseAt(event.clientX, event.clientY); }}>
        <div className="note-paper-stack">
          {error && <p role="alert">Could not load note paper. Reopen note mode to try again.</p>}
          {!paper && !error && <p role="status">Preparing note paper…</p>}
          {paper && Array.from({ length: paper.numPages }, (_, i) => i + 1).map((number) => <PDFPage
            {...tools} key={number} pdfDoc={paper} pageNumber={number} pageIdPrefix="note-paper"
            scale={zoom} currentTheme="default" filterClass="" customFilterStyle={{}}
            annotations={annotationsByPage.get(number) ?? []}
            onAddAnnotation={notes.addAnnotation} onUpdateAnnotation={notes.updateAnnotation}
            onDeleteAnnotation={notes.deleteAnnotation}
            onAiResponseDrop={addAi} aiJobs={ai.jobs}
            onAiBoxCreated={ai.openComposer} onSubmitAi={(annotation, prompt) => { void ai.submit(annotation, prompt); tools.onSelectTool?.('select'); }}
            onCancelAi={(id) => { void ai.cancel(id); }} onCloseAi={ai.close}
            onDeletePage={() => {}} onCopyPageText={copyPageText}
            onCopyPageImage={(number) => { void copyPageImageToClipboard(number, paper, 'note-paper'); }}
            onAskAiAboutPage={addAi}
            onCaptureSnippet={(number, rect) => {
              void cropCanvasRegion(number, rect, paper, 'note-paper').then((entry) => {
                if (entry) { onCapture(entry); tools.onSelectTool?.('select'); }
              }).catch(() => showToast('Could not capture note region.', true));
            }}
            onCopySelectedText={(text) => { void copyTextToClipboard(text); }}
            showToast={showToast} enablePageContextMenu={false} isFlush
          />)}
          {paper && <button type="button" className="note-add-page" aria-label="Add note page"
            style={{ width: 595 * zoom, height: 842 * zoom }} onClick={onAddPage}>Add page</button>}
        </div>
      </div>
    </section>
  );
}
