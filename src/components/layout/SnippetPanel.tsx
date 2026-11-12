import React, { useState } from 'react';
import {
  Crop,
  Copy,
  Download,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  Minus,
  SlidersHorizontal,
  ExternalLink,
  Layers,
  Undo2,
  Redo2,
} from 'lucide-react';
import type { SnippetDividerEntry, SnippetEntry, StitchOptions } from '../../lib/types/index';

interface SnippetPanelProps {
  snippets: SnippetEntry[];
  isSnipActive: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleSnipTool: () => void;
  onAddDivider: (afterId?: string, label?: string) => void;
  onRemoveEntry: (id: string) => void;
  onMoveEntry: (id: string, direction: 'up' | 'down') => void;
  onUpdateDivider: (id: string, updates: Partial<SnippetDividerEntry>) => void;
  onUpdateSnippetLabel: (id: string, label: string) => void;
  onClearAll: () => void;
  onJumpToPage: (pageNumber: number) => void;
  onCopyStitchedImage: (options?: StitchOptions) => Promise<boolean>;
  onDownloadStitchedImage: (options?: StitchOptions) => Promise<boolean>;
  showToast: (text: string, isError?: boolean) => void;
}

export const SnippetPanel: React.FC<SnippetPanelProps> = ({
  snippets,
  isSnipActive,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onToggleSnipTool,
  onAddDivider,
  onRemoveEntry,
  onMoveEntry,
  onUpdateDivider,
  onUpdateSnippetLabel,
  onClearAll,
  onJumpToPage,
  onCopyStitchedImage,
  onDownloadStitchedImage,
  showToast,
}) => {
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff');
  const [includePageBadges, setIncludePageBadges] = useState<boolean>(true);

  const stitchOptions: StitchOptions = {
    backgroundColor,
    includePageBadges,
    padding: 24,
    gap: 18,
  };

  const handleCopy = async () => {
    if (snippets.length === 0) {
      showToast('No snippets to copy. Draw a rectangle to snip first.', true);
      return;
    }
    setIsCopying(true);
    try {
      const ok = await onCopyStitchedImage(stitchOptions);
      if (ok) {
        showToast('Copied stitched snippet image to clipboard!');
      } else {
        showToast('Failed to copy to clipboard', true);
      }
    } catch {
      showToast('Failed to copy stitched image', true);
    } finally {
      setIsCopying(false);
    }
  };

  const handleDownload = async () => {
    if (snippets.length === 0) {
      showToast('No snippets to save. Draw a rectangle to snip first.', true);
      return;
    }
    setIsDownloading(true);
    try {
      const ok = await onDownloadStitchedImage(stitchOptions);
      if (ok) {
        showToast('Saved stitched snippet image!');
      } else {
        showToast('Failed to save image', true);
      }
    } catch {
      showToast('Failed to save image', true);
    } finally {
      setIsDownloading(false);
    }
  };

  const imageCount = snippets.filter((s) => s.type === 'image').length;

  return (
    <div className="flex h-full flex-col text-xs select-none">
      {/* Top Banner / Snip Mode Toggle */}
      <div className="flex flex-col gap-2 border-b border-[var(--border)] bg-[var(--background)] p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
            <Layers className="h-4 w-4 text-blue-500" />
            <span>AI Snippet Compactor</span>
          </div>
          <div className="flex items-center gap-1">
            {onUndo && (
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="rounded-md p-1 text-zinc-400 transition-all hover:bg-black/5 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/5"
                title="Undo Snippet Action (Cmd+Z)"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
            )}
            {onRedo && (
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className="rounded-md p-1 text-zinc-400 transition-all hover:bg-black/5 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/5"
                title="Redo Snippet Action (Cmd+Shift+Z / Cmd+Y)"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 font-mono text-[10.5px] font-medium text-zinc-400">
              {imageCount} {imageCount === 1 ? 'snip' : 'snips'}
            </span>
          </div>
        </div>

        <button
          onClick={onToggleSnipTool}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
            isSnipActive
              ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(59,130,246,0.35)] ring-1 ring-blue-400 hover:bg-blue-500'
              : 'border border-[var(--border)] bg-[var(--card)] text-zinc-200 shadow-xs hover:bg-[var(--secondary)]'
          }`}
        >
          <Crop className="h-3.5 w-3.5" />
          <span>{isSnipActive ? 'Snip Active (Drag on page)' : 'Snip New Rectangle'}</span>
        </button>
      </div>

      {/* Snippet List Content */}
      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {snippets.length === 0 ? (
          <div className="my-auto flex flex-col items-center justify-center gap-3 p-6 text-center text-zinc-400">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--secondary)] text-zinc-300 shadow-xs">
              <Crop className="h-5 w-5 text-blue-500" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-200">No Snippets Yet</p>
              <p className="text-[11px] leading-relaxed text-zinc-400">
                Click <span className="font-medium text-blue-500">Snip New Rectangle</span> and drag
                over formulas, tables, or charts on any page to collect them here.
              </p>
            </div>
          </div>
        ) : (
          snippets.map((entry, index) => {
            const isFirst = index === 0;
            const isLast = index === snippets.length - 1;

            if (entry.type === 'divider') {
              return (
                <div
                  key={entry.id}
                  className="group flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] p-2.5 transition-all"
                >
                  <Minus className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  <input
                    type="text"
                    value={entry.label || ''}
                    onChange={(e) => onUpdateDivider(entry.id, { label: e.target.value })}
                    placeholder="Divider label (optional)..."
                    className="flex-1 bg-transparent text-[11px] text-zinc-200 placeholder:text-zinc-500 focus:text-white focus:outline-none"
                  />

                  {/* Divider Actions */}
                  <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => onMoveEntry(entry.id, 'up')}
                      disabled={isFirst}
                      className="rounded-md p-1 text-zinc-400 hover:bg-black/5 hover:text-white disabled:opacity-20 dark:hover:bg-white/10"
                      title="Move Up"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onMoveEntry(entry.id, 'down')}
                      disabled={isLast}
                      className="rounded-md p-1 text-zinc-400 hover:bg-black/5 hover:text-white disabled:opacity-20 dark:hover:bg-white/10"
                      title="Move Down"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onRemoveEntry(entry.id)}
                      className="rounded-md p-1 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                      title="Remove Divider"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            }

            // Image Snippet Card
            return (
              <div
                key={entry.id}
                className="group relative flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-xs transition-all hover:border-zinc-400/40"
              >
                {/* Header info strip */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => onJumpToPage(entry.pageNumber)}
                    className="flex items-center gap-1 font-mono text-[10.5px] font-medium text-zinc-400 transition-colors hover:text-blue-500"
                    title={`Jump to Page ${entry.pageNumber}`}
                  >
                    <span className="font-semibold text-zinc-300">P.{entry.pageNumber}</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </button>

                  {/* Reorder and Delete Controls */}
                  <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => onMoveEntry(entry.id, 'up')}
                      disabled={isFirst}
                      className="rounded-md p-1 text-zinc-400 hover:bg-black/5 hover:text-white disabled:opacity-20 dark:hover:bg-white/10"
                      title="Move Up"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onMoveEntry(entry.id, 'down')}
                      disabled={isLast}
                      className="rounded-md p-1 text-zinc-400 hover:bg-black/5 hover:text-white disabled:opacity-20 dark:hover:bg-white/10"
                      title="Move Down"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onAddDivider(entry.id)}
                      className="rounded-md p-1 text-zinc-400 hover:bg-black/5 hover:text-zinc-200 dark:hover:bg-white/10"
                      title="Insert Divider Below"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onRemoveEntry(entry.id)}
                      className="rounded-md p-1 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                      title="Remove Snippet"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Thumbnail Preview */}
                <div className="flex max-h-36 w-full items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-2xs">
                  <img
                    src={entry.dataUrl}
                    alt={entry.label || `Snippet Page ${entry.pageNumber}`}
                    className="max-h-36 max-w-full object-contain"
                  />
                </div>

                {/* Optional custom label */}
                <input
                  type="text"
                  value={entry.label || ''}
                  onChange={(e) => onUpdateSnippetLabel(entry.id, e.target.value)}
                  placeholder={`Label (e.g. Page ${entry.pageNumber})...`}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2 py-1 text-[10.5px] text-zinc-200 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Sticky Action Footer */}
      {snippets.length > 0 && (
        <div className="flex flex-col gap-2.5 border-t border-[var(--border)] bg-[var(--background)] p-3">
          {/* Settings Sub-row Toggle */}
          {showSettings && (
            <div className="animate-slide-down mb-1 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] p-2.5 shadow-xs">
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span>Background</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setBackgroundColor('#ffffff')}
                    className={`rounded-md px-2 py-0.5 text-[10px] ${
                      backgroundColor === '#ffffff'
                        ? 'bg-blue-600 font-medium text-white shadow-2xs'
                        : 'bg-[var(--card)] text-zinc-400'
                    }`}
                  >
                    White
                  </button>
                  <button
                    onClick={() => setBackgroundColor('#1e1e24')}
                    className={`rounded-md px-2 py-0.5 text-[10px] ${
                      backgroundColor === '#1e1e24'
                        ? 'bg-blue-600 font-medium text-white shadow-2xs'
                        : 'bg-[var(--card)] text-zinc-400'
                    }`}
                  >
                    Dark
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span>Page Badges</span>
                <button
                  onClick={() => setIncludePageBadges((prev) => !prev)}
                  className={`rounded-md px-2 py-0.5 text-[10px] ${
                    includePageBadges
                      ? 'bg-blue-600 font-medium text-white shadow-2xs'
                      : 'bg-[var(--card)] text-zinc-400'
                  }`}
                >
                  {includePageBadges ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          )}

          {/* Quick Buttons Row */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onAddDivider()}
              className="btn-secondary flex flex-1 items-center justify-center gap-1.5 py-1.5 text-xs"
              title="Add a horizontal divider line"
            >
              <Minus className="h-3 w-3 text-zinc-400" />
              <span>Add Divider</span>
            </button>
            <button
              onClick={() => setShowSettings((prev) => !prev)}
              className={`btn-icon h-8 w-8 ${showSettings ? 'bg-black/5 text-blue-500 dark:bg-white/10' : ''}`}
              title="Stitch Settings"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClearAll}
              className="btn-icon h-8 w-8 text-red-400 hover:bg-red-500/20 hover:text-red-300"
              title="Dump / Clear All Snippets (Cmd+Shift+X / Cmd+Alt+X)"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Primary Copy Action */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={isCopying}
              className="btn-primary flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium shadow-md active:scale-98"
              title="Copy Stitched Image (Cmd+Shift+S / Cmd+Alt+C)"
            >
              {isCopying ? (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-white" />
              )}
              <span>Copy Stitched Image</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="btn-secondary flex w-9 items-center justify-center py-2"
              title="Download PNG"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
