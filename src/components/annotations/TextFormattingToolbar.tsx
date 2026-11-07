import React from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AArrowDown,
  AArrowUp,
  Trash2,
  Check,
} from 'lucide-react';
import { HIGHLIGHT_COLOR_PRESETS } from '../../lib/annotations/highlightStyle';

interface TextFormattingToolbarProps {
  align?: 'left' | 'center' | 'right';
  onChangeAlign?: (align: 'left' | 'center' | 'right') => void;
  fontFamily?: 'sans' | 'serif' | 'mono' | string;
  onChangeFontFamily?: (font: 'sans' | 'serif' | 'mono') => void;
  fontSize?: number;
  onChangeFontSize?: (size: number) => void;
  colors?: readonly string[];
  color?: string;
  onChangeColor?: (color: string) => void;
  onDelete?: () => void;
  onDone?: () => void;
}

export const TextFormattingToolbar: React.FC<TextFormattingToolbarProps> = ({
  align = 'left',
  onChangeAlign,
  fontFamily = 'sans',
  onChangeFontFamily,
  fontSize = 14,
  onChangeFontSize,
  colors = HIGHLIGHT_COLOR_PRESETS,
  color = '#000000',
  onChangeColor,
  onDelete,
  onDone,
}) => {
  const currentFont = fontFamily === 'serif' || fontFamily === 'mono' ? fontFamily : 'sans';
  const currentAlign = align === 'center' || align === 'right' ? align : 'left';

  const btnBase =
    'w-5 h-5 rounded flex items-center justify-center transition-colors text-zinc-400 hover:text-zinc-200 hover:bg-[var(--secondary)]';
  const btnActive = 'bg-blue-500/20 text-blue-400 border border-blue-500/35';

  return (
    <div
      className="absolute -top-9 left-0 z-50 flex items-center gap-1.5 p-1 px-1.5 rounded-lg bg-[var(--popover)]/95 border border-[var(--border)] shadow-xl backdrop-blur-md pointer-events-auto select-none"
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. Alignment Icons */}
      {onChangeAlign && (
        <div className="flex items-center gap-0.5 pr-1.5 border-r border-[var(--border)]">
          <button
            type="button"
            onClick={() => onChangeAlign('left')}
            className={`${btnBase} ${currentAlign === 'left' ? btnActive : ''}`}
            title="Align Left"
            aria-label="Align Left"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onChangeAlign('center')}
            className={`${btnBase} ${currentAlign === 'center' ? btnActive : ''}`}
            title="Align Center"
            aria-label="Align Center"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onChangeAlign('right')}
            className={`${btnBase} ${currentAlign === 'right' ? btnActive : ''}`}
            title="Align Right"
            aria-label="Align Right"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Font Family Icons */}
      {onChangeFontFamily && (
        <div className="flex items-center gap-0.5 pr-1.5 border-r border-[var(--border)]">
          <button
            type="button"
            onClick={() => onChangeFontFamily('sans')}
            className={`${btnBase} ${currentFont === 'sans' ? btnActive : ''}`}
            title="Sans-serif Font"
            aria-label="Sans-serif Font"
          >
            <span className="font-sans font-semibold text-[11px] leading-none">Ag</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeFontFamily('serif')}
            className={`${btnBase} ${currentFont === 'serif' ? btnActive : ''}`}
            title="Serif Font"
            aria-label="Serif Font"
          >
            <span className="font-serif font-bold text-[11px] leading-none">Ag</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeFontFamily('mono')}
            className={`${btnBase} ${currentFont === 'mono' ? btnActive : ''}`}
            title="Monospace Font"
            aria-label="Monospace Font"
          >
            <span className="font-mono font-medium text-[11px] leading-none">Ag</span>
          </button>
        </div>
      )}

      {/* 3. Font Size Controls */}
      {onChangeFontSize && (
        <div className="flex items-center gap-0.5 pr-1.5 border-r border-[var(--border)]">
          <button
            type="button"
            disabled={fontSize <= 8}
            onClick={() => onChangeFontSize(Math.max(8, fontSize - 2))}
            className={`${btnBase} ${fontSize <= 8 ? 'opacity-30 cursor-not-allowed' : ''}`}
            title="Decrease Font Size"
            aria-label="Decrease Font Size"
          >
            <AArrowDown className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[10.5px] px-1 text-zinc-300 font-medium min-w-[16px] text-center">
            {fontSize}
          </span>
          <button
            type="button"
            disabled={fontSize >= 48}
            onClick={() => onChangeFontSize(Math.min(48, fontSize + 2))}
            className={`${btnBase} ${fontSize >= 48 ? 'opacity-30 cursor-not-allowed' : ''}`}
            title="Increase Font Size"
            aria-label="Increase Font Size"
          >
            <AArrowUp className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4. Color Swatches */}
      {onChangeColor && (
        <div className="flex items-center gap-1 pr-1.5 border-r border-[var(--border)]">
          {colors.map((c) => {
            const isChosen = color.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                onClick={() => onChangeColor(c)}
                className={`w-3.5 h-3.5 rounded-full border transition-transform hover:scale-115 ${
                  isChosen
                    ? 'ring-2 ring-blue-500 scale-115 border-white/80'
                    : 'border-black/30 dark:border-white/30 hover:border-white/60'
                }`}
                style={{ backgroundColor: c }}
                title={`Text color: ${c}`}
                aria-label={`Text color: ${c}`}
              />
            );
          })}
        </div>
      )}

      {/* 5. Delete Button */}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="w-5 h-5 rounded flex items-center justify-center text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Delete Text"
          aria-label="Delete Text"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* 6. Done / Check Button */}
      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="w-5 h-5 rounded flex items-center justify-center text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          title="Done"
          aria-label="Done"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
