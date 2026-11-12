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
      className="pointer-events-auto absolute -top-9 left-0 z-50 flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--popover)]/95 p-1 px-1.5 shadow-xl backdrop-blur-md select-none"
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
        <div className="flex items-center gap-0.5 border-r border-[var(--border)] pr-1.5">
          <button
            type="button"
            onClick={() => onChangeAlign('left')}
            className={`${btnBase} ${currentAlign === 'left' ? btnActive : ''}`}
            title="Align Left"
            aria-label="Align Left"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onChangeAlign('center')}
            className={`${btnBase} ${currentAlign === 'center' ? btnActive : ''}`}
            title="Align Center"
            aria-label="Align Center"
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onChangeAlign('right')}
            className={`${btnBase} ${currentAlign === 'right' ? btnActive : ''}`}
            title="Align Right"
            aria-label="Align Right"
          >
            <AlignRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 2. Font Family Icons */}
      {onChangeFontFamily && (
        <div className="flex items-center gap-0.5 border-r border-[var(--border)] pr-1.5">
          <button
            type="button"
            onClick={() => onChangeFontFamily('sans')}
            className={`${btnBase} ${currentFont === 'sans' ? btnActive : ''}`}
            title="Sans-serif Font"
            aria-label="Sans-serif Font"
          >
            <span className="font-sans text-[11px] leading-none font-semibold">Ag</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeFontFamily('serif')}
            className={`${btnBase} ${currentFont === 'serif' ? btnActive : ''}`}
            title="Serif Font"
            aria-label="Serif Font"
          >
            <span className="font-serif text-[11px] leading-none font-bold">Ag</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeFontFamily('mono')}
            className={`${btnBase} ${currentFont === 'mono' ? btnActive : ''}`}
            title="Monospace Font"
            aria-label="Monospace Font"
          >
            <span className="font-mono text-[11px] leading-none font-medium">Ag</span>
          </button>
        </div>
      )}

      {/* 3. Font Size Controls */}
      {onChangeFontSize && (
        <div className="flex items-center gap-0.5 border-r border-[var(--border)] pr-1.5">
          <button
            type="button"
            disabled={fontSize <= 8}
            onClick={() => onChangeFontSize(Math.max(8, fontSize - 2))}
            className={`${btnBase} ${fontSize <= 8 ? 'cursor-not-allowed opacity-30' : ''}`}
            title="Decrease Font Size"
            aria-label="Decrease Font Size"
          >
            <AArrowDown className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[16px] px-1 text-center font-mono text-[10.5px] font-medium text-zinc-300">
            {fontSize}
          </span>
          <button
            type="button"
            disabled={fontSize >= 48}
            onClick={() => onChangeFontSize(Math.min(48, fontSize + 2))}
            className={`${btnBase} ${fontSize >= 48 ? 'cursor-not-allowed opacity-30' : ''}`}
            title="Increase Font Size"
            aria-label="Increase Font Size"
          >
            <AArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 4. Color Swatches */}
      {onChangeColor && (
        <div className="flex items-center gap-1 border-r border-[var(--border)] pr-1.5">
          {colors.map((c) => {
            const isChosen = color.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                onClick={() => onChangeColor(c)}
                className={`h-3.5 w-3.5 rounded-full border transition-transform hover:scale-115 ${
                  isChosen
                    ? 'scale-115 border-white/80 ring-2 ring-blue-500'
                    : 'border-black/30 hover:border-white/60 dark:border-white/30'
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
          className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
          title="Delete Text"
          aria-label="Delete Text"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* 6. Done / Check Button */}
      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-emerald-500/10 hover:text-emerald-400"
          title="Done"
          aria-label="Done"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};
