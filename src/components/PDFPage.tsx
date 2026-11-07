import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { AnnotationCanvas } from './AnnotationCanvas';
import { ImageOverlay } from './ImageOverlay';
import { TextNoteOverlay } from './TextNoteOverlay';
import { AiExplanationOverlay } from './AiExplanationOverlay';
import { PageContextMenu } from './PageContextMenu';
import type { AiJobState } from '../hooks/useAiExplanations';
import { usesInvertedColorSpace } from '../utils/readingTheme';
import { copyTextToClipboard, copyRegionImageToClipboard } from '../utils/pageExtractor';
import { isAnnotationHitByEraser } from '../utils/eraserUtils';
import { getAnnotationBoundingBox, getAnnotationCoveredText } from '../utils/annotationPresentation';
import { selectFullLineAtTarget } from '../utils/textHighlight';
import { bindTextLayerSelection } from '../utils/pdfTextLayerManager';
import { AI_RESPONSE_DRAG_MIME, extractAiResponseDragPayload, setAiResponseDragDroppable } from '../utils/aiResponseDrag';
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
} from '../utils/types';

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
  onAiResponseDrop?: (pageNumber: number, x: number, y: number, prompt: string, response: string) => void;
  onCursorMove?: (pageNumber: number, normalizedX: number, normalizedY: number) => void;
  onCaptureSnippet?: (pageNumber: number, rect: { x: number; y: number; width: number; height: number }) => void;
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }>({
    width: Math.floor(595 * scale),
    height: Math.floor(842 * scale),
  });
  const [isRendered, setIsRendered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const renderTaskRef = useRef<unknown>(null);
  const unbindSelectionRef = useRef<(() => void) | null>(null);

  const [isVisible, setIsVisible] = useState(
    typeof IntersectionObserver === 'undefined'
  );
  const pageProxyRef = useRef<PDFPageProxy | null>(null);

  // Measure page dimensions quickly without full rasterization
  useEffect(() => {
    let cancelled = false;
    pdfDoc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale });
        setPageDimensions({
          width: Math.floor(baseViewport.width),
          height: Math.floor(baseViewport.height),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber, scale]);

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
      { rootMargin: '1000px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) {
      // Release GPU canvas buffer, text layer DOM nodes, and PDF.js page resources when offscreen
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
      const textLayerDiv = textLayerRef.current;
      if (textLayerDiv) {
        textLayerDiv.innerHTML = '';
      }
      if (pageProxyRef.current) {
        try {
          pageProxyRef.current.cleanup();
        } catch {}
        pageProxyRef.current = null;
      }
      setIsRendered(false);
      return;
    }

    let isCancelled = false;

    const renderPage = async () => {
      try {
        const page: PDFPageProxy = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;
        pageProxyRef.current = page;

        const baseViewport = page.getViewport({ scale });
        setPageDimensions({
          width: Math.floor(baseViewport.width),
          height: Math.floor(baseViewport.height),
        });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        let renderScale = scale * dpr;
        const maxDimension = 4096;
        const unscaledWidth = baseViewport.width / scale;
        const unscaledHeight = baseViewport.height / scale;
        if (unscaledWidth * renderScale > maxDimension || unscaledHeight * renderScale > maxDimension) {
          const capScale = Math.min(maxDimension / unscaledWidth, maxDimension / unscaledHeight);
          renderScale = Math.min(renderScale, capScale);
        }
        const scaledViewport = page.getViewport({ scale: renderScale });

        canvas.width = Math.floor(scaledViewport.width);
        canvas.height = Math.floor(scaledViewport.height);
        canvas.style.width = `${Math.floor(baseViewport.width)}px`;
        canvas.style.height = `${Math.floor(baseViewport.height)}px`;

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
        setIsRendered(true);

        // Render Selectable Text Layer
        const textContent = await page.getTextContent();
        if (isCancelled) return;

        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
          textLayerDiv.innerHTML = '';
          textLayerDiv.style.setProperty('--scale-factor', `${scale}`);

          const textLayer = new TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: baseViewport,
          });

          await textLayer.render();
          if (isCancelled) return;

          unbindSelectionRef.current?.();
          unbindSelectionRef.current = bindTextLayerSelection(textLayerDiv);
        }
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNumber} render error:`, err);
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      unbindSelectionRef.current?.();
      unbindSelectionRef.current = null;
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
      const textLayerDiv = textLayerRef.current;
      if (textLayerDiv) {
        textLayerDiv.innerHTML = '';
      }
      if (pageProxyRef.current) {
        try {
          pageProxyRef.current.cleanup();
        } catch {}
        pageProxyRef.current = null;
      }
      setIsRendered(false);
    };
  }, [pdfDoc, pageNumber, scale, isVisible]);

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
      e.stopPropagation();
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
      selectFullLineAtTarget(
        e.target as HTMLElement,
        textLayerRef.current,
        e.clientX,
        e.clientY
      );
    }
  };

  const handleTextLayerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || activeTool !== 'select') return;
    if (e.detail >= 3) {
      e.preventDefault();
      selectFullLineAtTarget(
        e.target as HTMLElement,
        textLayerRef.current,
        e.clientX,
        e.clientY
      );
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
        const hitAnn = [...thisPageAnns].reverse().find((a) =>
          isAnnotationHitByEraser(a, px, py, pageDimensions.width, pageDimensions.height, 8, scale)
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
    (a) => a.pageNumber === pageNumber && a.type === 'image'
  ) as AttachedImageAnnotation[];

  const pageTextNotes = annotations.filter(
    (a) => a.pageNumber === pageNumber && a.type === 'text-note'
  ) as TextNoteAnnotation[];

  const pageAiExplanations = annotations.filter(
    (a) => a.pageNumber === pageNumber && a.type === 'ai-explanation'
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
        [...thisPageAnns].reverse().find((a) =>
          isAnnotationHitByEraser(a, px, py, pageDimensions.width, pageDimensions.height, 8, scale)
        ) || null;
    }

    setContextMenuHitAnnotation(hitAnn);
    if (hitAnn) {
      onSelectAnnotation(hitAnn.id);
    }

    const menuWidth = 224;
    const menuHeight = hitAnn ? 320 : 220;
    setContextMenuPosition({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    });
  };

  const handleCopyAnnotationText = useCallback(async (ann: Annotation) => {
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
  }, [showToast]);

  const handleCopyAnnotationImage = useCallback(async (ann: Annotation) => {
    const bounds = getAnnotationBoundingBox(ann);
    const ok = await copyRegionImageToClipboard(pageNumber, bounds, pdfDoc, pageIdPrefix);
    if (ok) {
      showToast?.('Copied highlight region as image');
    } else {
      showToast?.('Failed to copy region image', true);
    }
  }, [pageNumber, pdfDoc, pageIdPrefix, showToast]);

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
      onContextMenu={isReadOnly ? undefined : handleContextMenu}
      onClick={isReadOnly ? undefined : () => onSelectAnnotation(null)}
      style={{
        width: `${pageDimensions.width}px`,
        height: `${pageDimensions.height}px`,
      }}
      className={`relative mx-auto ${isFlush ? 'my-1' : 'my-4'} bg-white shadow-[0_1px_8px_rgba(0,0,0,0.22),0_1px_2px_rgba(0,0,0,0.14)] rounded-xs transition-all duration-150 group ${
        isDragOver ? 'ring-2 ring-[#0080f0] scale-[1.01]' : ''
      }`}
    >
      {!isReadOnly && contextMenuPosition && (
        <PageContextMenu
          position={contextMenuPosition}
          hasSelectedText={Boolean(contextMenuSelectedText || window.getSelection()?.toString().trim())}
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
          onAttachTextToAi={onAttachTextToAi ? (text) => onAttachTextToAi(text, pageNumber) : undefined}
          onHighlightSelectedText={onHighlightSelection ? () => onHighlightSelection('box') : undefined}
          onUnderlineSelectedText={onHighlightSelection ? () => onHighlightSelection('underline') : undefined}
        />
      )}
      {/* Visual Page Number Badge in Margin */}
      {!isFlush && (
        <div className="absolute -top-5 left-1 text-[10px] font-mono text-zinc-500 font-medium select-none tracking-wider">
          PAGE {pageNumber}
        </div>
      )}

      {/* Filtered Container for PDF Canvas & Color Inversion */}
      <div
        data-pdf-canvas-layer
        className={`w-full h-full relative overflow-hidden ${filterClass}`}
        style={customFilterStyle}
      >
        {/* Rendered PDF Raster Canvas */}
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>

      {/* Keep selection feedback outside page filters so it stays visibly blue in every reading theme. */}
      <div
        ref={textLayerRef}
        data-pdf-text-layer
        onMouseDown={handleTextLayerMouseDown}
        onClick={handleTextLayerClick}
        className={`textLayer absolute inset-0 overflow-hidden leading-none z-10 ${
          activeTool === 'select'
            ? 'select-text pointer-events-auto cursor-text'
            : 'select-none pointer-events-none'
        }`}
        style={{
          width: `${pageDimensions.width}px`,
          height: `${pageDimensions.height}px`,
        }}
      />

      {/* Annotation Canvas (SVG / Freehand / Highlights / Note Creator) */}
      {!isReadOnly && <AnnotationCanvas
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
      />}

      {!isReadOnly && <AiExplanationOverlay
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
      />}

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

      {/* Drop Image Overlay Visual Cue */}
      {!isReadOnly && isDragOver && (
        <div className="absolute inset-0 bg-[#0080f0]/20 backdrop-blur-xs border-2 border-dashed border-[#0080f0] flex flex-col items-center justify-center text-blue-200 z-50 rounded animate-fade-in pointer-events-none">
          <span className="text-sm font-semibold text-white">Drop Image to Attach</span>
          <span className="text-xs text-blue-200">Will be placed on Page {pageNumber}</span>
        </div>
      )}
    </div>
  );
};

export const PDFPage = React.memo(PDFPageComponent);
