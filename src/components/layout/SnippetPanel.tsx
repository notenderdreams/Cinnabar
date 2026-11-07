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
    <div className="flex flex-col h-full select-none text-xs">
      {/* Top Banner / Snip Mode Toggle */}
      <div className="p-3 border-b border-[var(--border)] flex flex-col gap-2 bg-[var(--background)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
            <Layers className="w-4 h-4 text-blue-500" />
            <span>AI Snippet Compactor</span>
          </div>
          <div className="flex items-center gap-1">
            {onUndo && (
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Undo Snippet Action (Cmd+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
            )}
            {onRedo && (
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Redo Snippet Action (Cmd+Shift+Z / Cmd+Y)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            )}
            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--secondary)] text-zinc-400 font-mono font-medium border border-[var(--border)]">
              {imageCount} {imageCount === 1 ? 'snip' : 'snips'}
            </span>
          </div>
        </div>

        <button
          onClick={onToggleSnipTool}
          className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
            isSnipActive
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.35)] ring-1 ring-blue-400'
              : 'bg-[var(--card)] hover:bg-[var(--secondary)] text-zinc-200 border border-[var(--border)] shadow-xs'
          }`}
        >
          <Crop className="w-3.5 h-3.5" />
          <span>{isSnipActive ? 'Snip Active (Drag on page)' : 'Snip New Rectangle'}</span>
        </button>
      </div>

      {/* Snippet List Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {snippets.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-6 my-auto text-zinc-400 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-center text-zinc-300 shadow-xs">
              <Crop className="w-5 h-5 text-blue-500" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-200">No Snippets Yet</p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Click <span className="text-blue-500 font-medium">Snip New Rectangle</span> and drag over formulas, tables, or charts on any page to collect them here.
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
                  className="p-2.5 rounded-xl bg-[var(--secondary)] border border-[var(--border)] flex items-center gap-2 group transition-all"
                >
                  <Minus className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <input
                    type="text"
                    value={entry.label || ''}
                    onChange={(e) => onUpdateDivider(entry.id, { label: e.target.value })}
                    placeholder="Divider label (optional)..."
                    className="flex-1 bg-transparent text-[11px] text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:text-white"
                  />

                  {/* Divider Actions */}
                  <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onMoveEntry(entry.id, 'up')}
                      disabled={isFirst}
                      className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-20"
                      title="Move Up"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onMoveEntry(entry.id, 'down')}
                      disabled={isLast}
                      className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-20"
                      title="Move Down"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onRemoveEntry(entry.id)}
                      className="p-1 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/20"
                      title="Remove Divider"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            }

            // Image Snippet Card
            return (
              <div
                key={entry.id}
                className="group relative rounded-xl bg-[var(--card)] border border-[var(--border)] hover:border-zinc-400/40 p-2.5 flex flex-col gap-2 transition-all shadow-xs"
              >
                {/* Header info strip */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => onJumpToPage(entry.pageNumber)}
                    className="flex items-center gap-1 text-[10.5px] font-mono text-zinc-400 hover:text-blue-500 transition-colors font-medium"
                    title={`Jump to Page ${entry.pageNumber}`}
                  >
                    <span className="font-semibold text-zinc-300">P.{entry.pageNumber}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>

                  {/* Reorder and Delete Controls */}
                  <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onMoveEntry(entry.id, 'up')}
                      disabled={isFirst}
                      className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-20"
                      title="Move Up"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onMoveEntry(entry.id, 'down')}
                      disabled={isLast}
                      className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-20"
                      title="Move Down"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onAddDivider(entry.id)}
                      className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10"
                      title="Insert Divider Below"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onRemoveEntry(entry.id)}
                      className="p-1 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/20"
                      title="Remove Snippet"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Thumbnail Preview */}
                <div className="w-full bg-white rounded-lg overflow-hidden border border-[var(--border)] flex items-center justify-center max-h-36 shadow-2xs">
                  <img
                    src={entry.dataUrl}
                    alt={entry.label || `Snippet Page ${entry.pageNumber}`}
                    className="max-w-full max-h-36 object-contain"
                  />
                </div>

                {/* Optional custom label */}
                <input
                  type="text"
                  value={entry.label || ''}
                  onChange={(e) => onUpdateSnippetLabel(entry.id, e.target.value)}
                  placeholder={`Label (e.g. Page ${entry.pageNumber})...`}
                  className="w-full bg-[var(--secondary)] border border-[var(--border)] rounded-md px-2 py-1 text-[10.5px] text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Sticky Action Footer */}
      {snippets.length > 0 && (
        <div className="p-3 border-t border-[var(--border)] bg-[var(--background)] flex flex-col gap-2.5">
          {/* Settings Sub-row Toggle */}
          {showSettings && (
            <div className="p-2.5 rounded-xl bg-[var(--secondary)] border border-[var(--border)] space-y-2 mb-1 animate-slide-down shadow-xs">
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span>Background</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setBackgroundColor('#ffffff')}
                    className={`px-2 py-0.5 rounded-md text-[10px] ${
                      backgroundColor === '#ffffff'
                        ? 'bg-blue-600 text-white font-medium shadow-2xs'
                        : 'bg-[var(--card)] text-zinc-400'
                    }`}
                  >
                    White
                  </button>
                  <button
                    onClick={() => setBackgroundColor('#1e1e24')}
                    className={`px-2 py-0.5 rounded-md text-[10px] ${
                      backgroundColor === '#1e1e24'
                        ? 'bg-blue-600 text-white font-medium shadow-2xs'
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
                  className={`px-2 py-0.5 rounded-md text-[10px] ${
                    includePageBadges
                      ? 'bg-blue-600 text-white font-medium shadow-2xs'
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
              className="flex-1 btn-secondary text-xs py-1.5 flex items-center justify-center gap-1.5"
              title="Add a horizontal divider line"
            >
              <Minus className="w-3 h-3 text-zinc-400" />
              <span>Add Divider</span>
            </button>
            <button
              onClick={() => setShowSettings((prev) => !prev)}
              className={`btn-icon w-8 h-8 ${showSettings ? 'bg-black/5 dark:bg-white/10 text-blue-500' : ''}`}
              title="Stitch Settings"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClearAll}
              className="btn-icon w-8 h-8 text-red-400 hover:text-red-300 hover:bg-red-500/20"
              title="Dump / Clear All Snippets (Cmd+Shift+X / Cmd+Alt+X)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Primary Copy Action */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={isCopying}
              className="flex-1 btn-primary py-2 text-xs flex items-center justify-center gap-1.5 font-medium shadow-md active:scale-98"
              title="Copy Stitched Image (Cmd+Shift+S / Cmd+Alt+C)"
            >
              {isCopying ? (
                <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-white" />
              )}
              <span>Copy Stitched Image</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="btn-secondary w-9 py-2 flex items-center justify-center"
              title="Download PNG"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
