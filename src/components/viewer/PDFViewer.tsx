import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useViewportZoom, type ZoomStepRequest } from '../../hooks/useViewportZoom';
import { centerPageInViewport, fitPageWidthZoom, fitPageZoom } from '../../lib/pdf/fitViewport';
import { PDFPage } from './PDFPage';
import { SplitDivider } from '../ui/SplitDivider';
import { UploadCloud } from 'lucide-react';
import type {
  Annotation,
  HighlightStyle,
  LineHighlightStyle,
  ReadingTheme,
  TextNoteAnnotation,
  ToolType,
  ViewMode,
} from '../../lib/types/index';
import type { AiExplanationAnnotation } from '../../lib/types/index';
import type { AiJobState } from '../../hooks/useAiExplanations';
import { findFocalPageNumber, shouldRestoreViewerPosition } from '../../lib/pdf/viewerPosition';
import {
  AI_RESPONSE_DRAG_MIME,
  extractAiResponseDragPayload,
  setAiResponseDragDroppable,
  getActiveAiResponseDrag,
} from '../../lib/ai/aiResponseDrag';
import { isAnnotationHitByEraser } from '../../lib/annotations/eraserUtils';
import { getReadTogetherPageRows } from '../../lib/pdf/readTogether';
import type { SearchMatch } from '../../lib/types';
import { getSearchMatchRange } from '../../lib/pdf/search';
import { normalizeSelectionRects } from '../../lib/annotations/textHighlight';

const EMPTY_ANNOTATIONS: Annotation[] = [];

const getFocalPageInContainer = (container: HTMLElement, fallbackPage: number) => {
  const containerRect = container.getBoundingClientRect();
  const pages = Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-page-number]'))
    .map((element) => {
      const pageNumber = Number(element.getAttribute('data-pdf-page-number'));
      const rect = element.getBoundingClientRect();
      return { pageNumber, top: rect.top, bottom: rect.bottom };
    })
    .filter((page) => page.pageNumber > 0);

  return findFocalPageNumber(containerRect.top, containerRect.height, pages, fallbackPage);
};

interface PDFViewerProps {
  pdfDoc: PDFDocumentProxy | null;
  companionPdfDoc?: PDFDocumentProxy | null;
  companionContent?: React.ReactNode;
  primaryFileName?: string;
  companionFileName?: string | null;
  companionCurrentPage?: number;
  companionZoom?: number;
  activePane?: 'primary' | 'companion';
  currentPage: number;
  numPages: number;
  pageNavRequest?: { page: number; timestamp: number } | null;
  searchMatch?: SearchMatch | null;
  zoom: number;
  viewMode: ViewMode;
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
  onPageChange: (newPage: number) => void;
  onCompanionPageChange?: (newPage: number) => void;
  onCompanionZoomChange?: (newZoom: number) => void;
  onActivePaneChange?: (pane: 'primary' | 'companion') => void;
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
  onPdfFileDrop: (file: File) => void;
  onOpenPdfClick: () => void;
  onChangeZoom: (newZoom: number) => void;
  fitPageRequest?: { id: number; page: number; fit?: 'page' | 'width' } | null;
  zoomStepRequest?: ZoomStepRequest | null;
  companionFitRequest?: { id: number } | null;
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
}

export const PDFViewer: React.FC<PDFViewerProps> = ({
  pdfDoc,
  companionPdfDoc = null,
  companionContent,
  primaryFileName = 'Primary PDF',
  companionFileName = null,
  companionCurrentPage = 1,
  companionZoom = 1.15,
  activePane = 'primary',
  currentPage,
  numPages,
  pageNavRequest,
  searchMatch,
  zoom,
  viewMode,
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
  onPageChange,
  onCompanionPageChange,
  onCompanionZoomChange,
  onActivePaneChange,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateAnnotation,
  onChangeHighlightStyle,
  onChangeLineHighlightStyle,
  onDeleteAnnotation,
  onImageDrop,
  onAiResponseDrop,
  onPdfFileDrop,
  onOpenPdfClick,
  onChangeZoom,
  fitPageRequest,
  zoomStepRequest,
  companionFitRequest,
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
}) => {
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  const hasReadingSplit = Boolean(companionPdfDoc || companionContent);
  const companionContainerRef = useRef<HTMLDivElement | null>(null);
  const [split, setSplit] = useState(0.5);
  const [isViewerDraggingFile, setIsViewerDraggingFile] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  // Programmatic scroll flags to eliminate feedback loops between scroll events and onPageChange
  const isProgrammaticScrollRef = useRef(false);
  const programmaticScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPageRef = useRef<number>(currentPage);
  currentPageRef.current = currentPage;
  const lastReportedPageRef = useRef<number>(currentPage);
  const companionLastReportedPageRef = useRef<number>(companionCurrentPage);
  const companionProgrammaticScrollRef = useRef(false);
  const companionProgrammaticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNavTimestampRef = useRef<number>(0);
  const prevDocRef = useRef<PDFDocumentProxy | null>(null);
  const prevViewModeRef = useRef<ViewMode>(viewMode);
  const prevSplitRef = useRef(hasReadingSplit);
  const prevPropCurrentPageRef = useRef<number>(currentPage);
  const lastFitPageRequestRef = useRef(0);
  const pendingFitScrollPageRef = useRef<number | null>(null);
  const pendingFitVerticalRef = useRef<'center' | 'start'>('center');
  const fitCenteringCleanupRef = useRef<(() => void) | null>(null);
  const lastCompanionFit = useRef<number | null>(null);
  const pendingCompanionFit = useRef<{ page: number; zoom: number } | null>(null);
  const fitInteraction = useRef(0);

  const [viewerAiDragPos, setViewerAiDragPos] = useState<{
    clientX: number;
    clientY: number;
  } | null>(null);

  // Clear drag affordance state when a drag ends or is cancelled anywhere (including outside the viewer)
  useEffect(() => {
    const clearDragState = () => {
      setIsViewerDraggingFile(false);
      setAiResponseDragDroppable(false);
      setViewerAiDragPos(null);
    };
    window.addEventListener('dragend', clearDragState);
    window.addEventListener('drop', clearDragState, true);
    return () => {
      window.removeEventListener('dragend', clearDragState);
      window.removeEventListener('drop', clearDragState, true);
    };
  }, []);

  useEffect(
    () => () => {
      if (companionProgrammaticTimerRef.current) {
        clearTimeout(companionProgrammaticTimerRef.current);
      }
      fitCenteringCleanupRef.current?.();
    },
    [],
  );

  const prevAnnotationsByPageRef = useRef<Map<number, Annotation[]>>(new Map());

  const annotationsByPage = React.useMemo(() => {
    const nextMap = new Map<number, Annotation[]>();
    for (const ann of annotations) {
      const list = nextMap.get(ann.pageNumber);
      if (list) {
        list.push(ann);
      } else {
        nextMap.set(ann.pageNumber, [ann]);
      }
    }

    const prevMap = prevAnnotationsByPageRef.current;
    const stableMap = new Map<number, Annotation[]>();

    for (const [pageNum, nextList] of nextMap.entries()) {
      const prevList = prevMap.get(pageNum);
      if (
        prevList &&
        prevList.length === nextList.length &&
        prevList.every((ann, i) => ann === nextList[i])
      ) {
        stableMap.set(pageNum, prevList);
      } else {
        stableMap.set(pageNum, nextList);
      }
    }

    prevAnnotationsByPageRef.current = stableMap;
    return stableMap;
  }, [annotations]);

  // Global Eraser Tool State & Cross-Page Sweeping
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null);
  const isErasingRef = useRef(false);

  const performGlobalEraseAt = useCallback(
    (clientX: number, clientY: number) => {
      const container = viewerContainerRef.current;
      if (!container) return;

      const ERASE_RADIUS = 22;
      const pageElements = container.querySelectorAll<HTMLElement>('[data-pdf-page-number]');

      pageElements.forEach((pageEl) => {
        const rect = pageEl.getBoundingClientRect();
        if (
          clientX + ERASE_RADIUS >= rect.left &&
          clientX - ERASE_RADIUS <= rect.right &&
          clientY + ERASE_RADIUS >= rect.top &&
          clientY - ERASE_RADIUS <= rect.bottom
        ) {
          const pageNumber = Number(pageEl.getAttribute('data-pdf-page-number'));
          const pageWidth = rect.width;
          const pageHeight = rect.height;
          const px = clientX - rect.left;
          const py = clientY - rect.top;

          const pageAnns = annotationsByPage.get(pageNumber) || EMPTY_ANNOTATIONS;
          for (const ann of pageAnns) {
            if (isAnnotationHitByEraser(ann, px, py, pageWidth, pageHeight, ERASE_RADIUS, zoom)) {
              onDeleteAnnotation(ann.id);
            }
          }
        }
      });
    },
    [annotationsByPage, onDeleteAnnotation, zoom],
  );

  useEffect(() => {
    if (activeTool !== 'eraser') {
      setEraserPos(null);
      isErasingRef.current = false;
      return;
    }

    const handleGlobalPointerUp = () => {
      if (isErasingRef.current) {
        isErasingRef.current = false;
        onSelectTool?.('select');
      }
    };

    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (isErasingRef.current) {
        setEraserPos({ x: e.clientX, y: e.clientY });
        performGlobalEraseAt(e.clientX, e.clientY);
      }
    };

    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    window.addEventListener('pointermove', handleGlobalPointerMove);

    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
      window.removeEventListener('pointermove', handleGlobalPointerMove);
    };
  }, [activeTool, performGlobalEraseAt, onSelectTool]);

  // Track Spacebar for Space+Drag Panning (Hand Tool mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !e.repeat &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !(document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable)
      ) {
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Smooth & deterministic scroll-to-page without touching scrollLeft
  const scrollToPage = useCallback(
    (targetPage: number, behavior: ScrollBehavior = 'smooth') => {
      const container = viewerContainerRef.current;
      if (!container || !pdfDoc || targetPage < 1 || targetPage > numPages) return;

      if (viewMode === 'continuous') {
        const pageEl = document.getElementById(`pdf-page-${targetPage}`);
        if (!pageEl) return;

        // Suppress intermediate scroll event page changes during smooth programmatic transition
        isProgrammaticScrollRef.current = true;
        if (programmaticScrollTimerRef.current) {
          clearTimeout(programmaticScrollTimerRef.current);
        }
        programmaticScrollTimerRef.current = setTimeout(
          () => {
            isProgrammaticScrollRef.current = false;
            lastReportedPageRef.current = targetPage;
          },
          behavior === 'smooth' ? 600 : 80,
        );

        const targetRect = pageEl.getBoundingClientRect();
        const contRect = container.getBoundingClientRect();
        const targetScrollTop = container.scrollTop + (targetRect.top - contRect.top) - 16;

        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior,
        });
        lastReportedPageRef.current = targetPage;
      } else {
        container.scrollTo({ top: 0, behavior: 'instant' });
        lastReportedPageRef.current = targetPage;
      }
    },
    [pdfDoc, numPages, viewMode],
  );

  const centerFittedPage = useCallback(
    (pageNumber: number, followResize = false, vertical: 'center' | 'start' = 'center') => {
      fitCenteringCleanupRef.current?.();
      fitCenteringCleanupRef.current = null;

      const center = () => {
        if (panStartRef.current) return;
        const container = viewerContainerRef.current;
        const page = document.getElementById(`pdf-page-${pageNumber}`);
        if (!container || !page) return;

        isProgrammaticScrollRef.current = true;
        if (programmaticScrollTimerRef.current) {
          clearTimeout(programmaticScrollTimerRef.current);
        }
        programmaticScrollTimerRef.current = setTimeout(() => {
          isProgrammaticScrollRef.current = false;
          lastReportedPageRef.current = pageNumber;
        }, 80);

        centerPageInViewport(container, page, vertical);
        lastReportedPageRef.current = pageNumber;
      };

      requestAnimationFrame(center);

      // PDFPage learns its real dimensions asynchronously from PDF.js. Keep the
      // target centered while that one layout update lands, rather than allowing
      // the newly-sized pages above it to push the reader back through the file.
      if (!followResize || typeof ResizeObserver === 'undefined') return;

      const page = document.getElementById(`pdf-page-${pageNumber}`);
      if (!page) return;

      let animationFrame: number | null = null;
      const observer = new ResizeObserver(() => {
        if (animationFrame !== null) return;
        animationFrame = requestAnimationFrame(() => {
          animationFrame = null;
          center();
        });
      });
      observer.observe(page);

      const settleTimer = setTimeout(() => {
        if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        observer.disconnect();
        fitCenteringCleanupRef.current = null;
        requestAnimationFrame(center);
      }, 750);
      fitCenteringCleanupRef.current = () => {
        if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        clearTimeout(settleTimer);
        observer.disconnect();
      };
    },
    [],
  );

  // Initial horizontal centering & initial page restore on document load or viewMode switch
  useEffect(() => {
    const isNewDoc = pdfDoc !== prevDocRef.current;
    const isNewMode =
      viewMode !== prevViewModeRef.current || hasReadingSplit !== prevSplitRef.current;
    prevSplitRef.current = hasReadingSplit;
    prevDocRef.current = pdfDoc;
    prevViewModeRef.current = viewMode;

    if (
      shouldRestoreViewerPosition(Boolean(pdfDoc), isNewDoc, isNewMode) &&
      viewerContainerRef.current
    ) {
      fitCenteringCleanupRef.current?.();
      fitCenteringCleanupRef.current = null;
      const container = viewerContainerRef.current;
      const centerAndRestore = () => {
        const centerScrollLeft = (container.scrollWidth - container.clientWidth) / 2;
        if (centerScrollLeft > 0) {
          container.scrollLeft = centerScrollLeft;
        }

        if (isNewDoc || isNewMode) {
          const targetPage = currentPageRef.current;
          if (targetPage > 1) {
            scrollToPage(targetPage, 'instant');
          }
        }
      };

      requestAnimationFrame(centerAndRestore);
      const timer = setTimeout(centerAndRestore, 120);
      return () => clearTimeout(timer);
    }
  }, [pdfDoc, viewMode, scrollToPage, hasReadingSplit]);

  // Prevent unintended page shifts and false scroll events during window resize or fullscreen transition
  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let preResizeOffset: number | null = null;
    let anchorPage: number = lastReportedPageRef.current;

    const handleResize = () => {
      isProgrammaticScrollRef.current = true;
      companionProgrammaticScrollRef.current = true;

      const container = viewerContainerRef.current;
      if (container && preResizeOffset === null && viewMode === 'continuous') {
        anchorPage = getFocalPageInContainer(container, lastReportedPageRef.current);
        lastReportedPageRef.current = anchorPage;
        const pageEl = document.getElementById(`pdf-page-${anchorPage}`);
        if (pageEl) {
          preResizeOffset =
            pageEl.getBoundingClientRect().top - container.getBoundingClientRect().top;
        }
      }

      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const currentContainer = viewerContainerRef.current;
        if (currentContainer && preResizeOffset !== null && viewMode === 'continuous') {
          const pageEl = document.getElementById(`pdf-page-${anchorPage}`);
          if (pageEl) {
            const currentOffset =
              pageEl.getBoundingClientRect().top - currentContainer.getBoundingClientRect().top;
            const delta = currentOffset - preResizeOffset;
            if (Math.abs(delta) > 1) {
              currentContainer.scrollTop += delta;
            }
          }
        }
        preResizeOffset = null;
        isProgrammaticScrollRef.current = false;
        companionProgrammaticScrollRef.current = false;
      }, 450);
    };

    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [viewMode]);

  // Handle explicit page jump requests (from sidebar thumbnail click, outline click, search result click, etc.)
  useEffect(() => {
    if (pageNavRequest && pageNavRequest.timestamp !== lastNavTimestampRef.current) {
      lastNavTimestampRef.current = pageNavRequest.timestamp;
      scrollToPage(pageNavRequest.page, 'smooth');
    }
  }, [pageNavRequest, scrollToPage]);

  // Handle external currentPage prop changes in single/spread view modes
  useEffect(() => {
    if (currentPage !== prevPropCurrentPageRef.current) {
      prevPropCurrentPageRef.current = currentPage;
      if (viewMode !== 'continuous' && currentPage !== lastReportedPageRef.current) {
        lastReportedPageRef.current = currentPage;
        const container = viewerContainerRef.current;
        if (container) {
          container.scrollTo({ top: 0, behavior: 'instant' });
        }
      }
    }
  }, [currentPage, viewMode]);

  // First reveal the lazy page, then center the exact text once its layer is ready.
  useEffect(() => {
    const container = viewerContainerRef.current;
    if (!container || !searchMatch) return;
    scrollToPage(searchMatch.pageNumber, 'instant');
    let navigated = false;
    const marks: HTMLElement[] = [];
    const reveal = () => {
      const page = container.querySelector<HTMLElement>(`#pdf-page-${searchMatch.pageNumber}`);
      if (!page) return;
      const range = getSearchMatchRange(page, searchMatch);
      if (!range) return;
      const pageRect = page.getBoundingClientRect();
      const rects = normalizeSelectionRects(Array.from(range.getClientRects()), pageRect);
      if (!rects.length) return;
      marks.splice(0).forEach((mark) => mark.remove());
      for (const rect of rects) {
        const mark = document.createElement('div');
        mark.className = 'pdf-search-match';
        Object.assign(mark.style, {
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.width * 100}%`,
          height: `${rect.height * 100}%`,
        });
        page.appendChild(mark);
        marks.push(mark);
      }
      if (!navigated) {
        navigated = true;
        const target = range.getBoundingClientRect();
        const viewport = container.getBoundingClientRect();
        isProgrammaticScrollRef.current = true;
        lastReportedPageRef.current = searchMatch.pageNumber;
        container.scrollTo({
          top:
            container.scrollTop +
            target.top -
            viewport.top -
            (container.clientHeight - target.height) / 2,
          left:
            container.scrollLeft +
            target.left -
            viewport.left -
            (container.clientWidth - target.width) / 2,
          behavior: 'instant',
        });
        if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);
        programmaticScrollTimerRef.current = setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 150);
      }
    };
    // Observe only text changes; search marks themselves must not retrigger this.
    const observer = new MutationObserver((records) => {
      if (records.some((record) => (record.target as Element).closest?.('[data-pdf-text-layer]')))
        reveal();
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-search-item'],
    });
    const resize = new ResizeObserver(reveal);
    const targetPage = container.querySelector(`#pdf-page-${searchMatch.pageNumber}`);
    if (targetPage) resize.observe(targetPage);
    const frame = requestAnimationFrame(reveal);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      marks.forEach((mark) => mark.remove());
    };
  }, [searchMatch, pdfDoc, viewMode, zoom, scrollToPage, hasReadingSplit]);

  // Fit the active page inside the available viewport, then bring it into view.
  useEffect(() => {
    const container = viewerContainerRef.current;
    if (
      !fitPageRequest ||
      fitPageRequest.id === lastFitPageRequestRef.current ||
      !pdfDoc ||
      !container
    ) {
      return;
    }

    // The toolbar's current-page prop can trail the scroll position by a render.
    // Fit the page visibly being read, then center that same page after scaling.
    const targetPage =
      viewMode === 'continuous'
        ? getFocalPageInContainer(container, lastReportedPageRef.current)
        : fitPageRequest.page;
    lastFitPageRequestRef.current = fitPageRequest.id;
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) {
      clearTimeout(programmaticScrollTimerRef.current);
    }
    lastReportedPageRef.current = targetPage;

    let cancelled = false;
    const interaction = fitInteraction.current;
    void pdfDoc.getPage(targetPage).then((page) => {
      if (cancelled || interaction !== fitInteraction.current) return;

      const viewport = page.getViewport({ scale: 1 });
      const fitWidth = fitPageRequest.fit === 'width';
      const vertical = fitWidth ? 'start' : 'center';
      const roundedZoom = fitWidth
        ? fitPageWidthZoom(container.clientWidth, viewport.width)
        : fitPageZoom(
            container.clientWidth,
            container.clientHeight,
            viewport.width,
            viewport.height,
          );
      if (roundedZoom === zoom) {
        centerFittedPage(targetPage, true, vertical);
      } else {
        pendingFitScrollPageRef.current = targetPage;
        pendingFitVerticalRef.current = vertical;
        onChangeZoom(roundedZoom);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [centerFittedPage, fitPageRequest, onChangeZoom, pdfDoc, zoom, viewMode, hasReadingSplit]);

  // A fit action must scroll after the zoom effect has finished preserving the focal point.
  useEffect(() => {
    const container = companionContainerRef.current;
    if (
      !companionFitRequest ||
      lastCompanionFit.current === companionFitRequest.id ||
      !container ||
      !companionPdfDoc ||
      !onCompanionZoomChange
    )
      return;
    lastCompanionFit.current = companionFitRequest.id;
    const pageNumber = getFocalPageInContainer(container, companionLastReportedPageRef.current);
    let cancelled = false;
    const interaction = fitInteraction.current;
    void companionPdfDoc.getPage(pageNumber).then((page) => {
      if (cancelled || interaction !== fitInteraction.current) return;
      const size = page.getViewport({ scale: 1 });
      const fitted = fitPageZoom(
        container.clientWidth,
        container.clientHeight,
        size.width,
        size.height,
      );
      pendingCompanionFit.current = { page: pageNumber, zoom: fitted };
      onCompanionZoomChange(fitted);
      if (fitted === companionZoom) {
        const paper = container.querySelector<HTMLElement>(`#companion-pdf-page-${pageNumber}`);
        if (paper) centerPageInViewport(container, paper);
        pendingCompanionFit.current = null;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [companionFitRequest, companionPdfDoc, companionZoom, onCompanionZoomChange]);

  useEffect(() => {
    const pending = pendingCompanionFit.current;
    const container = companionContainerRef.current;
    if (!pending || !container || pending.zoom !== companionZoom) return;
    pendingCompanionFit.current = null;
    const frame = requestAnimationFrame(() => {
      const page = container.querySelector<HTMLElement>(`#companion-pdf-page-${pending.page}`);
      if (page && !panStartRef.current) centerPageInViewport(container, page);
    });
    fitCenteringCleanupRef.current?.();
    fitCenteringCleanupRef.current = () => cancelAnimationFrame(frame);
    return () => cancelAnimationFrame(frame);
  }, [companionZoom]);

  useEffect(() => {
    const pageNumber = pendingFitScrollPageRef.current;
    if (pageNumber === null) return;

    pendingFitScrollPageRef.current = null;
    centerFittedPage(pageNumber, true, pendingFitVerticalRef.current);
  }, [centerFittedPage, zoom]);

  // High-performance, jitter-free scroll listener for active page detection
  useEffect(() => {
    if (viewMode !== 'continuous' || !pdfDoc) return;

    const container = viewerContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId !== null) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (isProgrammaticScrollRef.current || !container) return;

        const containerRect = container.getBoundingClientRect();
        // Focal line at upper 35% of the viewport where user naturally reads
        const focalLine = containerRect.top + Math.min(containerRect.height * 0.35, 240);

        const pageElements = container.querySelectorAll<HTMLElement>('[data-pdf-page-number]');
        let focalPage: number | null = null;
        let maxOverlap = 0;
        let maxOverlapPage = lastReportedPageRef.current;

        for (let i = 0; i < pageElements.length; i++) {
          const el = pageElements[i];
          const pageNum = Number(el.getAttribute('data-pdf-page-number'));
          if (!pageNum) continue;
          const rect = el.getBoundingClientRect();

          // Skip elements completely outside the container viewport
          if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) {
            continue;
          }

          // Check if page covers the focal line
          if (rect.top <= focalLine && rect.bottom > focalLine) {
            focalPage = pageNum;
            break;
          }

          // Calculate visible pixel overlap inside container
          const visibleTop = Math.max(rect.top, containerRect.top);
          const visibleBottom = Math.min(rect.bottom, containerRect.bottom);
          const overlap = Math.max(0, visibleBottom - visibleTop);

          if (overlap > maxOverlap) {
            maxOverlap = overlap;
            maxOverlapPage = pageNum;
          }
        }

        const activePage = focalPage ?? maxOverlapPage;
        if (activePage > 0 && activePage !== lastReportedPageRef.current) {
          lastReportedPageRef.current = activePage;
          onPageChange(activePage);
        }
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [viewMode, pdfDoc, numPages, onPageChange, hasReadingSplit]);

  // The companion pane owns independent page tracking and programmatic navigation.
  useEffect(() => {
    if (!companionPdfDoc || !onCompanionPageChange) return;
    const container = companionContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null || companionProgrammaticScrollRef.current) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const containerRect = container.getBoundingClientRect();
        const focalLine = containerRect.top + Math.min(containerRect.height * 0.35, 240);

        const pageElements = container.querySelectorAll<HTMLElement>('[data-pdf-page-number]');
        let activePage = companionLastReportedPageRef.current;
        let largestOverlap = 0;

        for (let i = 0; i < pageElements.length; i++) {
          const page = pageElements[i];
          const pageNum = Number(page.getAttribute('data-pdf-page-number'));
          if (!pageNum) continue;
          const rect = page.getBoundingClientRect();

          if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) {
            continue;
          }

          if (rect.top <= focalLine && rect.bottom > focalLine) {
            activePage = pageNum;
            break;
          }
          const overlap = Math.max(
            0,
            Math.min(rect.bottom, containerRect.bottom) - Math.max(rect.top, containerRect.top),
          );
          if (overlap > largestOverlap) {
            largestOverlap = overlap;
            activePage = pageNum;
          }
        }

        if (activePage !== companionLastReportedPageRef.current) {
          companionLastReportedPageRef.current = activePage;
          onCompanionPageChange(activePage);
        }
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [companionPdfDoc, onCompanionPageChange]);

  useEffect(() => {
    if (!companionPdfDoc) return;
    if (companionCurrentPage === companionLastReportedPageRef.current) return;
    const container = companionContainerRef.current;
    const page = document.getElementById(`companion-pdf-page-${companionCurrentPage}`);
    if (!container || !page) return;

    companionProgrammaticScrollRef.current = true;
    if (companionProgrammaticTimerRef.current) clearTimeout(companionProgrammaticTimerRef.current);
    const containerRect = container.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    container.scrollTo({
      top: Math.max(0, container.scrollTop + pageRect.top - containerRect.top - 16),
      behavior: 'smooth',
    });
    companionLastReportedPageRef.current = companionCurrentPage;
    companionProgrammaticTimerRef.current = setTimeout(() => {
      companionProgrammaticScrollRef.current = false;
    }, 600);
  }, [companionCurrentPage, companionPdfDoc]);

  // Initial horizontal centering for both panes in Read Together mode
  useEffect(() => {
    if (!companionPdfDoc) return;
    const centerBoth = () => {
      if (viewerContainerRef.current) {
        const prim = viewerContainerRef.current;
        const centerLeft = (prim.scrollWidth - prim.clientWidth) / 2;
        if (centerLeft > 0 && prim.scrollLeft === 0) {
          prim.scrollLeft = centerLeft;
        }
      }
      if (companionContainerRef.current) {
        const comp = companionContainerRef.current;
        const centerLeft = (comp.scrollWidth - comp.clientWidth) / 2;
        if (centerLeft > 0 && comp.scrollLeft === 0) {
          comp.scrollLeft = centerLeft;
        }
      }
    };

    requestAnimationFrame(centerBoth);
    const t1 = setTimeout(centerBoth, 100);
    const t2 = setTimeout(centerBoth, 350);
    const t3 = setTimeout(centerBoth, 800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [companionPdfDoc, pdfDoc]);

  useViewportZoom(
    viewerContainerRef,
    zoom,
    onChangeZoom,
    pdfDoc,
    `${viewMode}-${hasReadingSplit}`,
    '[data-pdf-page-number]',
    () => onActivePaneChange?.('primary'),
    zoomStepRequest?.pane === 'main' ? zoomStepRequest : null,
  );
  useViewportZoom(
    companionContainerRef,
    companionZoom,
    onCompanionZoomChange,
    companionPdfDoc,
    viewMode,
    '[data-pdf-page-number]',
    () => onActivePaneChange?.('companion'),
    zoomStepRequest?.pane === 'companion' ? zoomStepRequest : null,
  );

  // A user's scroll/pinch takes ownership from any outstanding fit operation.
  useEffect(() => {
    const containers = [viewerContainerRef.current, companionContainerRef.current].filter(
      (element): element is HTMLDivElement => element !== null,
    );
    const interruptFit = () => {
      fitInteraction.current += 1;
      fitCenteringCleanupRef.current?.();
      fitCenteringCleanupRef.current = null;
      pendingFitScrollPageRef.current = null;
      pendingCompanionFit.current = null;
    };
    containers.forEach((element) =>
      element.addEventListener('wheel', interruptFit, { passive: true }),
    );
    return () =>
      containers.forEach((element) => element.removeEventListener('wheel', interruptFit));
  }, [pdfDoc, companionPdfDoc, viewMode, hasReadingSplit]);

  // Mouse Wheel: Pinch-to-zoom and intuitive single-page turn on boundary scroll
  useEffect(() => {
    const container = viewerContainerRef.current;
    if (!container) return;

    let lastWheelPageTurnTime = 0;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;

      // In Single Page Mode, wheel scroll at boundaries turns the page smoothly
      if (viewMode === 'single' && pdfDoc) {
        const now = Date.now();
        if (now - lastWheelPageTurnTime < 350) return;

        const isAtBottom =
          container.scrollTop + container.clientHeight >= container.scrollHeight - 10;
        const isAtTop = container.scrollTop <= 10;

        if (e.deltaY > 40 && isAtBottom && currentPage < numPages) {
          lastWheelPageTurnTime = now;
          onPageChange(currentPage + 1);
        } else if (e.deltaY < -40 && isAtTop && currentPage > 1) {
          lastWheelPageTurnTime = now;
          onPageChange(currentPage - 1);
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [
    zoom,
    onChangeZoom,
    viewMode,
    pdfDoc,
    currentPage,
    numPages,
    onPageChange,
    onActivePaneChange,
    hasReadingSplit,
  ]);

  const getTargetContainerForPoint = useCallback(
    (
      clientX: number,
      clientY: number,
    ): { container: HTMLDivElement | null; pane: 'primary' | 'companion' } => {
      if (!companionPdfDoc) {
        return { container: viewerContainerRef.current, pane: 'primary' };
      }

      const companionEl = companionContainerRef.current;
      if (companionEl) {
        const compRect = companionEl.getBoundingClientRect();
        if (
          clientX >= compRect.left &&
          clientX <= compRect.right &&
          clientY >= compRect.top &&
          clientY <= compRect.bottom
        ) {
          return { container: companionEl, pane: 'companion' };
        }
      }

      const primaryEl = viewerContainerRef.current;
      if (primaryEl) {
        const primRect = primaryEl.getBoundingClientRect();
        if (
          clientX >= primRect.left &&
          clientX <= primRect.right &&
          clientY >= primRect.top &&
          clientY <= primRect.bottom
        ) {
          return { container: primaryEl, pane: 'primary' };
        }
      }

      if (companionEl) {
        const compRect = companionEl.getBoundingClientRect();
        if (clientX >= compRect.left) {
          return { container: companionEl, pane: 'companion' };
        }
      }

      return { container: primaryEl, pane: 'primary' };
    },
    [companionPdfDoc],
  );

  // Handle Mouse Down for Panning (Spacebar + Left Click, Middle Click, or Background Canvas Drag)
  const startPanInContainer = (
    e: React.MouseEvent,
    container: HTMLDivElement | null,
    allowAnnotationTools: boolean,
  ) => {
    if (!container) return;
    const isMiddleClick = e.button === 1;
    const isSpaceDrag = e.button === 0 && isSpacePressed;
    const target = e.target as HTMLElement;
    const isPageOrControl = Boolean(
      target.closest?.('[data-pdf-page-number]') ||
      target.closest?.('[id^="pdf-page-"]') ||
      target.closest?.('[id^="companion-pdf-page-"]') ||
      target.closest?.('.textLayer') ||
      target.closest?.('button') ||
      target.closest?.('input') ||
      target.closest?.('textarea'),
    );
    const isNoteCreationTool =
      (activeTool === 'text' || activeTool === 'sticky-note') && !allowAnnotationTools;
    const isBackgroundClick =
      e.button === 0 &&
      !isSpacePressed &&
      !isNoteCreationTool &&
      (allowAnnotationTools || activeTool !== 'eraser') &&
      !isPageOrControl &&
      (target === container ||
        Boolean(target.closest?.('.canvas-background-layer')) ||
        Boolean(target.closest?.('.canvas-workspace-area')) ||
        container.contains(target));

    if (isMiddleClick || isSpaceDrag || isBackgroundClick) {
      e.preventDefault();
      fitInteraction.current += 1;
      fitCenteringCleanupRef.current?.();
      fitCenteringCleanupRef.current = null;
      pendingFitScrollPageRef.current = null;
      pendingCompanionFit.current = null;

      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: container.scrollLeft,
        scrollTop: container.scrollTop,
      };

      const handleMouseMove = (moveEvt: MouseEvent) => {
        if (!panStartRef.current || !container) return;
        const dx = moveEvt.clientX - panStartRef.current.x;
        const dy = moveEvt.clientY - panStartRef.current.y;
        container.scrollLeft = panStartRef.current.scrollLeft - dx;
        container.scrollTop = panStartRef.current.scrollTop - dy;
      };

      const handleMouseUp = () => {
        setIsPanning(false);
        panStartRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
  };

  const handleStartPan = (e: React.MouseEvent) => {
    onActivePaneChange?.('primary');
    startPanInContainer(e, viewerContainerRef.current, false);
  };

  const handleStartCompanionPan = (e: React.MouseEvent) => {
    onActivePaneChange?.('companion');
    startPanInContainer(e, companionContainerRef.current, true);
  };

  const handleSpaceOverlayMouseDown = (e: React.MouseEvent) => {
    const { container, pane } = getTargetContainerForPoint(e.clientX, e.clientY);
    onActivePaneChange?.(pane);
    startPanInContainer(e, container, pane === 'companion');
  };

  // Handle Drag & Drop onto main empty viewport: files, or pinned AI responses onto the nearest page
  const findNearestPageForDrop = (clientX: number, clientY: number, root?: HTMLElement | null) => {
    const container = root ?? viewerContainerRef.current;
    if (!container) return null;

    // Only anchor to primary document pages; the read-only companion has no annotations
    const pageElements = Array.from(
      container.querySelectorAll<HTMLElement>('[data-pdf-page-number]'),
    ).filter((el) => !el.id.startsWith('companion-pdf-page-'));
    let bestEl: HTMLElement | null = null;
    let minDistance = Infinity;

    for (let i = 0; i < pageElements.length; i++) {
      const el = pageElements[i];
      const rect = el.getBoundingClientRect();
      let distY = 0;
      if (clientY < rect.top) {
        distY = rect.top - clientY;
      } else if (clientY > rect.bottom) {
        distY = clientY - rect.bottom;
      }

      if (distY < minDistance) {
        minDistance = distY;
        bestEl = el;
      }
    }

    if (!bestEl) return null;
    const rect = bestEl.getBoundingClientRect();
    return {
      pageNumber: Number(bestEl.getAttribute('data-pdf-page-number')) || currentPage,
      // Raw workspace-relative coordinates (may be negative or > 1) so cards can live anywhere
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  };

  const handleDragOver = (e: React.DragEvent) => {
    const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
    if (hasFiles) {
      e.preventDefault();
      setIsViewerDraggingFile(true);
      return;
    }
    // Allow AI response drops anywhere on the viewer background (they land near the nearest page)
    if (!onAiResponseDrop) return;
    if (e.dataTransfer.types.includes(AI_RESPONSE_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setAiResponseDragDroppable(true);
      setViewerAiDragPos({
        clientX: e.clientX,
        clientY: e.clientY,
      });
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
    if (hasFiles) {
      e.preventDefault();
      setIsViewerDraggingFile(false);
      return;
    }
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setAiResponseDragDroppable(false);
      setViewerAiDragPos(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
    setIsViewerDraggingFile(false);
    setAiResponseDragDroppable(false);
    setViewerAiDragPos(null);

    if (!hasFiles) {
      if (onAiResponseDrop) {
        const aiResponsePayload = extractAiResponseDragPayload(e.dataTransfer);
        if (aiResponsePayload) {
          e.preventDefault();
          const dropTarget = findNearestPageForDrop(
            e.clientX,
            e.clientY,
            e.currentTarget as HTMLElement,
          );
          if (dropTarget) {
            onAiResponseDrop(
              dropTarget.pageNumber,
              dropTarget.x,
              dropTarget.y,
              aiResponsePayload.prompt,
              aiResponsePayload.response,
            );
          }
        }
      }
      return;
    }
    e.preventDefault();

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.pdf') || file.type === 'application/pdf') {
        onPdfFileDrop(file);
      } else if (file.type.startsWith('image/') && numPages > 0) {
        onImageDrop(currentPage, file);
      }
    }
  };

  // Handle Eraser and Margin Note Creation pointer events on viewer container
  const handleViewerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isSpacePressed) return;

    if (activeTool === 'eraser') {
      isErasingRef.current = true;
      setEraserPos({ x: e.clientX, y: e.clientY });
      performGlobalEraseAt(e.clientX, e.clientY);
      return;
    }

    if (activeTool === 'text' || activeTool === 'sticky-note') {
      if (selectedAnnotationId) {
        onSelectAnnotation(null);
        onSelectTool?.('select');
        return;
      }
      const target = e.target as HTMLElement;
      const isPageOrControl = Boolean(
        target.closest?.('[data-pdf-page-number]') ||
        target.closest?.('[id^="pdf-page-"]') ||
        target.closest?.('[id^="companion-pdf-page-"]') ||
        target.closest?.('.textLayer') ||
        target.closest?.('button') ||
        target.closest?.('input') ||
        target.closest?.('textarea'),
      );

      if (!isPageOrControl && pdfDoc && numPages > 0) {
        const container = viewerContainerRef.current;
        if (!container) return;

        const pageElements = container.querySelectorAll<HTMLElement>('[data-pdf-page-number]');
        let bestEl: HTMLElement | null = null;
        let minDistance = Infinity;

        for (let i = 0; i < pageElements.length; i++) {
          const el = pageElements[i];
          const rect = el.getBoundingClientRect();
          let distY = 0;
          if (e.clientY < rect.top) {
            distY = rect.top - e.clientY;
          } else if (e.clientY > rect.bottom) {
            distY = e.clientY - rect.bottom;
          }

          if (distY < minDistance) {
            minDistance = distY;
            bestEl = el;
          }
        }

        if (bestEl) {
          const pageNum = Number(bestEl.getAttribute('data-pdf-page-number')) || currentPage;
          const rect = bestEl.getBoundingClientRect();
          const normX = (e.clientX - rect.left) / rect.width;
          const normY = (e.clientY - rect.top) / rect.height;

          const newNote: TextNoteAnnotation = {
            id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            pageNumber: pageNum,
            type: 'text-note',
            kind: activeTool === 'text' ? 'plain' : 'sticky',
            x: normX,
            y: normY,
            text: '',
            color: activeTool === 'text' ? '#000000' : '#fef08a',
            fontSize: 14,
            fontFamily: 'sans',
            align: 'left',
            width: activeTool === 'sticky-note' ? 0.2 : undefined,
            createdAt: Date.now(),
          };
          onAddAnnotation(newNote);
          onSelectAnnotation(newNote.id);
          onSelectTool?.('select');
        }
      }
    }
  };

  const handleViewerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'eraser') {
      setEraserPos({ x: e.clientX, y: e.clientY });
      if (isErasingRef.current || e.buttons === 1) {
        performGlobalEraseAt(e.clientX, e.clientY);
      }
    }
  };

  const handleViewerPointerLeave = () => {
    if (activeTool === 'eraser' && !isErasingRef.current) {
      setEraserPos(null);
    }
  };

  // If no PDF is loaded, show welcoming Hero drop zone
  if (!pdfDoc) {
    return (
      <main
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-[#1c1c22] p-6"
      >
        <div className="animate-slide-up relative z-10 flex w-full max-w-md flex-col items-center gap-5 rounded-xl border border-[#383846] bg-[#24242b] p-7 text-center shadow-2xl">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#404050] bg-[#2d2d36] text-zinc-300">
            <UploadCloud className="h-6 w-6" />
          </div>

          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold tracking-tight text-zinc-100">
              Open or Drop a PDF Document
            </h2>
            <p className="text-xs leading-relaxed text-zinc-400">
              Fast, smooth PDF reading with mouse zoom/pan, dark invert, text selection & native
              export.
            </p>
          </div>

          <div className="w-full">
            <button onClick={onOpenPdfClick} className="btn-primary w-full py-2.5">
              <UploadCloud className="h-4 w-4" />
              <span>Browse PDF File</span>
            </button>
          </div>

          <div className="font-mono text-[10px] text-zinc-500">
            Drag & drop any .pdf file directly into the window
          </div>
        </div>
      </main>
    );
  }

  // Compute cursor style based on space/pan/eraser/annotation tool state
  const cursorStyle = isPanning
    ? 'cursor-grabbing'
    : isSpacePressed
      ? 'cursor-grab'
      : activeTool === 'eraser'
        ? 'cursor-none'
        : activeTool === 'text'
          ? 'cursor-text'
          : 'cursor-default';

  const isCompanionContentTarget = (target: EventTarget) =>
    Boolean(
      companionContent &&
      target instanceof Element &&
      target.closest('[data-reader-pane="companion"]'),
    );

  return (
    <main
      ref={hasReadingSplit ? undefined : viewerContainerRef}
      onMouseDownCapture={
        isSpacePressed
          ? (event) => {
              if (isCompanionContentTarget(event.target)) return;
              handleSpaceOverlayMouseDown(event);
              event.stopPropagation();
            }
          : undefined
      }
      data-hand-mode={isSpacePressed || undefined}
      onMouseDown={hasReadingSplit ? undefined : handleStartPan}
      onPointerDown={hasReadingSplit ? undefined : handleViewerPointerDown}
      onPointerMove={hasReadingSplit ? undefined : handleViewerPointerMove}
      onPointerLeave={hasReadingSplit ? undefined : handleViewerPointerLeave}
      onDragOver={(event) => {
        if (!isCompanionContentTarget(event.target)) handleDragOver(event);
      }}
      onDragLeave={(event) => {
        if (!isCompanionContentTarget(event.target)) handleDragLeave(event);
      }}
      onDrop={(event) => {
        if (!isCompanionContentTarget(event.target)) void handleDrop(event);
      }}
      className={`pdf-viewer-viewport relative flex-1 bg-[#1c1c22] select-none ${
        hasReadingSplit ? 'overflow-hidden' : 'overflow-x-auto overflow-y-auto'
      } ${cursorStyle}`}
    >
      {/* Visual Eraser Brush Circle Indicator - Single global indicator across all pages */}
      {activeTool === 'eraser' && eraserPos && (
        <div
          style={{
            left: `${eraserPos.x}px`,
            top: `${eraserPos.y}px`,
            width: '36px',
            height: '36px',
            transform: 'translate(-50%, -50%)',
          }}
          className="backdrop-blur-2xs animate-pulse-glow pointer-events-none fixed z-50 rounded-full border-2 border-red-400/80 bg-red-500/20 shadow-md"
        />
      )}

      {/* Live AI Response Card Preview during Drag */}
      {onAiResponseDrop && viewerAiDragPos && (
        <div
          style={{
            left: `${viewerAiDragPos.clientX + 14}px`,
            top: `${viewerAiDragPos.clientY + 14}px`,
            width: '380px',
          }}
          className="macos-ai-popover ai-response-card-drag-preview pointer-events-none fixed z-50"
          aria-hidden="true"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 rounded-t-xl border-b border-[var(--border)] bg-[var(--popover)]/80 px-3.5 py-2 backdrop-blur-md select-none">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              <span className="font-medium tracking-tight text-[var(--foreground)]">
                AI Assistant
              </span>
              <span className="py-0.2 rounded-md border border-purple-500/30 bg-purple-500/15 px-1.5 font-mono text-[9.5px] font-medium text-purple-400">
                Cinnabar AI
              </span>
            </div>
            <span className="rounded-full border border-blue-500/30 bg-blue-500/15 px-2 py-0.5 text-[9.5px] font-semibold text-blue-500 dark:text-blue-400">
              Drop to pin card
            </span>
          </div>

          <div className="space-y-2 rounded-b-xl border border-dashed border-blue-500/40 bg-[var(--popover)]/90 p-3.5 backdrop-blur-md">
            {getActiveAiResponseDrag()?.prompt && (
              <div className="line-clamp-1 rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-500 italic dark:text-blue-400">
                "{getActiveAiResponseDrag()?.prompt}"
              </div>
            )}
            <div className="line-clamp-3 text-xs leading-relaxed text-[var(--foreground)] opacity-85">
              {getActiveAiResponseDrag()?.response || 'Placing AI response card…'}
            </div>
          </div>
        </div>
      )}

      {/* Dragging file overlay cue */}
      {isViewerDraggingFile && (
        <div className="animate-fade-in pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 text-white backdrop-blur-md">
          <UploadCloud className="mb-4 h-16 w-16 animate-bounce text-blue-400" />
          <h3 className="text-xl font-bold">Drop PDF or Image to Open / Attach</h3>
        </div>
      )}

      {/* 2D Canvas Workspace Wrapper with expansive horizontal and vertical panning canvas */}
      <div
        className={
          hasReadingSplit
            ? 'h-full w-full'
            : 'canvas-background-layer box-border flex min-h-full w-max min-w-full flex-col items-center justify-start px-[50vw] py-6 sm:px-[60vw]'
        }
      >
        {/* READ TOGETHER: TWO DOCUMENTS IN ONE CONTINUOUS, PAGE-ALIGNED STREAM */}
        {viewMode === 'continuous' && hasReadingSplit && (
          <div className="flex h-full min-h-0 w-full" data-read-together-split>
            <section
              onPointerDownCapture={() => onActivePaneChange?.('primary')}
              onFocusCapture={() => onActivePaneChange?.('primary')}
              className={`flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[var(--workspace)] transition-shadow duration-150 ${
                activePane === 'primary' ? 'shadow-[inset_0_0_0_1px_var(--primary)]' : ''
              }`}
              data-reader-pane="primary"
              aria-label={`${primaryFileName} pages`}
              data-active-pane={activePane === 'primary' || undefined}
            >
              {!companionContent && (
                <div
                  className={`z-20 flex shrink-0 items-center justify-center gap-2 border-b px-3 py-2 text-center text-[11px] font-medium backdrop-blur-xl ${
                    activePane === 'primary'
                      ? 'border-blue-400/60 bg-blue-500/20 font-semibold text-white shadow-sm'
                      : 'border-[var(--border)] bg-[var(--popover)]/90 text-[var(--foreground)]'
                  }`}
                >
                  <span className="truncate">{primaryFileName}</span>
                </div>
              )}
              <div
                ref={viewerContainerRef}
                onMouseDown={handleStartPan}
                onPointerDown={handleViewerPointerDown}
                onPointerMove={handleViewerPointerMove}
                onPointerLeave={handleViewerPointerLeave}
                className="min-h-0 flex-1 overflow-auto"
              >
                <div className="canvas-workspace-area box-border flex min-h-full w-max min-w-full flex-col items-center justify-start gap-3 px-[40vw] py-6">
                  {getReadTogetherPageRows(numPages, 0).map((pageNum) => (
                    <PDFPage
                      key={pageNum}
                      pdfDoc={pdfDoc}
                      pageNumber={pageNum}
                      scale={zoom}
                      currentTheme={currentTheme}
                      filterClass={filterClass}
                      customFilterStyle={customFilterStyle}
                      activeTool={activeTool}
                      selectedColor={selectedColor}
                      highlightColors={highlightColors}
                      strokeWidth={strokeWidth}
                      opacity={opacity}
                      highlightStyle={highlightStyle}
                      lineHighlightStyle={lineHighlightStyle}
                      annotations={annotationsByPage.get(pageNum) || EMPTY_ANNOTATIONS}
                      selectedAnnotationId={selectedAnnotationId}
                      onSelectAnnotation={onSelectAnnotation}
                      onAddAnnotation={onAddAnnotation}
                      onUpdateAnnotation={onUpdateAnnotation}
                      onChangeHighlightStyle={onChangeHighlightStyle}
                      onChangeLineHighlightStyle={onChangeLineHighlightStyle}
                      onDeleteAnnotation={onDeleteAnnotation}
                      onImageDrop={onImageDrop}
                      onAiResponseDrop={onAiResponseDrop}
                      onCursorMove={onCursorMove}
                      onCaptureSnippet={onCaptureSnippet}
                      aiJobs={aiJobs}
                      onAiBoxCreated={onAiBoxCreated}
                      onSubmitAi={onSubmitAi}
                      onCancelAi={onCancelAi}
                      onCloseAi={onCloseAi}
                      onAddPageBelow={onAddPageBelow}
                      onDeletePage={onDeletePage}
                      onCopyPageText={onCopyPageText}
                      onCopyPageImage={onCopyPageImage}
                      onAskAiAboutPage={onAskAiAboutPage}
                      onCopySelectedText={onCopySelectedText}
                      onAttachTextToAi={onAttachTextToAi}
                      onHighlightSelection={onHighlightSelection}
                      onSelectTool={onSelectTool}
                      showToast={showToast}
                      isFlush
                    />
                  ))}
                </div>
              </div>
            </section>

            <SplitDivider
              value={split}
              onChange={setSplit}
              label={companionContent ? 'Resize PDF and notebook panes' : 'Resize PDF panes'}
              minRight={companionContent ? 320 : 240}
              readTogether
            />

            <section
              onPointerDownCapture={() => onActivePaneChange?.('companion')}
              onFocusCapture={() => onActivePaneChange?.('companion')}
              style={{ flexBasis: `calc(${(1 - split) * 100}% - ${(1 - split) * 6}px)` }}
              className={`flex h-full min-w-0 flex-none flex-col overflow-hidden bg-[var(--workspace)] transition-shadow duration-150 ${
                activePane === 'companion' ? 'shadow-[inset_0_0_0_1px_var(--primary)]' : ''
              }`}
              data-reader-pane="companion"
              aria-label={
                companionContent
                  ? 'Notebook reading pane'
                  : `${companionFileName || 'Companion PDF'} pages`
              }
              data-active-pane={activePane === 'companion' || undefined}
            >
              {companionContent ??
                (companionPdfDoc && (
                  <>
                    {' '}
                    <div
                      className={`z-20 flex shrink-0 items-center justify-center gap-2 border-b px-3 py-2 text-center text-[11px] font-medium backdrop-blur-xl ${
                        activePane === 'companion'
                          ? 'border-blue-400/60 bg-blue-500/20 font-semibold text-white shadow-sm'
                          : 'border-[var(--border)] bg-[var(--popover)]/90 text-[var(--foreground)]'
                      }`}
                    >
                      <span className="truncate">{companionFileName || 'Companion PDF'}</span>
                    </div>
                    <div
                      ref={companionContainerRef}
                      onMouseDown={handleStartCompanionPan}
                      className="min-h-0 flex-1 overflow-auto"
                    >
                      <div className="canvas-workspace-area box-border flex min-h-full w-max min-w-full flex-col items-center justify-start gap-3 px-[40vw] py-6">
                        {getReadTogetherPageRows(companionPdfDoc.numPages, 0).map((pageNum) => (
                          <PDFPage
                            key={pageNum}
                            pdfDoc={companionPdfDoc}
                            pageNumber={pageNum}
                            scale={companionZoom}
                            currentTheme={currentTheme}
                            filterClass={filterClass}
                            customFilterStyle={customFilterStyle}
                            activeTool="select"
                            selectedColor={selectedColor}
                            highlightColors={highlightColors}
                            strokeWidth={strokeWidth}
                            opacity={opacity}
                            highlightStyle={highlightStyle}
                            lineHighlightStyle={lineHighlightStyle}
                            annotations={EMPTY_ANNOTATIONS}
                            selectedAnnotationId={null}
                            onSelectAnnotation={() => {}}
                            onAddAnnotation={() => {}}
                            onUpdateAnnotation={() => {}}
                            onChangeHighlightStyle={() => {}}
                            onChangeLineHighlightStyle={() => {}}
                            onDeleteAnnotation={() => {}}
                            onImageDrop={() => {}}
                            aiJobs={{}}
                            onAiBoxCreated={() => {}}
                            onSubmitAi={() => {}}
                            onCancelAi={() => {}}
                            onCloseAi={() => {}}
                            onAddPageBelow={() => {}}
                            onDeletePage={() => {}}
                            onCopyPageText={() => {}}
                            onCopyPageImage={() => {}}
                            onAskAiAboutPage={() => {}}
                            onSelectTool={onSelectTool}
                            showToast={showToast}
                            isFlush
                            isReadOnly
                            pageIdPrefix="companion-pdf-page"
                          />
                        ))}
                      </div>
                    </div>
                  </>
                ))}
            </section>
          </div>
        )}

        {/* CONTINUOUS VIEW MODE */}
        {viewMode === 'continuous' && !hasReadingSplit && (
          <div className="canvas-workspace-area flex flex-col items-center gap-3 py-2 pb-6">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <PDFPage
                key={pageNum}
                pdfDoc={pdfDoc}
                pageNumber={pageNum}
                scale={zoom}
                currentTheme={currentTheme}
                filterClass={filterClass}
                customFilterStyle={customFilterStyle}
                activeTool={activeTool}
                selectedColor={selectedColor}
                highlightColors={highlightColors}
                strokeWidth={strokeWidth}
                opacity={opacity}
                highlightStyle={highlightStyle}
                lineHighlightStyle={lineHighlightStyle}
                annotations={annotationsByPage.get(pageNum) || EMPTY_ANNOTATIONS}
                selectedAnnotationId={selectedAnnotationId}
                onSelectAnnotation={onSelectAnnotation}
                onAddAnnotation={onAddAnnotation}
                onUpdateAnnotation={onUpdateAnnotation}
                onChangeHighlightStyle={onChangeHighlightStyle}
                onChangeLineHighlightStyle={onChangeLineHighlightStyle}
                onDeleteAnnotation={onDeleteAnnotation}
                onImageDrop={onImageDrop}
                onAiResponseDrop={onAiResponseDrop}
                onCursorMove={onCursorMove}
                onCaptureSnippet={onCaptureSnippet}
                aiJobs={aiJobs}
                onAiBoxCreated={onAiBoxCreated}
                onSubmitAi={onSubmitAi}
                onCancelAi={onCancelAi}
                onCloseAi={onCloseAi}
                onAddPageBelow={onAddPageBelow}
                onDeletePage={onDeletePage}
                onCopyPageText={onCopyPageText}
                onCopyPageImage={onCopyPageImage}
                onAskAiAboutPage={onAskAiAboutPage}
                onCopySelectedText={onCopySelectedText}
                onAttachTextToAi={onAttachTextToAi}
                onHighlightSelection={onHighlightSelection}
                onSelectTool={onSelectTool}
                showToast={showToast}
                isFlush
              />
            ))}
          </div>
        )}

        {/* SINGLE PAGE VIEW MODE */}
        {viewMode === 'single' && (
          <div className="canvas-workspace-area relative flex flex-col items-center justify-center pb-6">
            <PDFPage
              pdfDoc={pdfDoc}
              pageNumber={currentPage}
              scale={zoom}
              currentTheme={currentTheme}
              filterClass={filterClass}
              customFilterStyle={customFilterStyle}
              activeTool={activeTool}
              selectedColor={selectedColor}
              highlightColors={highlightColors}
              strokeWidth={strokeWidth}
              opacity={opacity}
              highlightStyle={highlightStyle}
              lineHighlightStyle={lineHighlightStyle}
              annotations={annotationsByPage.get(currentPage) || EMPTY_ANNOTATIONS}
              selectedAnnotationId={selectedAnnotationId}
              onSelectAnnotation={onSelectAnnotation}
              onAddAnnotation={onAddAnnotation}
              onUpdateAnnotation={onUpdateAnnotation}
              onChangeHighlightStyle={onChangeHighlightStyle}
              onChangeLineHighlightStyle={onChangeLineHighlightStyle}
              onDeleteAnnotation={onDeleteAnnotation}
              onImageDrop={onImageDrop}
              onAiResponseDrop={onAiResponseDrop}
              onCursorMove={onCursorMove}
              onCaptureSnippet={onCaptureSnippet}
              aiJobs={aiJobs}
              onAiBoxCreated={onAiBoxCreated}
              onSubmitAi={onSubmitAi}
              onCancelAi={onCancelAi}
              onCloseAi={onCloseAi}
              onAddPageBelow={onAddPageBelow}
              onDeletePage={onDeletePage}
              onCopyPageText={onCopyPageText}
              onCopyPageImage={onCopyPageImage}
              onAskAiAboutPage={onAskAiAboutPage}
              onCopySelectedText={onCopySelectedText}
              onAttachTextToAi={onAttachTextToAi}
              onSelectTool={onSelectTool}
              showToast={showToast}
            />
          </div>
        )}

        {/* TWO-PAGE SPREAD VIEW MODE */}
        {viewMode === 'spread' && (
          <div className="canvas-workspace-area relative flex flex-col items-center justify-center pb-6">
            <div className="flex items-start justify-center gap-1">
              {/* Left Page */}
              <PDFPage
                pdfDoc={pdfDoc}
                pageNumber={currentPage % 2 === 0 ? currentPage - 1 : currentPage}
                scale={zoom * 0.85}
                currentTheme={currentTheme}
                filterClass={filterClass}
                customFilterStyle={customFilterStyle}
                activeTool={activeTool}
                selectedColor={selectedColor}
                highlightColors={highlightColors}
                strokeWidth={strokeWidth}
                opacity={opacity}
                highlightStyle={highlightStyle}
                lineHighlightStyle={lineHighlightStyle}
                annotations={
                  annotationsByPage.get(currentPage % 2 === 0 ? currentPage - 1 : currentPage) ||
                  EMPTY_ANNOTATIONS
                }
                selectedAnnotationId={selectedAnnotationId}
                onSelectAnnotation={onSelectAnnotation}
                onAddAnnotation={onAddAnnotation}
                onUpdateAnnotation={onUpdateAnnotation}
                onChangeHighlightStyle={onChangeHighlightStyle}
                onChangeLineHighlightStyle={onChangeLineHighlightStyle}
                onDeleteAnnotation={onDeleteAnnotation}
                onImageDrop={onImageDrop}
                onAiResponseDrop={onAiResponseDrop}
                onCursorMove={onCursorMove}
                onCaptureSnippet={onCaptureSnippet}
                aiJobs={aiJobs}
                onAiBoxCreated={onAiBoxCreated}
                onSubmitAi={onSubmitAi}
                onCancelAi={onCancelAi}
                onCloseAi={onCloseAi}
                onAddPageBelow={onAddPageBelow}
                onDeletePage={onDeletePage}
                onCopyPageText={onCopyPageText}
                onCopyPageImage={onCopyPageImage}
                onAskAiAboutPage={onAskAiAboutPage}
                onCopySelectedText={onCopySelectedText}
                onAttachTextToAi={onAttachTextToAi}
                onHighlightSelection={onHighlightSelection}
                onSelectTool={onSelectTool}
                showToast={showToast}
              />

              {/* Right Page (if exists) */}
              {(currentPage % 2 === 0 ? currentPage : currentPage + 1) <= numPages && (
                <PDFPage
                  pdfDoc={pdfDoc}
                  pageNumber={currentPage % 2 === 0 ? currentPage : currentPage + 1}
                  scale={zoom * 0.85}
                  currentTheme={currentTheme}
                  filterClass={filterClass}
                  customFilterStyle={customFilterStyle}
                  activeTool={activeTool}
                  selectedColor={selectedColor}
                  highlightColors={highlightColors}
                  strokeWidth={strokeWidth}
                  opacity={opacity}
                  highlightStyle={highlightStyle}
                  lineHighlightStyle={lineHighlightStyle}
                  annotations={
                    annotationsByPage.get(currentPage % 2 === 0 ? currentPage : currentPage + 1) ||
                    EMPTY_ANNOTATIONS
                  }
                  selectedAnnotationId={selectedAnnotationId}
                  onSelectAnnotation={onSelectAnnotation}
                  onAddAnnotation={onAddAnnotation}
                  onUpdateAnnotation={onUpdateAnnotation}
                  onChangeHighlightStyle={onChangeHighlightStyle}
                  onChangeLineHighlightStyle={onChangeLineHighlightStyle}
                  onDeleteAnnotation={onDeleteAnnotation}
                  onImageDrop={onImageDrop}
                  onAiResponseDrop={onAiResponseDrop}
                  onCursorMove={onCursorMove}
                  onCaptureSnippet={onCaptureSnippet}
                  aiJobs={aiJobs}
                  onAiBoxCreated={onAiBoxCreated}
                  onSubmitAi={onSubmitAi}
                  onCancelAi={onCancelAi}
                  onCloseAi={onCloseAi}
                  onAddPageBelow={onAddPageBelow}
                  onDeletePage={onDeletePage}
                  onCopyPageText={onCopyPageText}
                  onCopyPageImage={onCopyPageImage}
                  onAskAiAboutPage={onAskAiAboutPage}
                  onCopySelectedText={onCopySelectedText}
                  onAttachTextToAi={onAttachTextToAi}
                  onSelectTool={onSelectTool}
                  showToast={showToast}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
};
