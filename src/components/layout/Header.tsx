import React from 'react';
import {
  ArrowLeft,
  Moon,
  Sun,
  Search,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Copy,
  Camera,
  Rows,
  Square,
  Columns2,
  NotebookPen,
} from 'lucide-react';
import type { DocumentInfo, ReadingTheme, ViewMode } from '../../lib/types/index';
import { MAX_ZOOM } from '../../lib/pdf/zoomLimits';
import { handleTitlebarMouseDown } from '../../utils/tauriBridge';

interface HeaderProps {
  docInfo: DocumentInfo | null;
  currentPage: number;
  numPages: number;
  zoom: number;
  activeDocumentName?: string | null;
  canUsePageActions?: boolean;
  viewMode: ViewMode;
  theme: ReadingTheme;
  isZenMode: boolean;
  isSearchOpen: boolean;
  isAiPanelOpen?: boolean;
  annotationCount?: number;
  saveStatus?: 'saved' | 'saving' | 'error';
  onOpenDashboard?: () => void;
  onToggleSearch: () => void;
  onToggleAiPanel?: () => void;
  onToggleInvert: () => void;
  onOpenThemeModal: () => void;
  onToggleZen: () => void;
  onToggleShortcuts: () => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onChangeZoom: (newZoom: number) => void;
  /** Animated +/- zoom when the active pane supports it. */
  onZoomStep?: (delta: number) => void;
  onFitPage: (mode?: 'page' | 'width') => void;
  onPageChange: (page: number) => void;
  onCopyPageText?: () => void;
  onCopyPageJpg?: () => void;
  isNotebookPanelOpen?: boolean;
  onToggleNotebooks?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  docInfo,
  currentPage,
  numPages,
  zoom,
  activeDocumentName,
  canUsePageActions = true,
  viewMode,
  theme,
  isZenMode,
  isSearchOpen,
  onOpenDashboard,
  onToggleSearch,
  onToggleInvert,
  onOpenThemeModal,
  onToggleZen,
  onChangeViewMode,
  onChangeZoom,
  onZoomStep,
  onFitPage,
  onPageChange,
  onCopyPageText,
  onCopyPageJpg,
  isNotebookPanelOpen = false,
  onToggleNotebooks,
}) => {
  const [pageInputText, setPageInputText] = React.useState<string>(String(currentPage));

  const [viewModeIndicatorStyle, setViewModeIndicatorStyle] = React.useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    opacity: number;
  }>({ left: 0, top: 0, width: 0, height: 0, opacity: 0 });

  const viewModeRefs = React.useRef<Map<ViewMode, HTMLButtonElement>>(new Map());

  React.useLayoutEffect(() => {
    const updateIndicator = () => {
      const activeEl = viewModeRefs.current.get(viewMode);
      if (activeEl) {
        setViewModeIndicatorStyle({
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
  }, [viewMode]);

  React.useEffect(() => {
    setPageInputText(String(currentPage));
  }, [currentPage]);

  const handlePageInputCommit = () => {
    const val = parseInt(pageInputText, 10);
    if (!isNaN(val) && val >= 1 && val <= numPages) {
      onPageChange(val);
    } else {
      setPageInputText(String(currentPage));
    }
  };

  if (isZenMode) {
    return (
      <div className="fixed top-3 right-3 z-50 flex items-center gap-2 opacity-60 transition-opacity hover:opacity-100">
        <button
          onClick={onToggleZen}
          className="btn-secondary px-3 py-1.5 shadow-lg"
          title="Exit Zen Mode (F)"
        >
          <Minimize2 className="h-3.5 w-3.5" />
          <span>Exit Zen</span>
        </button>
      </div>
    );
  }

  const isInverted = ['invert', 'oled', 'nord', 'matrix'].includes(theme);

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleTitlebarMouseDown}
      className="macos-titlebar reader-titlebar app-drag-region z-30 h-12 cursor-default px-3.5 text-xs select-none"
    >
      <div
        className="reader-titlebar-left flex min-w-0 items-center gap-2.5"
        data-tauri-drag-region
      >
        {/* Spacer for native macOS traffic lights on desktop */}
        <div
          className="macos-window-controls-spacer shrink-0"
          aria-hidden="true"
          data-tauri-drag-region
        />

        {onOpenDashboard && (
          <button
            onClick={onOpenDashboard}
            className="macos-topbar-icon app-no-drag"
            title="Back to Library (Cmd+L)"
            data-tauri-drag-region="false"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        )}
        {(activeDocumentName || docInfo?.fileName) && (
          <>
            <span
              className="reader-toolbar-divider shrink-0"
              aria-hidden="true"
              data-tauri-drag-region
            />
            <span
              className="truncate text-[12px] font-medium text-zinc-200"
              title={activeDocumentName || docInfo?.fileName}
              data-tauri-drag-region
            >
              {activeDocumentName || docInfo?.fileName}
            </span>
          </>
        )}
      </div>

      <div className="reader-titlebar-center min-w-0" data-tauri-drag-region>
        {numPages > 0 && (
          <div
            className="macos-toolbar-group macos-page-control app-no-drag flex items-center gap-1.5 px-3 py-1"
            data-tauri-drag-region="false"
          >
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pageInputText}
              onChange={(e) => setPageInputText(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handlePageInputCommit();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onBlur={handlePageInputCommit}
              style={{
                width: `${Math.max(32, String(pageInputText || numPages).length * 8 + 18)}px`,
              }}
              className="[appearance:textfield] rounded-md bg-transparent px-1.5 py-0.5 text-center font-mono text-[11px] font-medium text-zinc-200 focus:ring-1 focus:ring-blue-500 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="font-mono text-[11px] text-zinc-500">/</span>
            <span className="pr-1.5 font-mono text-[11px] text-zinc-400">{numPages}</span>
            {canUsePageActions && (
              <>
                <div className="macos-toolbar-group-separator" />
                <button
                  onClick={onCopyPageText}
                  className="macos-reader-inline-action"
                  title={`Copy all text from Page ${currentPage} (Cmd+Shift+C)`}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onCopyPageJpg}
                  className="macos-reader-inline-action"
                  title={`Copy / Save Page ${currentPage} as JPG image (Cmd+Shift+J)`}
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="reader-titlebar-actions app-no-drag flex items-center gap-1.5 justify-self-end">
        <div className="reader-display-actions flex items-center gap-1.5">
          <button
            onClick={onToggleSearch}
            className={`macos-topbar-icon ${isSearchOpen ? 'bg-black/5 text-[var(--primary)] dark:bg-white/10' : ''}`}
            title="Search in PDF (Cmd+F)"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          {onToggleNotebooks && (
            <button
              type="button"
              onClick={onToggleNotebooks}
              className={`macos-topbar-icon ${isNotebookPanelOpen ? 'bg-black/5 text-[var(--primary)] dark:bg-white/10' : ''}`}
              title="Notebooks"
              aria-label="Notebooks"
              aria-pressed={isNotebookPanelOpen}
              aria-expanded={isNotebookPanelOpen}
              aria-controls="reader-notebooks-panel"
            >
              <NotebookPen className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onToggleInvert}
            className="macos-topbar-icon"
            title={
              isInverted
                ? 'Use light appearance (Cmd+Shift+L)'
                : 'Use dark appearance (Cmd+Shift+L)'
            }
          >
            {isInverted ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-zinc-400" />
            )}
          </button>
          <button
            onClick={onOpenThemeModal}
            className="macos-topbar-icon"
            title="Display Themes & Filters"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* View Mode Segmented Controls with Smooth Sliding Highlighter Box */}
        <div className="macos-segmented-group relative flex hidden items-center gap-0.5 rounded-lg p-1 md:flex">
          <div
            className="macos-tab-sliding-indicator"
            style={{
              transform: `translate3d(${viewModeIndicatorStyle.left}px, ${viewModeIndicatorStyle.top}px, 0)`,
              width: `${viewModeIndicatorStyle.width}px`,
              height: `${viewModeIndicatorStyle.height}px`,
              opacity: viewModeIndicatorStyle.opacity,
            }}
          />

          <button
            ref={(el) => {
              if (el) viewModeRefs.current.set('continuous', el);
              else viewModeRefs.current.delete('continuous');
            }}
            onClick={() => onChangeViewMode('continuous')}
            className={`relative z-10 rounded-md p-1.5 text-xs transition-colors ${
              viewMode === 'continuous'
                ? 'font-semibold text-blue-500 dark:text-blue-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Continuous Scroll (Cmd/Ctrl+Shift+3)"
            aria-label="Continuous scroll"
            aria-pressed={viewMode === 'continuous'}
          >
            <Rows className="h-3.5 w-3.5" />
          </button>
          <button
            ref={(el) => {
              if (el) viewModeRefs.current.set('single', el);
              else viewModeRefs.current.delete('single');
            }}
            onClick={() => onChangeViewMode('single')}
            className={`relative z-10 rounded-md p-1.5 text-xs transition-colors ${
              viewMode === 'single'
                ? 'font-semibold text-blue-500 dark:text-blue-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Single Page (Cmd/Ctrl+Shift+1)"
            aria-label="Single page"
            aria-pressed={viewMode === 'single'}
          >
            <Square className="h-3.5 w-3.5" />
          </button>
          <button
            ref={(el) => {
              if (el) viewModeRefs.current.set('spread', el);
              else viewModeRefs.current.delete('spread');
            }}
            onClick={() => onChangeViewMode('spread')}
            className={`relative z-10 rounded-md p-1.5 text-xs transition-colors ${
              viewMode === 'spread'
                ? 'font-semibold text-blue-500 dark:text-blue-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Side by Side (Cmd/Ctrl+Shift+2)"
            aria-label="Side-by-side pages"
            aria-pressed={viewMode === 'spread'}
          >
            <Columns2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <span className="reader-toolbar-divider hidden sm:block" aria-hidden="true" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-0.5 font-mono text-[11px] text-zinc-300">
          <button
            onClick={() =>
              onZoomStep ? onZoomStep(-0.15) : onChangeZoom(Math.max(0.4, zoom - 0.15))
            }
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            title="Zoom Out (Cmd -)"
          >
            -
          </button>
          <button
            onMouseDown={(event) => {
              if (event.metaKey || event.ctrlKey) {
                event.preventDefault();
                onFitPage(event.shiftKey ? 'width' : 'page');
              }
            }}
            onDoubleClick={(event) => {
              if (!event.metaKey && !event.ctrlKey) {
                onChangeZoom(1.0);
              }
            }}
            className="min-w-[2.25rem] cursor-pointer rounded-md px-1.5 py-0.5 text-center text-zinc-300 transition-colors hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            title="Double-click to reset to 100%; Cmd/Ctrl-click to fit page; Cmd/Ctrl-Shift-click to fit width"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() =>
              onZoomStep ? onZoomStep(0.15) : onChangeZoom(Math.min(MAX_ZOOM, zoom + 0.15))
            }
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            title="Zoom In (Cmd +)"
          >
            +
          </button>
        </div>

        {/* Fullscreen Focus (Zen Mode) */}
        <button
          onClick={onToggleZen}
          className="macos-topbar-icon hidden lg:inline-flex"
          title="Fullscreen Focus (F)"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
};
