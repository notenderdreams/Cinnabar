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
} from 'lucide-react';
import type { DocumentInfo, ReadingTheme, ViewMode } from '../utils/types';
import { isTauri, handleTitlebarMouseDown } from '../utils/tauriBridge';

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
  onFitPage: () => void;
  onPageChange: (page: number) => void;
  onCopyPageText?: () => void;
  onCopyPageJpg?: () => void;
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
  isAiPanelOpen = false,
  onOpenDashboard,
  onToggleSearch,
  onToggleAiPanel,
  onToggleInvert,
  onOpenThemeModal,
  onToggleZen,
  onChangeViewMode,
  onChangeZoom,
  onFitPage,
  onPageChange,
  onCopyPageText,
  onCopyPageJpg,
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
      <div className="fixed top-3 right-3 z-50 flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
        <button
          onClick={onToggleZen}
          className="btn-secondary px-3 py-1.5 shadow-lg"
          title="Exit Zen Mode (F)"
        >
          <Minimize2 className="w-3.5 h-3.5" />
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
      className="macos-titlebar reader-titlebar h-12 px-3.5 z-30 select-none app-drag-region text-xs cursor-default"
    >
      <div className="reader-titlebar-left flex items-center gap-2.5 min-w-0" data-tauri-drag-region>
        {/* Spacer for native macOS traffic lights on desktop */}
        {isTauri() && <div className="macos-window-controls-spacer shrink-0" aria-hidden="true" data-tauri-drag-region />}

        {onOpenDashboard && (
          <button
            onClick={onOpenDashboard}
            className="macos-topbar-icon app-no-drag"
            title="Back to Library (Cmd+L)"
            data-tauri-drag-region="false"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        )}
        {(activeDocumentName || docInfo?.fileName) && (
          <>
            <span className="reader-toolbar-divider shrink-0" aria-hidden="true" data-tauri-drag-region />
            <span
              className="font-medium truncate text-[12px] text-zinc-200"
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
          <div className="macos-toolbar-group macos-page-control flex items-center gap-1.5 px-3 py-1 app-no-drag" data-tauri-drag-region="false">
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
              className="text-center bg-transparent rounded-md px-1.5 py-0.5 text-zinc-200 font-mono text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-zinc-500 font-mono text-[11px]">/</span>
            <span className="font-mono text-zinc-400 text-[11px] pr-1.5">{numPages}</span>
            {canUsePageActions && (
              <>
                <div className="macos-toolbar-group-separator" />
                <button
                  onClick={onCopyPageText}
                  className="macos-reader-inline-action"
                  title={`Copy all text from Page ${currentPage} (Cmd+Shift+C)`}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onCopyPageJpg}
                  className="macos-reader-inline-action"
                  title={`Copy / Save Page ${currentPage} as JPG image (Cmd+Shift+J)`}
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="reader-titlebar-actions flex items-center gap-1.5 app-no-drag justify-self-end">
        <div className="reader-display-actions flex items-center gap-1.5">
          <button
            onClick={onToggleSearch}
            className={`macos-topbar-icon ${isSearchOpen ? 'text-[var(--primary)] bg-black/5 dark:bg-white/10' : ''}`}
            title="Search in PDF (Cmd+F)"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleInvert}
            className="macos-topbar-icon"
            title={isInverted ? 'Use light appearance (Cmd+Shift+L)' : 'Use dark appearance (Cmd+Shift+L)'}
          >
            {isInverted ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5 text-zinc-400" />}
          </button>
          <button
            onClick={onOpenThemeModal}
            className="macos-topbar-icon"
            title="Display Themes & Filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* View Mode Segmented Controls with Smooth Sliding Highlighter Box */}
        <div className="macos-segmented-group flex items-center gap-0.5 p-1 rounded-lg relative hidden md:flex">
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
            className={`relative z-10 p-1.5 rounded-md text-xs transition-colors ${
              viewMode === 'continuous'
                ? 'text-blue-500 dark:text-blue-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Continuous Scroll (Cmd/Ctrl+Shift+3)"
            aria-label="Continuous scroll"
            aria-pressed={viewMode === 'continuous'}
          >
            <Rows className="w-3.5 h-3.5" />
          </button>
          <button
            ref={(el) => {
              if (el) viewModeRefs.current.set('single', el);
              else viewModeRefs.current.delete('single');
            }}
            onClick={() => onChangeViewMode('single')}
            className={`relative z-10 p-1.5 rounded-md text-xs transition-colors ${
              viewMode === 'single'
                ? 'text-blue-500 dark:text-blue-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Single Page (Cmd/Ctrl+Shift+1)"
            aria-label="Single page"
            aria-pressed={viewMode === 'single'}
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          <button
            ref={(el) => {
              if (el) viewModeRefs.current.set('spread', el);
              else viewModeRefs.current.delete('spread');
            }}
            onClick={() => onChangeViewMode('spread')}
            className={`relative z-10 p-1.5 rounded-md text-xs transition-colors ${
              viewMode === 'spread'
                ? 'text-blue-500 dark:text-blue-400 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Side by Side (Cmd/Ctrl+Shift+2)"
            aria-label="Side-by-side pages"
            aria-pressed={viewMode === 'spread'}
          >
            <Columns2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="reader-toolbar-divider hidden sm:block" aria-hidden="true" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-0.5 font-mono text-[11px] text-zinc-300">
          <button
            onClick={() => onChangeZoom(Math.max(0.4, zoom - 0.15))}
            className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-[var(--foreground)] hover:bg-[var(--hover)] transition-colors"
            title="Zoom Out (Cmd -)"
          >
            -
          </button>
          <button
            onMouseDown={(event) => {
              if (event.metaKey || event.ctrlKey) {
                event.preventDefault();
                onFitPage();
              }
            }}
            onDoubleClick={(event) => {
              if (!event.metaKey && !event.ctrlKey) {
                onChangeZoom(1.0);
              }
            }}
            className="min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-center text-zinc-300 hover:text-[var(--foreground)] hover:bg-[var(--hover)] transition-colors cursor-pointer"
            title="Double-click to reset to 100%; Cmd/Ctrl-click to fit page"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => onChangeZoom(Math.min(3.0, zoom + 0.15))}
            className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-[var(--foreground)] hover:bg-[var(--hover)] transition-colors"
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
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
