import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { AnnotationCanvas } from '../annotations/AnnotationCanvas';
import { ImageOverlay } from '../annotations/ImageOverlay';
import { TextNoteOverlay } from '../annotations/TextNoteOverlay';
import { AiExplanationOverlay } from '../annotations/AiExplanationOverlay';
import { PageContextMenu } from './PageContextMenu';
import type { AiJobState } from '../../hooks/useAiExplanations';
import { usesInvertedColorSpace } from '../../lib/theme/readingTheme';
import { copyTextToClipboard, copyRegionImageToClipboard } from '../../lib/pdf/pageExtractor';
import { isAnnotationHitByEraser } from '../../lib/annotations/eraserUtils';
import {
  getAnnotationBoundingBox,
  getAnnotationCoveredText,
} from '../../lib/annotations/annotationPresentation';
import { selectFullLineAtTarget } from '../../lib/annotations/textHighlight';
import { bindTextLayerSelection } from '../../lib/pdf/pdfTextLayerManager';
import {
  AI_RESPONSE_DRAG_MIME,
  extractAiResponseDragPayload,
  setAiResponseDragDroppable,
} from '../../lib/ai/aiResponseDrag';
import 'pdfjs-dist/web/pdf_viewer.css';
import type {
  Annotation,
  AttachedImageAnnotation,
  AiExplanationAnnotation,
  HighlightStyle,
  LineHighlightStyle,
  TextNoteAnnotation,
  ReadingTheme,
  ToolType,
} from '../../lib/types/index';

interface PDFPageProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  currentTheme: ReadingTheme;
  filterClass: string;
  customFilterStyle: React.CSSProperties;
  activeTool: ToolType;
  selectedColor: string;
  highlightColors: readonly string[];
  strokeWidth: number;
  opacity: number;
  highlightStyle: HighlightStyle;
  lineHighlightStyle: LineHighlightStyle;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string | null) => void;
  onAddAnnotation: (ann: Annotation) => void;
  onUpdateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  onChangeHighlightStyle: (style: HighlightStyle) => void;
  onChangeLineHighlightStyle: (style: LineHighlightStyle) => void;
  onDeleteAnnotation: (id: string) => void;
  onImageDrop: (pageNumber: number, file: File) => void;
  onAiResponseDrop?: (
    pageNumber: number,
    x: number,
    y: number,
    prompt: string,
    response: string,
  ) => void;
  onCursorMove?: (pageNumber: number, normalizedX: number, normalizedY: number) => void;
  onCaptureSnippet?: (
    pageNumber: number,
    rect: { x: number; y: number; width: number; height: number },
  ) => void;
  aiJobs: Record<string, AiJobState>;
  onAiBoxCreated: (annotationId: string) => void;
  onSubmitAi: (annotation: AiExplanationAnnotation, prompt: string) => void;
  onCancelAi: (annotationId: string) => void;
  onCloseAi: (annotationId: string) => void;
  onAddPageBelow?: (pageNumber: number) => void;
  onDeletePage: (pageNumber: number) => void;
  onCopyPageText: (pageNumber: number) => void;
  onCopyPageImage: (pageNumber: number) => void;
  onAskAiAboutPage: (pageNumber: number) => void;
  onCopySelectedText?: (text: string) => void;
  onAttachTextToAi?: (text: string, pageNumber: number) => void;
  onHighlightSelection?: (style?: HighlightStyle, color?: string) => void;
  showToast?: (text: string, isError?: boolean) => void;
  onSelectTool?: (tool: ToolType) => void;
  isFlush?: boolean;
  isReadOnly?: boolean;
  pageIdPrefix?: string;
  enablePageContextMenu?: boolean;
  pageActionsOnly?: boolean;
}

export const PDFPageComponent: React.FC<PDFPageProps> = ({
  pdfDoc,
  pageNumber,
  scale,
  currentTheme,
  filterClass,
  customFilterStyle,
  activeTool,
  selectedColor,
  highlightColors,
  strokeWidth,
  opacity,
  highlightStyle,
  lineHighlightStyle,
  annotations,
  selectedAnnotationId,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateAnnotation,
  onChangeHighlightStyle,
  onChangeLineHighlightStyle,
  onDeleteAnnotation,
  onImageDrop,
  onAiResponseDrop,
  onCursorMove,
  onCaptureSnippet,
  aiJobs,
  onAiBoxCreated,
  onSubmitAi,
  onCancelAi,
  onCloseAi,
  onAddPageBelow,
  onDeletePage,
  onCopyPageText,
  onCopyPageImage,
  onAskAiAboutPage,
  onCopySelectedText,
  onAttachTextToAi,
  onHighlightSelection,
  showToast,
  onSelectTool,
  isFlush = false,
  isReadOnly = false,
  pageIdPrefix = 'pdf-page',
  enablePageContextMenu = true,
  pageActionsOnly = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [baseDimensions, setBaseDimensions] = useState({ width: 595, height: 842 });
  const pageDimensions = {
    width: Math.floor(baseDimensions.width * scale),
    height: Math.floor(baseDimensions.height * scale),
  };
  const [, setIsRendered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const renderTaskRef = useRef<unknown>(null);
  const unbindSelectionRef = useRef<(() => void) | null>(null);

  const [isVisible, setIsVisible] = useState(typeof IntersectionObserver === 'undefined');
  const pageProxyRef = useRef<PDFPageProxy | null>(null);
  const textContentRef = useRef<Awaited<ReturnType<PDFPageProxy['getTextContent']>> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [pdfDoc, pageNumber]);

  // Measure page dimensions quickly without full rasterization
  useEffect(() => {
    let cancelled = false;
    pdfDoc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        setBaseDimensions({
          width: baseViewport.width,
          height: baseViewport.height,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber]);

  // Two-way IntersectionObserver to mount/render near viewport and teardown offscreen pages
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsVisible(entry.isIntersecting);
        }
      },
      { rootMargin: '1000px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const releasePageResources = useCallback(() => {
    textContentRef.current = null;
    unbindSelectionRef.current?.();
    unbindSelectionRef.current = null;
    textLayerRef.current?.replaceChildren();
    if (pageProxyRef.current) {
      try {
        pageProxyRef.current.cleanup();
      } catch {}
      pageProxyRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isVisible) {
      // Release GPU canvas buffer and text layer DOM nodes when offscreen
      if (renderTaskRef.current) {
        try {
          (renderTaskRef.current as { cancel: () => void }).cancel();
        } catch {}
        renderTaskRef.current = null;
      }
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      releasePageResources();
      setIsRendered(false);
      return;
    }

    // The existing text layer keeps its spans and scales with the page via CSS until the
    // replacement is ready, so selection and search marks survive a zoom change.
    textLayerRef.current?.style.setProperty('--scale-factor', `${scale}`);

    let isCancelled = false;
    let textLayer: TextLayer | null = null;

    const renderPage = async () => {
      let buffer: HTMLCanvasElement | null = null;
      try {
        const page: PDFPageProxy = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;
        pageProxyRef.current = page;

        const baseViewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        buffer = document.createElement('canvas');
        const ctx = buffer.getContext('2d', { alpha: false });
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        let renderScale = scale * dpr;
        const maxDimension = 4096;
        const unscaledWidth = baseViewport.width / scale;
        const unscaledHeight = baseViewport.height / scale;
        if (
          unscaledWidth * renderScale > maxDimension ||
          unscaledHeight * renderScale > maxDimension
        ) {
          const capScale = Math.min(maxDimension / unscaledWidth, maxDimension / unscaledHeight);
          renderScale = Math.min(renderScale, capScale);
        }
        const scaledViewport = page.getViewport({ scale: renderScale });

        buffer.width = Math.floor(scaledViewport.width);
        buffer.height = Math.floor(scaledViewport.height);

        if (renderTaskRef.current) {
          try {
            (renderTaskRef.current as { cancel: () => void }).cancel();
          } catch {}
        }

        const renderTask = page.render({
          canvasContext: ctx,
          viewport: scaledViewport,
        });
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        if (isCancelled) return;
        canvas.width = buffer.width;
        canvas.height = buffer.height;
        canvas.getContext('2d', { alpha: false })?.drawImage(buffer, 0, 0);
        buffer.width = 0;
        buffer.height = 0;
        setIsRendered(true);

        // Render Selectable Text Layer
        const textContent = textContentRef.current ?? (await page.getTextContent());
        if (isCancelled) return;
        textContentRef.current = textContent;

        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
          const nextLayer = document.createElement('div');
          nextLayer.style.setProperty('--scale-factor', `${scale}`);

          textLayer = new TextLayer({
            textContentSource: textContent,
            container: nextLayer,
            viewport: baseViewport,
          });

          await textLayer.render();
          if (isCancelled) return;
          textLayer.textDivs.forEach((span, index) => {
            span.dataset.searchItem = String(index);
          });

          // Keep the current layer while text is selected in it; it already scales via CSS.
          const selection = window.getSelection();
          const hasSelectionHere =
            !!selection &&
            !selection.isCollapsed &&
            !!selection.anchorNode &&
            textLayerDiv.contains(selection.anchorNode);
          if (!hasSelectionHere || !unbindSelectionRef.current) {
            unbindSelectionRef.current?.();
            textLayerDiv.replaceChildren(...nextLayer.childNodes);
            unbindSelectionRef.current = bindTextLayerSelection(textLayerDiv);
          }
        }
      } catch (err: unknown) {
        if (
          !isCancelled &&
          err &&
          typeof err === 'object' &&
          'name' in err &&
          (err as { name: string }).name !== 'RenderingCancelledException'
        ) {
          console.error(`Page ${pageNumber} render error:`, err);
        }
      } finally {
        if (buffer) {
          buffer.width = 0;
          buffer.height = 0;
        }
      }
    };

    // Scale the retained canvas immediately; rasterize after the gesture settles.
    const renderTimer = window.setTimeout(renderPage, 100);

    return () => {
      isCancelled = true;
      window.clearTimeout(renderTimer);
      textLayer?.cancel();
      if (renderTaskRef.current) {
        try {
          (renderTaskRef.current as { cancel: () => void }).cancel();
        } catch {}
        renderTaskRef.current = null;
      }
      setIsRendered(false);
    };
  }, [pdfDoc, pageNumber, scale, isVisible, releasePageResources]);

  // Declared after the render effect so its render task is cancelled before page cleanup.
  // Runs on page/doc change and unmount, not on zoom.
  useEffect(() => releasePageResources, [pdfDoc, pageNumber, releasePageResources]);

  // Track cursor coordinates across the page
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !onCursorMove) return;
    const rect = containerRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min((e.clientX - rect.left) / pageDimensions.width, 1));
    const ny = Math.max(0, Math.min((e.clientY - rect.top) / pageDimensions.height, 1));
    onCursorMove(pageNumber, nx, ny);
  };

  // Handle Drag & Drop of Images directly onto this page
  const handleDragOver = (e: React.DragEvent) => {
    const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
    if (hasFiles) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
      return;
    }

    if (e.dataTransfer.types.includes(AI_RESPONSE_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setAiResponseDragDroppable(true);
      return;
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
    if (!hasFiles) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setAiResponseDragDroppable(false);

    // Dropped AI chat response from the sidebar chat → pin it on this page
    const aiResponsePayload = extractAiResponseDragPayload(e.dataTransfer);
    if (aiResponsePayload && onAiResponseDrop) {
      const rect = containerRef.current?.getBoundingClientRect();
      // Coordinates may fall outside the page (negative or > 1) so cards can live in the workspace
      const nx = rect ? (e.clientX - rect.left) / pageDimensions.width : 0.5;
      const ny = rect ? (e.clientY - rect.top) / pageDimensions.height : 0.5;
      onAiResponseDrop(pageNumber, nx, ny, aiResponsePayload.prompt, aiResponsePayload.response);
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        onImageDrop(pageNumber, file);
      }
    }
  };

  // Handle triple-click text selection across fragmented PDF.js text layer spans
  const handleTextLayerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || activeTool !== 'select') return;

    if (e.detail >= 3) {
      e.preventDefault();
      selectFullLineAtTarget(e.target as HTMLElement, textLayerRef.current, e.clientX, e.clientY);
    }
  };

  const handleTextLayerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || activeTool !== 'select') return;
    if (e.detail >= 3) {
      e.preventDefault();
      selectFullLineAtTarget(e.target as HTMLElement, textLayerRef.current, e.clientX, e.clientY);
      return;
    }

    // If click was a simple click without selecting text, check if an existing annotation was clicked
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const thisPageAnns = annotations.filter((a) => a.pageNumber === pageNumber);
        const hitAnn = [...thisPageAnns]
          .reverse()
          .find((a) =>
            isAnnotationHitByEraser(
              a,
              px,
              py,
              pageDimensions.width,
              pageDimensions.height,
              8,
              scale,
            ),
          );
        if (hitAnn) {
          e.stopPropagation();
          onSelectAnnotation(hitAnn.id);
          return;
        }
      }
    }
  };

  const pageImages = annotations.filter(
    (a) => a.pageNumber === pageNumber && a.type === 'image',
  ) as AttachedImageAnnotation[];

  const pageTextNotes = annotations.filter(
    (a) => a.pageNumber === pageNumber && a.type === 'text-note',
  ) as TextNoteAnnotation[];

  const pageAiExplanations = annotations.filter(
    (a) => a.pageNumber === pageNumber && a.type === 'ai-explanation',
  ) as AiExplanationAnnotation[];

  const [contextMenuSelectedText, setContextMenuSelectedText] = useState<string>('');
  const [contextMenuHitAnnotation, setContextMenuHitAnnotation] = useState<Annotation | null>(null);

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    setContextMenuSelectedText(text);

    let hitAnn: Annotation | null = null;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const nx = Math.max(0, Math.min(px / pageDimensions.width, 1));
      const ny = Math.max(0, Math.min(py / pageDimensions.height, 1));
      if (onCursorMove) {
        onCursorMove(pageNumber, nx, ny);
      }

      // Check annotations on this page (topmost first)
      const thisPageAnns = annotations.filter((a) => a.pageNumber === pageNumber);
      hitAnn =
        [...thisPageAnns]
          .reverse()
          .find((a) =>
            isAnnotationHitByEraser(
              a,
              px,
              py,
              pageDimensions.width,
              pageDimensions.height,
              8,
              scale,
            ),
          ) || null;
    }

    setContextMenuHitAnnotation(hitAnn);
    if (hitAnn) {
      onSelectAnnotation(hitAnn.id);
    }

    const menuWidth = 224;
    const menuHeight = pageActionsOnly ? 124 : hitAnn ? 320 : 220;
    setContextMenuPosition({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    });
  };

  const handleCopyAnnotationText = useCallback(
    async (ann: Annotation) => {
      const text = getAnnotationCoveredText(ann);
      if (!text) {
        showToast?.('No text detected under highlight', true);
        return;
      }
      const ok = await copyTextToClipboard(text);
      if (ok) {
        showToast?.('Copied highlight text to clipboard');
      } else {
        showToast?.('Failed to copy text', true);
      }
    },
    [showToast],
  );

  const handleCopyAnnotationImage = useCallback(
    async (ann: Annotation) => {
      const bounds = getAnnotationBoundingBox(ann);
      const ok = await copyRegionImageToClipboard(pageNumber, bounds, pdfDoc, pageIdPrefix);
      if (ok) {
        showToast?.('Copied highlight region as image');
      } else {
        showToast?.('Failed to copy region image', true);
      }
    },
    [pageNumber, pdfDoc, pageIdPrefix, showToast],
  );

  const handleCopySelectedText = useCallback(async () => {
    const textToCopy = contextMenuSelectedText || window.getSelection()?.toString().trim() || '';
    if (!textToCopy) return;
    if (onCopySelectedText) {
      onCopySelectedText(textToCopy);
    } else {
      await copyTextToClipboard(textToCopy);
    }
  }, [contextMenuSelectedText, onCopySelectedText]);

  return (
    <div
      ref={containerRef}
      id={`${pageIdPrefix}-${pageNumber}`}
      data-pdf-page-number={pageNumber}
      onMouseMove={isReadOnly ? undefined : handleMouseMove}
      onDragOver={isReadOnly ? undefined : handleDragOver}
      onDragLeave={isReadOnly ? undefined : handleDragLeave}
      onDrop={isReadOnly ? undefined : handleDrop}
      onContextMenu={isReadOnly || !enablePageContextMenu ? undefined : handleContextMenu}
      onClick={isReadOnly ? undefined : () => onSelectAnnotation(null)}
      style={{
        width: `${pageDimensions.width}px`,
        height: `${pageDimensions.height}px`,
      }}
      className={`relative mx-auto ${isFlush ? 'my-1' : 'my-4'} group rounded-xs bg-white shadow-[0_1px_8px_rgba(0,0,0,0.22),0_1px_2px_rgba(0,0,0,0.14)] transition-shadow duration-150 ${
        isDragOver ? 'scale-[1.01] ring-2 ring-[#0080f0]' : ''
      }`}
    >
      {!isReadOnly && enablePageContextMenu && contextMenuPosition && (
        <PageContextMenu
          pageActionsOnly={pageActionsOnly}
          position={contextMenuPosition}
          hasSelectedText={Boolean(
            contextMenuSelectedText || window.getSelection()?.toString().trim(),
          )}
          hitAnnotation={contextMenuHitAnnotation}
          onCopyAnnotationText={handleCopyAnnotationText}
          onCopyAnnotationImage={handleCopyAnnotationImage}
          onDeleteAnnotation={onDeleteAnnotation}
          onClose={() => setContextMenuPosition(null)}
          onCopySelectedText={handleCopySelectedText}
          onAddPageBelow={() => onAddPageBelow?.(pageNumber)}
          onDeletePage={() => onDeletePage(pageNumber)}
          onCopyPageText={() => onCopyPageText(pageNumber)}
          onCopyPageImage={() => onCopyPageImage(pageNumber)}
          onAskAi={() => onAskAiAboutPage(pageNumber)}
          onAttachTextToAi={
            onAttachTextToAi ? (text) => onAttachTextToAi(text, pageNumber) : undefined
          }
          onHighlightSelectedText={
            onHighlightSelection ? () => onHighlightSelection('box') : undefined
          }
          onUnderlineSelectedText={
            onHighlightSelection ? () => onHighlightSelection('underline') : undefined
          }
        />
      )}
      {/* Visual Page Number Badge in Margin */}
      {!isFlush && (
        <div className="absolute -top-5 left-1 font-mono text-[10px] font-medium tracking-wider text-zinc-500 select-none">
          PAGE {pageNumber}
        </div>
      )}

      {/* Filtered Container for PDF Canvas & Color Inversion */}
      <div
        data-pdf-canvas-layer
        className={`relative h-full w-full overflow-hidden ${filterClass}`}
        style={customFilterStyle}
      >
        {/* Rendered PDF Raster Canvas */}
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>

      {/* Keep selection feedback outside page filters so it stays visibly blue in every reading theme. */}
      <div
        ref={textLayerRef}
        data-pdf-text-layer
        onMouseDown={handleTextLayerMouseDown}
        onClick={handleTextLayerClick}
        className={`textLayer absolute inset-0 z-10 overflow-hidden leading-none ${
          activeTool === 'select'
            ? 'pointer-events-auto cursor-text select-text'
            : 'pointer-events-none select-none'
        }`}
        style={{
          width: `${pageDimensions.width}px`,
          height: `${pageDimensions.height}px`,
        }}
      />

      {/* Keep rich overlays as lazy as the PDF canvas, retaining any active edit/drag. */}
      {(isVisible || annotations.some((annotation) => annotation.id === selectedAnnotationId)) && (
        <>
          {/* Annotation Canvas (SVG / Freehand / Highlights / Note Creator) */}
          {!isReadOnly && (
            <AnnotationCanvas
              pageIdPrefix={pageIdPrefix}
              pageNumber={pageNumber}
              pageWidth={pageDimensions.width}
              pageHeight={pageDimensions.height}
              scale={scale}
              activeTool={activeTool}
              selectedColor={selectedColor}
              highlightColors={highlightColors}
              isInvertedColorMode={usesInvertedColorSpace(currentTheme)}
              strokeWidth={strokeWidth}
              opacity={opacity}
              highlightStyle={highlightStyle}
              lineHighlightStyle={lineHighlightStyle}
              annotations={annotations}
              selectedAnnotationId={selectedAnnotationId}
              onSelectAnnotation={onSelectAnnotation}
              onUpdateAnnotation={onUpdateAnnotation}
              onChangeHighlightStyle={onChangeHighlightStyle}
              onChangeLineHighlightStyle={onChangeLineHighlightStyle}
              onAddAnnotation={onAddAnnotation}
              onDeleteAnnotation={onDeleteAnnotation}
              onCaptureSnippet={onCaptureSnippet}
              onAiBoxCreated={onAiBoxCreated}
              onSelectTool={onSelectTool}
            />
          )}

          {!isReadOnly && (
            <AiExplanationOverlay
              pdfDoc={pdfDoc}
              pageWidth={pageDimensions.width}
              pageHeight={pageDimensions.height}
              activeTool={activeTool}
              annotations={pageAiExplanations}
              jobs={aiJobs}
              onSubmit={onSubmitAi}
              onCancel={onCancelAi}
              onCloseJob={onCloseAi}
              onUpdate={onUpdateAnnotation}
              onDelete={onDeleteAnnotation}
              onAddAnnotation={onAddAnnotation}
              selectedAnnotationId={selectedAnnotationId}
              onSelectAnnotation={onSelectAnnotation}
              onSelectTool={onSelectTool}
            />
          )}

          {/* Attached Images Layer */}
          {pageImages.map((imgAnn) => (
            <ImageOverlay
              key={imgAnn.id}
              annotation={imgAnn}
              isSelected={selectedAnnotationId === imgAnn.id}
              pageWidth={pageDimensions.width}
              pageHeight={pageDimensions.height}
              currentTheme={currentTheme}
              activeTool={activeTool}
              onSelect={onSelectAnnotation}
              onUpdate={onUpdateAnnotation}
              onDelete={onDeleteAnnotation}
              onSelectTool={onSelectTool}
            />
          ))}

          {/* Interactive Text Notes Layer */}
          {pageTextNotes.map((noteAnn) => (
            <TextNoteOverlay
              key={noteAnn.id}
              annotation={noteAnn}
              isSelected={selectedAnnotationId === noteAnn.id}
              pageWidth={pageDimensions.width}
              pageHeight={pageDimensions.height}
              scale={scale}
              currentTheme={currentTheme}
              activeTool={activeTool}
              highlightColors={highlightColors}
              onSelect={onSelectAnnotation}
              onUpdate={onUpdateAnnotation}
              onDelete={onDeleteAnnotation}
              onSelectTool={onSelectTool}
            />
          ))}
        </>
      )}
      {/* Drop Image Overlay Visual Cue */}
      {!isReadOnly && isDragOver && (
        <div className="animate-fade-in pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center rounded border-2 border-dashed border-[#0080f0] bg-[#0080f0]/20 text-blue-200 backdrop-blur-xs">
          <span className="text-sm font-semibold text-white">Drop Image to Attach</span>
          <span className="text-xs text-blue-200">Will be placed on Page {pageNumber}</span>
        </div>
      )}
    </div>
  );
};

export const PDFPage = React.memo(PDFPageComponent);
