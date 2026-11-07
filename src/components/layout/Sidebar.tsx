import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import {
  LayoutGrid,
  ListTree,
  Highlighter,
  Info,
  Sidebar as SidebarIcon,
  Trash2,
  Image as ImageIcon,
  Crop,
  Copy,
} from 'lucide-react';
import { SparkleIcon } from '../icons/SparkleIcon';
import type { Annotation, DocumentInfo, PDFOutlineItem, SnippetDividerEntry, SnippetEntry, StitchOptions } from '../../lib/types/index';
import { ThumbnailRenderQueue } from '../../lib/pdf/thumbnailRenderQueue';
import { SnippetPanel } from './SnippetPanel';
import { getAnnotationListPresentation, getAnnotationCoveredText } from '../../lib/annotations/annotationPresentation';
import { copyTextToClipboard } from '../../lib/pdf/pageExtractor';

export type SidebarTabType = 'thumbnails' | 'outline' | 'annotations' | 'snippets' | 'info';

interface SidebarProps {
  isOpen: boolean;
  activeTab?: SidebarTabType;
  onTabChange?: (tab: SidebarTabType) => void;
  pdfDoc: PDFDocumentProxy | null;
  docInfo: DocumentInfo | null;
  outline: PDFOutlineItem[];
  currentPage: number;
  numPages: number;
  annotations: Annotation[];
  filterClass: string;
  customFilterStyle: React.CSSProperties;
  onClose: () => void;
  onPageSelect: (pageNumber: number) => void;
  onDeletePage?: (pageNumber: number) => void;
  onSelectAnnotation?: (id: string | null) => void;
  onDeleteAnnotation: (id: string) => void;
  // Snippets props
  snippets?: SnippetEntry[];
  isSnipActive?: boolean;
  canUndoSnippets?: boolean;
  canRedoSnippets?: boolean;
  onUndoSnippets?: () => void;
  onRedoSnippets?: () => void;
  onToggleSnipTool?: () => void;
  onAddDivider?: (afterId?: string, label?: string) => void;
  onRemoveSnippetEntry?: (id: string) => void;
  onMoveSnippetEntry?: (id: string, direction: 'up' | 'down') => void;
  onUpdateDivider?: (id: string, updates: Partial<SnippetDividerEntry>) => void;
  onUpdateSnippetLabel?: (id: string, label: string) => void;
  onClearAllSnippets?: () => void;
  onCopyStitchedImage?: (options?: StitchOptions) => Promise<boolean>;
  onDownloadStitchedImage?: (options?: StitchOptions) => Promise<boolean>;
  showToast?: (text: string, isError?: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  activeTab: controlledTab,
  onTabChange,
  pdfDoc,
  docInfo,
  outline,
  currentPage,
  numPages,
  annotations,
  filterClass,
  customFilterStyle,
  onClose,
  onPageSelect,
  onDeletePage,
  onSelectAnnotation,
  onDeleteAnnotation,
  snippets = [],
  isSnipActive = false,
  canUndoSnippets = false,
  canRedoSnippets = false,
  onUndoSnippets,
  onRedoSnippets,
  onToggleSnipTool,
  onAddDivider,
  onRemoveSnippetEntry,
  onMoveSnippetEntry,
  onUpdateDivider,
  onUpdateSnippetLabel,
  onClearAllSnippets,
  onCopyStitchedImage,
  onDownloadStitchedImage,
  showToast,
}) => {
  const [internalTab, setInternalTab] = useState<SidebarTabType>('thumbnails');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: SidebarTabType) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  const [tabIndicatorStyle, setTabIndicatorStyle] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    opacity: number;
  }>({ left: 0, top: 0, width: 0, height: 0, opacity: 0 });

  const tabRefs = useRef<Map<SidebarTabType, HTMLButtonElement>>(new Map());

  useLayoutEffect(() => {
    const updateIndicator = () => {
      const activeEl = tabRefs.current.get(activeTab);
      if (activeEl) {
        setTabIndicatorStyle({
          left: activeEl.offsetLeft,
          top: activeEl.offsetTop,
          width: activeEl.offsetWidth,
          height: activeEl.offsetHeight,
          opacity: 1,
        });
      }
    };
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [activeTab, isOpen]);

  const thumbnailQueueRef = useRef<ThumbnailRenderQueue | null>(null);

  if (!thumbnailQueueRef.current) {
    thumbnailQueueRef.current = new ThumbnailRenderQueue();
  }
  const thumbnailQueue = thumbnailQueueRef.current;

  return (
    <aside
      aria-label="Navigation Sidebar"
      className={`macos-sidebar absolute inset-y-0 left-0 w-68 sm:w-72 flex flex-col z-40 select-none shadow-2xl border-r border-[var(--border)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isOpen ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none'
      }`}
    >
      {/* Tab Header Strip (Tahoe Segmented Navigation) */}
      <div className="p-2.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]">
        <div className="macos-segmented-group flex items-center gap-0.5 p-1 rounded-lg relative">
          {/* Smooth Sliding Tab Highlighter Box */}
          <div
            className="macos-tab-sliding-indicator"
            style={{
              transform: `translate3d(${tabIndicatorStyle.left}px, ${tabIndicatorStyle.top}px, 0)`,
              width: `${tabIndicatorStyle.width}px`,
              height: `${tabIndicatorStyle.height}px`,
              opacity: tabIndicatorStyle.opacity,
            }}
          />

          <button
            ref={(el) => {
              if (el) tabRefs.current.set('thumbnails', el);
              else tabRefs.current.delete('thumbnails');
            }}
            onClick={() => setActiveTab('thumbnails')}
            className={`relative z-10 p-1.5 rounded-md text-xs transition-colors ${
              activeTab === 'thumbnails'
                ? 'text-blue-500 dark:text-blue-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Thumbnails"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            ref={(el) => {
              if (el) tabRefs.current.set('outline', el);
              else tabRefs.current.delete('outline');
            }}
            onClick={() => setActiveTab('outline')}
            className={`relative z-10 p-1.5 rounded-md text-xs transition-colors ${
              activeTab === 'outline'
                ? 'text-blue-500 dark:text-blue-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Table of Contents"
          >
            <ListTree className="w-3.5 h-3.5" />
          </button>
          <button
            ref={(el) => {
              if (el) tabRefs.current.set('annotations', el);
              else tabRefs.current.delete('annotations');
            }}
            onClick={() => setActiveTab('annotations')}
            className={`relative z-10 p-1.5 rounded-md text-xs transition-colors ${
              activeTab === 'annotations'
                ? 'text-blue-500 dark:text-blue-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title={`Highlights & AI responses (${annotations.length})`}
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>
          <button
            ref={(el) => {
              if (el) tabRefs.current.set('snippets', el);
              else tabRefs.current.delete('snippets');
            }}
            onClick={() => setActiveTab('snippets')}
            className={`relative z-10 p-1.5 rounded-md text-xs transition-colors ${
              activeTab === 'snippets'
                ? 'text-blue-500 dark:text-blue-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title={`AI Snippet Compactor (${snippets.length})`}
          >
            <Crop className="w-3.5 h-3.5" />
            {snippets.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-[var(--card)]" />
            )}
          </button>
          <button
            ref={(el) => {
              if (el) tabRefs.current.set('info', el);
              else tabRefs.current.delete('info');
            }}
            onClick={() => setActiveTab('info')}
            className={`relative z-10 p-1.5 rounded-md text-xs transition-colors ${
              activeTab === 'info'
                ? 'text-blue-500 dark:text-blue-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Document Details"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          onClick={onClose}
          className="macos-sidebar-collapse-control"
          title="Hide Sidebar"
        >
          <SidebarIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab Content Area */}
      <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'snippets' ? 'overflow-hidden p-0' : 'overflow-y-auto p-3'}`}>
        {/* TAB 1: THUMBNAILS (Theme-Aware Inversion) */}
        {activeTab === 'thumbnails' && (
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <ThumbnailItem
                key={pageNum}
                pdfDoc={pdfDoc}
                pageNumber={pageNum}
                isActive={currentPage === pageNum}
                filterClass={filterClass}
                customFilterStyle={customFilterStyle}
                renderQueue={thumbnailQueue}
                onClick={() => onPageSelect(pageNum)}
                onDeletePage={onDeletePage}
                canDelete={numPages > 1}
              />
            ))}
          </div>
        )}

        {/* TAB 2: OUTLINE / TABLE OF CONTENTS */}
        {activeTab === 'outline' && (
          <div className="flex flex-col gap-1">
            {outline.length === 0 ? (
              <div className="text-[11px] text-zinc-500 text-center py-6">
                No Table of Contents found.
              </div>
            ) : (
              outline.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => onPageSelect(item.pageNumber)}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs text-zinc-300 hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all group"
                >
                  <span className="truncate pr-2 font-medium">{item.title}</span>
                  <span className="font-mono text-[10px] text-zinc-500 group-hover:text-zinc-300">
                    p.{item.pageNumber}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* TAB 3: ANNOTATIONS LIST */}
        {activeTab === 'annotations' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1 pb-1 border-b border-[var(--border)]">
              <span className="text-[10.5px] font-semibold text-zinc-400">
                {annotations.length} {annotations.length === 1 ? 'Annotation' : 'Annotations'}
              </span>
            </div>

            {annotations.length === 0 ? (
              <div className="text-[11px] text-zinc-500 text-center py-6">
                No annotations added yet.
              </div>
            ) : (
              annotations.map((ann) => {
                const presentation = getAnnotationListPresentation(ann);
                return (
                  <div
                    key={ann.id}
                    onClick={() => {
                      onPageSelect(ann.pageNumber);
                      onSelectAnnotation?.(ann.id);
                    }}
                    className="p-2 rounded-lg bg-[var(--card)] hover:bg-[var(--secondary)] border border-[var(--border)] flex items-start justify-between gap-2 cursor-pointer transition-all group text-xs shadow-xs"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      {presentation.isAi ? (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-500">
                          <SparkleIcon className="h-3 w-3" />
                        </span>
                      ) : ann.type === 'image' ? (
                        <ImageIcon className="mt-0.5 w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      ) : (
                        <span
                          className="mt-1 w-2.5 h-2.5 rounded-full shrink-0 border border-white/20 shadow-xs"
                          style={{ backgroundColor: (ann as { color?: string }).color || '#facc15' }}
                        />
                      )}
                      <div className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-medium capitalize text-zinc-200">
                            {presentation.title}
                          </span>
                          <span className="shrink-0 text-[9px] font-mono text-zinc-500">
                            P.{ann.pageNumber}
                          </span>
                        </div>
                        {presentation.prompt && (
                          <div
                            className="text-[10px] font-medium text-blue-400 truncate flex items-center gap-1"
                            title={presentation.prompt}
                          >
                            <span className="shrink-0 text-[8.5px] uppercase tracking-wider font-semibold text-blue-400/90 bg-blue-500/15 px-1 py-0.2 rounded">
                              Q
                            </span>
                            <span className="truncate">{presentation.prompt}</span>
                          </div>
                        )}
                        {presentation.preview && (
                          <span
                            className="text-[10.5px] leading-relaxed text-zinc-400 line-clamp-2"
                            title={presentation.preview}
                          >
                            {presentation.preview}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const text = getAnnotationCoveredText(ann);
                          if (!text) {
                            showToast?.('No text in annotation', true);
                            return;
                          }
                          const ok = await copyTextToClipboard(text);
                          if (ok) {
                            showToast?.('Copied annotation text to clipboard');
                          } else {
                            showToast?.('Failed to copy text', true);
                          }
                        }}
                        className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                        title="Copy text"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteAnnotation(ann.id);
                        }}
                        className="p-1 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete Annotation"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 4: AI SNIPPET COMPACTOR */}
        {activeTab === 'snippets' && (
          <SnippetPanel
            snippets={snippets}
            isSnipActive={isSnipActive}
            canUndo={canUndoSnippets}
            canRedo={canRedoSnippets}
            onUndo={onUndoSnippets}
            onRedo={onRedoSnippets}
            onToggleSnipTool={onToggleSnipTool || (() => {})}
            onAddDivider={onAddDivider || (() => {})}
            onRemoveEntry={onRemoveSnippetEntry || (() => {})}
            onMoveEntry={onMoveSnippetEntry || (() => {})}
            onUpdateDivider={onUpdateDivider || (() => {})}
            onUpdateSnippetLabel={onUpdateSnippetLabel || (() => {})}
            onClearAll={onClearAllSnippets || (() => {})}
            onJumpToPage={onPageSelect}
            onCopyStitchedImage={onCopyStitchedImage || (async () => false)}
            onDownloadStitchedImage={onDownloadStitchedImage || (async () => false)}
            showToast={showToast || (() => {})}
          />
        )}

        {/* TAB 5: DOCUMENT INFO */}
        {activeTab === 'info' && (
          <div className="flex flex-col gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-[var(--card)] border border-[var(--border)] flex flex-col gap-2 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                Document Details
              </span>
              <div className="flex justify-between">
                <span className="text-zinc-400">File Name:</span>
                <span className="text-zinc-200 font-medium truncate max-w-[130px]" title={docInfo?.fileName}>
                  {docInfo?.fileName || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Total Pages:</span>
                <span className="text-zinc-200 font-mono font-medium">{numPages}</span>
              </div>
              {docInfo?.fileSize && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">File Size:</span>
                  <span className="text-zinc-200 font-mono">
                    {(docInfo.fileSize / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-[var(--card)] border border-[var(--border)] flex flex-col gap-1.5 shadow-xs">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                Session Stats
              </span>
              <div className="flex justify-between">
                <span className="text-zinc-400">Annotations:</span>
                <span className="text-zinc-200 font-mono font-medium">
                  {annotations.length}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

// Thumbnail Renderer subcomponent with Color Inversion
const ThumbnailItem: React.FC<{
  pdfDoc: PDFDocumentProxy | null;
  pageNumber: number;
  isActive: boolean;
  filterClass: string;
  customFilterStyle: React.CSSProperties;
  renderQueue: ThumbnailRenderQueue;
  onClick: () => void;
  onDeletePage?: (pageNumber: number) => void;
  canDelete?: boolean;
}> = ({
  pdfDoc,
  pageNumber,
  isActive,
  filterClass,
  customFilterStyle,
  renderQueue,
  onClick,
  onDeletePage,
  canDelete = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thumbnailRef = useRef<HTMLDivElement | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);

  useEffect(() => {
    const thumbnail = thumbnailRef.current;
    if (!thumbnail) return;

    if (!('IntersectionObserver' in window)) {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport(entry.isIntersecting);
      },
      { rootMargin: '300px 0px' },
    );
    observer.observe(thumbnail);
    return () => observer.disconnect();
  }, []);

  const shouldRender = isNearViewport || isActive;

  useEffect(() => {
    if (!pdfDoc || !shouldRender) {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      return;
    }
    let isCancelled = false;
    let renderTask: RenderTask | undefined;
    let pageProxy: Awaited<ReturnType<typeof pdfDoc.getPage>> | null = null;

    const scheduleContinuation = (continueRender: () => void) => {
      const idleWindow = window as Window & {
        requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      };
      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleWindow.requestIdleCallback(() => {
          if (!isCancelled) continueRender();
        }, { timeout: 120 });
        return;
      }
      globalThis.setTimeout(() => {
        if (!isCancelled) continueRender();
      }, 16);
    };

    const renderThumbnail = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;
        pageProxy = page;

        const viewport = page.getViewport({ scale: 0.25 });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });
        renderTask.onContinue = scheduleContinuation;
        await renderTask.promise;
      } catch {} finally {
        if (pageProxy) {
          try {
            pageProxy.cleanup();
          } catch {}
        }
      }
    };

    const cancelQueuedRender = renderQueue.enqueue(renderThumbnail, isActive ? 'high' : 'normal');
    return () => {
      isCancelled = true;
      cancelQueuedRender();
      renderTask?.cancel();
      if (pageProxy) {
        try {
          pageProxy.cleanup();
        } catch {}
      }
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [isActive, pageNumber, pdfDoc, renderQueue, shouldRender]);

  return (
    <div
      ref={thumbnailRef}
      onClick={onClick}
      onContextMenu={(e) => {
        if (canDelete && onDeletePage) {
          e.preventDefault();
          onDeletePage(pageNumber);
        }
      }}
      className="group relative flex flex-col items-center gap-1.5 p-1 cursor-pointer transition-transform hover:scale-[1.02]"
    >
      {/* Thumbnail Paper Container with matching Theme Background & Filter */}
      <div
        className={`relative w-full aspect-[1/1.4] rounded-md overflow-hidden flex items-center justify-center transition-all duration-150 shadow-xs border border-[var(--border)] ${
          isActive ? 'ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--background)]' : ''
        } ${filterClass}`}
        style={{
          ...customFilterStyle,
        }}
      >
        <canvas
          ref={canvasRef}
          className="block w-full h-full object-contain"
        />
      </div>
      <span className="text-[10px] font-mono font-medium text-zinc-400">
        {pageNumber}
      </span>
    </div>
  );
};
