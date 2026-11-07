import React from 'react';
import { X, Command, MousePointer, Highlighter, Compass } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    title: 'Mouse & Gestures',
    icon: MousePointer,
    items: [
      { keys: ['Double Click'], desc: 'Highlight / Remove Word Highlight' },
      { keys: ['Triple Click'], desc: 'Highlight / Remove Line Highlight' },
      { keys: ['Cmd / Ctrl', 'Wheel'], desc: 'Zoom In / Out Smoothly' },
      { keys: ['Pinch'], desc: 'Trackpad Pinch to Zoom' },
      { keys: ['Space', 'Drag'], desc: 'Pan / Hand Tool' },
      { keys: ['Middle Click', 'Drag'], desc: 'Pan Viewport' },
      { keys: ['Cmd', 'V'], desc: 'Paste Image at Mouse Cursor' },
    ],
  },
  {
    title: 'Annotation Tools',
    icon: Highlighter,
    items: [
      { keys: ['Cmd / Ctrl', 'Shift', 'H'], desc: 'Highlight Selected PDF Text' },
      { keys: ['L'], desc: 'Straight Line Highlighter' },
      { keys: ['U'], desc: 'Underline Selected Text / Tool' },
      { keys: ['1–8'], desc: 'Choose Palette Color' },
      { keys: ['H'], desc: 'Freehand Highlighter Pen' },
      { keys: ['R'], desc: 'Area Highlight Box' },
      { keys: ['P'], desc: 'Freehand Pen' },
      { keys: ['C'], desc: 'Snip & Compact for AI' },
      { keys: ['A'], desc: 'Explain PDF Region with AI' },
      { keys: ['T'], desc: 'Plain Text Tool' },
      { keys: ['N'], desc: 'Sticky Note Tool' },
      { keys: ['E'], desc: 'Eraser (Sweep / Click)' },
      { keys: ['V'], desc: 'Select / Pointer Tool' },
    ],
  },
  {
    title: 'Navigation & View',
    icon: Compass,
    items: [
      { keys: ['Cmd', ','], desc: 'Preferences & Settings' },
      { keys: ['Cmd', 'Shift', 'L'], desc: 'Toggle Light / Dark Mode' },
      { keys: ['Cmd', 'L'], desc: 'Toggle Library Dashboard' },
      { keys: ['Cmd', 'O'], desc: 'Open PDF File' },
      { keys: ['Cmd', 'S'], desc: 'Import & Export Annotations' },
      { keys: ['Cmd', 'I'], desc: 'Invert Colors' },
      { keys: ['Cmd', 'B'], desc: 'Toggle Reader Sidebar' },
      { keys: ['Cmd', 'F'], desc: 'Find Text in Document' },
      { keys: ['Cmd', 'Shift', 'C'], desc: 'Copy Page Text' },
      { keys: ['Cmd', 'Shift', 'J'], desc: 'Copy Page as Image' },
      { keys: ['Cmd', 'Shift', 'N'], desc: 'Add Blank Page Below' },
      { keys: ['Cmd', 'Shift', 'S'], desc: 'Copy Stitched Image' },
      { keys: ['Cmd', 'Shift', 'X'], desc: 'Dump All Snippets' },
      { keys: ['→', 'J'], desc: 'Next Page' },
      { keys: ['←', 'K'], desc: 'Previous Page' },
      { keys: ['Cmd', 'Enter'], desc: 'Toggle App Fullscreen' },
      { keys: ['F'], desc: 'Fullscreen Focus Mode (Zen)' },
    ],
  },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-fade-in text-xs">
      <div className="w-full max-w-4xl max-h-[90vh] bg-[var(--popover)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl flex flex-col gap-5 animate-slide-down overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 shadow-xs">
              <Command className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Keyboard & Mouse Shortcuts
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcut Groups separated by vertical lines */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--border)] items-start">
          {SHORTCUT_GROUPS.map((group, gIdx) => {
            const Icon = group.icon;
            return (
              <div
                key={gIdx}
                className={`flex flex-col gap-3 py-3 md:py-0 ${
                  gIdx === 0
                    ? 'md:pr-5'
                    : gIdx === SHORTCUT_GROUPS.length - 1
                    ? 'md:pl-5'
                    : 'md:px-5'
                }`}
              >
                {/* Group Header */}
                <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border)]/60">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-600 dark:text-zinc-300">
                      {group.title}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {group.items.length}
                  </span>
                </div>

                {/* Items List */}
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item, iIdx) => (
                    <div
                      key={iIdx}
                      className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      <span className="text-[11.5px] text-zinc-700 dark:text-zinc-300 font-normal leading-tight select-none truncate">
                        {item.desc}
                      </span>
                      <div className="flex items-center gap-1 shrink-0 justify-end ml-auto">
                        {item.keys.map((k, kIdx) => (
                          <kbd
                            key={kIdx}
                            className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-[10px] font-mono font-medium bg-[var(--card)] text-zinc-800 dark:text-zinc-200 border border-[var(--border)] rounded-md shadow-2xs leading-none select-none"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pro Tip note for Mouse & Gestures */}
                {group.title === 'Mouse & Gestures' && (
                  <div className="mt-2 p-2.5 rounded-lg bg-[var(--secondary)]/60 text-[10.5px] text-zinc-500 dark:text-zinc-400 leading-normal">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">Tip:</span> Hold <kbd className="px-1 py-0.2 bg-[var(--card)] border border-[var(--border)] rounded font-mono text-[9.5px]">Space</kbd> anywhere to grab and drag pages.
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-3 text-[11px] text-zinc-500">
          <div>
            Press <kbd className="px-1.5 py-0.5 bg-[var(--secondary)] border border-[var(--border)] rounded-md text-[10px] font-mono text-zinc-400">?</kbd> anytime to toggle shortcuts.
          </div>
          <div>
            Press <kbd className="px-1.5 py-0.5 bg-[var(--secondary)] border border-[var(--border)] rounded-md text-[10px] font-mono text-zinc-400">Esc</kbd> to close.
          </div>
        </div>
      </div>
    </div>
  );
};
