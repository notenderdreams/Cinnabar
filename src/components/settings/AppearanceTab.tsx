import React from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { ReadingTheme, ThemeSettings } from '../../lib/types';
import { READING_THEMES } from '../../lib/constants/themes';

interface AppearanceTabProps {
  themeSettings?: ThemeSettings;
  onSelectTheme?: (theme: ReadingTheme) => void;
  onUpdateThemeSetting?: <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => void;
  onResetThemeFilters?: () => void;
}

export function AppearanceTab({
  themeSettings,
  onSelectTheme,
  onUpdateThemeSetting,
  onResetThemeFilters,
}: AppearanceTabProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">Reading & Color Themes</h3>
          <p className="text-zinc-400 text-[11px]">
            Select visual document filters and fine-tune contrast and brightness.
          </p>
        </div>
        {onResetThemeFilters && (
          <button
            type="button"
            onClick={onResetThemeFilters}
            className="btn-ghost flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200"
            title="Reset brightness, contrast, and grayscale"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Theme Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {READING_THEMES.map((t) => {
          const isSelected = themeSettings?.theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTheme?.(t.id)}
              className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-500 shadow-md ring-1 ring-blue-500'
                  : 'bg-[var(--card)] border-[var(--border)] hover:border-zinc-500/50 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <div className="w-full flex items-center justify-between mb-1.5">
                <span className={`font-semibold text-xs ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                  {t.name}
                </span>
                {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
              <div className={`w-full h-8 rounded-md ${t.bgPreview} border border-white/20 flex items-center justify-center p-1.5 shadow-inner`}>
                <span className={`text-[10px] font-serif font-bold ${t.textPreview}`}>Aa 123</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Brightness & Contrast Sliders */}
      {themeSettings && onUpdateThemeSetting && (
        <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Brightness</span>
              <span className="font-mono text-zinc-400 text-[11px]">{themeSettings.brightness}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="150"
              value={themeSettings.brightness}
              onChange={(e) => onUpdateThemeSetting('brightness', parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border)]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Contrast</span>
              <span className="font-mono text-zinc-400 text-[11px]">{themeSettings.contrast}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="150"
              value={themeSettings.contrast}
              onChange={(e) => onUpdateThemeSetting('contrast', parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border)]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Grayscale Mode</span>
              <span className="font-mono text-zinc-400 text-[11px]">{themeSettings.grayscale}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={themeSettings.grayscale}
              onChange={(e) => onUpdateThemeSetting('grayscale', parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
