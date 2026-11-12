import React from 'react';
import { Layers, FileText, BookOpen } from 'lucide-react';
import type { ViewMode } from '../../lib/types';

interface GeneralTabProps {
  viewMode?: ViewMode;
  onChangeViewMode?: (mode: ViewMode) => void;
}

const VIEW_MODES: { id: ViewMode; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'continuous', label: 'Continuous Scroll', icon: Layers },
  { id: 'single', label: 'Single Page', icon: FileText },
  { id: 'spread', label: 'Side by Side', icon: BookOpen },
];

export function GeneralTab({ viewMode, onChangeViewMode }: GeneralTabProps) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-[var(--foreground)]">General Preferences</h3>
        <p className="text-[11px] leading-relaxed text-zinc-400">
          Configure document layout, reading behavior, and default startup preferences.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-zinc-200">Default Reading Layout</span>
          <span className="text-[11px] text-zinc-400">
            Choose how pages are presented when opening documents.
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1">
          {VIEW_MODES.map((mode) => {
            const Icon = mode.icon;
            const isCurrent = viewMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => onChangeViewMode?.(mode.id)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 text-center transition-all ${
                  isCurrent
                    ? 'border-blue-500 bg-blue-600 font-semibold text-white shadow-sm'
                    : 'border-[var(--border)] bg-[var(--secondary)] text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Icon className={`h-4 w-4 ${isCurrent ? 'text-white' : 'text-zinc-400'}`} />
                <span className="text-[11px]">{mode.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
