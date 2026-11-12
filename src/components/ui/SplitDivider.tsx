import { useRef } from 'react';

/** A quiet divider shared by the reader's horizontal split views. */
export function SplitDivider({
  value,
  onChange,
  label,
  minLeft = 240,
  minRight = 240,
  readTogether = false,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  minLeft?: number;
  minRight?: number;
  readTogether?: boolean;
}) {
  const drag = useRef<{ pointer: number; left: number; width: number } | null>(null);
  const clamp = (value: number, width: number) => {
    const left = Math.min(minLeft, width / 2) / width;
    const right = Math.min(minRight, width / 2) / width;
    return Math.max(left, Math.min(1 - right, value));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      className="reader-split-divider"
      data-read-together-divider={readTogether || undefined}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
        if (!bounds || bounds.width <= 0) return;
        event.preventDefault();
        event.stopPropagation();
        drag.current = { pointer: event.pointerId, left: bounds.left, width: bounds.width };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.resizing = 'true';
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (start?.pointer !== event.pointerId) return;
        onChange(clamp((event.clientX - start.left) / start.width, start.width - 6));
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointer !== event.pointerId) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        drag.current = null;
        delete event.currentTarget.dataset.resizing;
      }}
      onLostPointerCapture={(event) => {
        drag.current = null;
        delete event.currentTarget.dataset.resizing;
      }}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
        event.preventDefault();
        const width = event.currentTarget.parentElement?.clientWidth;
        if (width)
          onChange(
            clamp(
              event.key === 'Home' ? 0.5 : value + (event.key === 'ArrowLeft' ? -0.025 : 0.025),
              width,
            ),
          );
      }}
    />
  );
}
