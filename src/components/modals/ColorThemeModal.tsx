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
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in text-xs">
      <div className="w-full max-w-md bg-[var(--popover)] border border-[var(--border)] rounded-2xl p-5 shadow-2xl flex flex-col gap-4 animate-slide-down">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">
              Reading Themes & Color Invert
            </h3>
            <p className="text-[11px] text-zinc-400">
              Select reading palette and adjust luminance
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn-icon w-7 h-7"
          >
            <X className="w-4 h-4" />
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
                className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  isSelected
                    ? 'border-blue-500/80 bg-blue-500/10 ring-1 ring-blue-500 shadow-xs'
                    : 'border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--card)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-3.5 h-3.5 rounded-full border border-white/20 shadow-xs ${t.bgPreview}`}
                    />
                    <span className="font-medium text-zinc-200 text-xs">
                      {t.name}
                    </span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-500" />}
                </div>
                <p className="text-[10px] text-zinc-400 leading-tight">
                  {t.desc}
                </p>
              </button>
            );
          })}
        </div>

        {/* Brightness & Contrast Sliders */}
        <div className="p-3.5 rounded-xl bg-[var(--secondary)] border border-[var(--border)] flex flex-col gap-3">
          <div className="flex items-center justify-between font-medium text-zinc-300">
            <span>Document Brightness</span>
            <span className="font-mono text-zinc-400 text-[11px]">{settings.brightness}%</span>
          </div>
          <input
            type="range"
            min="60"
            max="140"
            value={settings.brightness}
            onChange={(e) => onUpdateSetting('brightness', parseInt(e.target.value, 10))}
            className="w-full accent-blue-500 cursor-pointer h-1"
          />

          <div className="flex items-center justify-between font-medium text-zinc-300 mt-1">
            <span>Document Contrast</span>
            <span className="font-mono text-zinc-400 text-[11px]">{settings.contrast}%</span>
          </div>
          <input
            type="range"
            min="60"
            max="150"
            value={settings.contrast}
            onChange={(e) => onUpdateSetting('contrast', parseInt(e.target.value, 10))}
            className="w-full accent-blue-500 cursor-pointer h-1"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onResetFilters}
            className="btn-ghost text-xs"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>

          <button
            onClick={onClose}
            className="btn-primary"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
