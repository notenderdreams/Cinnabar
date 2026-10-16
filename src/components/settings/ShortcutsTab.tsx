import React from 'react';

export const SHORTCUT_GROUPS = [
  {
    title: 'Reading Layout',
    items: [
      { keys: ['Cmd / Ctrl', 'Shift', '1'], desc: 'Single Page' },
      { keys: ['Cmd / Ctrl', 'Shift', '2'], desc: 'Side-by-Side Pages' },
      { keys: ['Cmd / Ctrl', 'Shift', '3'], desc: 'Continuous Scroll' },
    ],
  },
  {
    title: 'Mouse & Gestures',
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
    items: [
      { keys: ['Cmd / Ctrl', 'Shift', 'H'], desc: 'Highlight Selected PDF Text' },
      { keys: ['L'], desc: 'Straight Line Highlighter' },
      { keys: ['U'], desc: 'Underline Selected Text / Tool' },
      { keys: ['1–8'], desc: 'Choose Highlight Palette Color' },
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
    items: [
      { keys: ['Cmd', ','], desc: 'Preferences & Settings' },
      { keys: ['Cmd', 'Shift', 'L'], desc: 'Toggle Light / Dark Mode' },
      { keys: ['Cmd', 'L'], desc: 'Toggle Library Dashboard' },
      { keys: ['Cmd', 'O'], desc: 'Open PDF File' },
      { keys: ['Cmd', 'S'], desc: 'Save Modified PDF' },
      { keys: ['Cmd', 'I'], desc: 'Invert Colors' },
      { keys: ['Cmd', 'F'], desc: 'Find Text in Document' },
      { keys: ['→', 'J'], desc: 'Next Page' },
      { keys: ['←', 'K'], desc: 'Previous Page' },
      { keys: ['F'], desc: 'Fullscreen Focus Mode' },
    ],
  },
];

export function ShortcutsTab() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">Keyboard Shortcuts</h3>
        <p className="text-zinc-400 text-[11px]">
          Quick reference for document navigation, tool selection, and editing.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 px-1">
              {group.title}
            </span>
            <div className="grid grid-cols-1 gap-1 p-2 rounded-xl bg-[var(--card)] border border-[var(--border)]">
              {group.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <span className="text-zinc-300 text-[11px]">{item.desc}</span>
                  <div className="flex items-center gap-1">
                    {item.keys.map((k, kIdx) => (
                      <kbd
                        key={kIdx}
                        className="px-1.5 py-0.5 text-[10px] font-mono font-medium text-zinc-300 bg-[var(--secondary)] border border-[var(--border)] rounded shadow-2xs"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
