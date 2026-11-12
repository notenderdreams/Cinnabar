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
          <h3 className="mb-1 text-sm font-semibold text-[var(--foreground)]">
            Reading & Color Themes
          </h3>
          <p className="text-[11px] text-zinc-400">
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
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Theme Grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {READING_THEMES.map((t) => {
          const isSelected = themeSettings?.theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTheme?.(t.id)}
              className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-600 text-white shadow-md ring-1 ring-blue-500'
                  : 'border-[var(--border)] bg-[var(--card)] hover:border-zinc-500/50 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <div className="mb-1.5 flex w-full items-center justify-between">
                <span
                  className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-zinc-200'}`}
                >
                  {t.name}
                </span>
                {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
              </div>
              <div
                className={`h-8 w-full rounded-md ${t.bgPreview} flex items-center justify-center border border-white/20 p-1.5 shadow-inner`}
              >
                <span className={`font-serif text-[10px] font-bold ${t.textPreview}`}>Aa 123</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Brightness & Contrast Sliders */}
      {themeSettings && onUpdateThemeSetting && (
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Brightness</span>
              <span className="font-mono text-[11px] text-zinc-400">
                {themeSettings.brightness}%
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="150"
              value={themeSettings.brightness}
              onChange={(e) => onUpdateThemeSetting('brightness', parseInt(e.target.value, 10))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-700 accent-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Contrast</span>
              <span className="font-mono text-[11px] text-zinc-400">{themeSettings.contrast}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="150"
              value={themeSettings.contrast}
              onChange={(e) => onUpdateThemeSetting('contrast', parseInt(e.target.value, 10))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-700 accent-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Grayscale Mode</span>
              <span className="font-mono text-[11px] text-zinc-400">
                {themeSettings.grayscale}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={themeSettings.grayscale}
              onChange={(e) => onUpdateThemeSetting('grayscale', parseInt(e.target.value, 10))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-700 accent-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
