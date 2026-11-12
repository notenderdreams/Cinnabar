import React from 'react';
import { X, RotateCcw, Check } from 'lucide-react';
import type { ReadingTheme, ThemeSettings } from '../../lib/types/index';

interface ColorThemeModalProps {
  isOpen: boolean;
  settings: ThemeSettings;
  onClose: () => void;
  onSelectTheme: (theme: ReadingTheme) => void;
  onUpdateSetting: <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => void;
  onResetFilters: () => void;
}

const THEMES: {
  id: ReadingTheme;
  name: string;
  desc: string;
  bgPreview: string;
  textPreview: string;
}[] = [
  {
    id: 'default',
    name: 'Original Paper',
    desc: 'Clean standard document view',
    bgPreview: 'bg-white',
    textPreview: 'text-zinc-900',
  },
  {
    id: 'invert',
    name: 'Smart Invert (Dark)',
    desc: 'Balanced chrominance dark mode',
    bgPreview: 'bg-[#18181b]',
    textPreview: 'text-zinc-200',
  },
  {
    id: 'oled',
    name: 'OLED Pitch Black',
    desc: 'Pure #000000 true black background',
    bgPreview: 'bg-[#000000]',
    textPreview: 'text-white',
  },
  {
    id: 'sepia',
    name: 'Eye-Care Warm Sepia',
    desc: '5200K tone for prolonged reading',
    bgPreview: 'bg-[#f6eee3]',
    textPreview: 'text-[#433422]',
  },
  {
    id: 'nord',
    name: 'Nord Slate Night',
    desc: 'Cool Arctic dark theme',
    bgPreview: 'bg-[#2e3440]',
    textPreview: 'text-[#eceff4]',
  },
  {
    id: 'matrix',
    name: 'High-Contrast Terminal',
    desc: 'Phosphor green matrix mode',
    bgPreview: 'bg-[#0d1a0d]',
    textPreview: 'text-[#39ff14]',
  },
];

export const ColorThemeModal: React.FC<ColorThemeModalProps> = ({
  isOpen,
  settings,
  onClose,
  onSelectTheme,
  onUpdateSetting,
  onResetFilters,
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
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 text-xs backdrop-blur-xs">
      <div className="animate-slide-down flex w-full max-w-md flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--popover)] p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
              Reading Themes & Color Invert
            </h3>
            <p className="text-[11px] text-zinc-400">Select reading palette and adjust luminance</p>
          </div>
          <button onClick={onClose} className="btn-icon h-7 w-7">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Theme Grid */}
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t) => {
            const isSelected = settings.theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onSelectTheme(t.id)}
                className={`flex flex-col gap-1 rounded-xl border p-2.5 text-left transition-all ${
                  isSelected
                    ? 'border-blue-500/80 bg-blue-500/10 shadow-xs ring-1 ring-blue-500'
                    : 'border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--card)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-3.5 w-3.5 rounded-full border border-white/20 shadow-xs ${t.bgPreview}`}
                    />
                    <span className="text-xs font-medium text-zinc-200">{t.name}</span>
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 text-blue-500" />}
                </div>
                <p className="text-[10px] leading-tight text-zinc-400">{t.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Brightness & Contrast Sliders */}
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)] p-3.5">
          <div className="flex items-center justify-between font-medium text-zinc-300">
            <span>Document Brightness</span>
            <span className="font-mono text-[11px] text-zinc-400">{settings.brightness}%</span>
          </div>
          <input
            type="range"
            min="60"
            max="140"
            value={settings.brightness}
            onChange={(e) => onUpdateSetting('brightness', parseInt(e.target.value, 10))}
            className="h-1 w-full cursor-pointer accent-blue-500"
          />

          <div className="mt-1 flex items-center justify-between font-medium text-zinc-300">
            <span>Document Contrast</span>
            <span className="font-mono text-[11px] text-zinc-400">{settings.contrast}%</span>
          </div>
          <input
            type="range"
            min="60"
            max="150"
            value={settings.contrast}
            onChange={(e) => onUpdateSetting('contrast', parseInt(e.target.value, 10))}
            className="h-1 w-full cursor-pointer accent-blue-500"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-1">
          <button onClick={onResetFilters} className="btn-ghost text-xs">
            <RotateCcw className="h-3 w-3" />
            <span>Reset</span>
          </button>

          <button onClick={onClose} className="btn-primary">
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
