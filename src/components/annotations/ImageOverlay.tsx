import React, { useRef, useState } from 'react';
import { Trash2, RotateCw, Sun, Moon, Copy, Check } from 'lucide-react';
import type { AttachedImageAnnotation, ReadingTheme, ToolType } from '../../lib/types/index';
import { tauriCopyTextToClipboard } from '../../utils/tauriBridge';
import { usesInvertedColorSpace } from '../../lib/theme/readingTheme';

interface ImageOverlayProps {
  annotation: AttachedImageAnnotation;
  isSelected: boolean;
  pageWidth: number;
  pageHeight: number;
  currentTheme: ReadingTheme;
  activeTool?: ToolType;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<AttachedImageAnnotation>) => void;
  onDelete: (id: string) => void;
  onSelectTool?: (tool: ToolType) => void;
}

export const ImageOverlay: React.FC<ImageOverlayProps> = ({
  annotation,
  isSelected,
  pageWidth,
  pageHeight,
  currentTheme,
  activeTool,
  onSelect,
  onUpdate,
  onDelete,
  onSelectTool,
}) => {
  const [copiedText, setCopiedText] = useState(false);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const initialAnnPosRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Pixel coordinates on current page canvas
  const leftPx = annotation.x * pageWidth;
  const topPx = annotation.y * pageHeight;
  const widthPx = annotation.width * pageWidth;
  const heightPx = annotation.height * pageHeight;

  const isDarkTheme = usesInvertedColorSpace(currentTheme);
  const wasAttachedInDark = Boolean(annotation.attachedInInvertedMode);
  const autoInvertEnabled =
    annotation.invertInLightMode !== undefined ? annotation.invertInLightMode : true; // Default auto-invert ON for adaptive reading

  // Compute CSS filter for the image so text/diagrams stay readable across both light and dark themes
  let imageFilterStyle: React.CSSProperties = {};
  if (autoInvertEnabled) {
    if (wasAttachedInDark && !isDarkTheme) {
      // Created in dark mode (light/white text) -> invert for white paper
      imageFilterStyle = { filter: 'invert(0.92) hue-rotate(180deg)' };
    } else if (!wasAttachedInDark && isDarkTheme) {
      // Created in light mode (dark text) -> invert for dark paper
      imageFilterStyle = { filter: 'invert(0.92) hue-rotate(180deg)' };
    }
  }

  const imageClassName =
    'w-full h-full object-contain pointer-events-none rounded transition-all duration-200';

  // Handle Dragging
  const handleMouseDownDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(annotation.id);
    isDraggingRef.current = true;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    initialAnnPosRef.current = {
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
    };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = (moveEvt.clientX - dragStartPosRef.current.x) / pageWidth;
      const dy = (moveEvt.clientY - dragStartPosRef.current.y) / pageHeight;

      const maxX = Math.max(0, 1 - initialAnnPosRef.current.width);
      const maxY = Math.max(0, 1 - initialAnnPosRef.current.height);

      const newX = Math.max(0, Math.min(initialAnnPosRef.current.x + dx, maxX));
      const newY = Math.max(0, Math.min(initialAnnPosRef.current.y + dy, maxY));

      onUpdate(annotation.id, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Handle Resizing (Bottom-Right handle)
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.stopPropagation();
    isResizingRef.current = true;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    initialAnnPosRef.current = {
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
    };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!isResizingRef.current) return;
      const dx = (moveEvt.clientX - dragStartPosRef.current.x) / pageWidth;
      const aspectRatio =
        annotation.aspectRatio ||
        (initialAnnPosRef.current.width * pageWidth) /
          (initialAnnPosRef.current.height * pageHeight) ||
        1.33;

      // Calculate maximum dimensions permitted by right and bottom page edges
      const maxAllowedWidth = Math.max(0.04, 1 - initialAnnPosRef.current.x);
      const maxAllowedHeight = Math.max(0.04, 1 - initialAnnPosRef.current.y);

      // Constrain width by bottom page edge while locking aspect ratio
      const maxWidthFromBottom = (maxAllowedHeight * pageHeight * aspectRatio) / pageWidth;
      const upperLimitWidth = Math.min(maxAllowedWidth, maxWidthFromBottom);

      const targetWidth = Math.max(
        0.04,
        Math.min(initialAnnPosRef.current.width + dx, upperLimitWidth),
      );
      const targetPixelWidth = targetWidth * pageWidth;
      const targetPixelHeight = targetPixelWidth / aspectRatio;
      const targetHeight = targetPixelHeight / pageHeight;

      onUpdate(annotation.id, {
        width: targetWidth,
        height: targetHeight,
      });
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleCopyRawText = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!annotation.extractedText) return;
    try {
      if (!(await tauriCopyTextToClipboard(annotation.extractedText))) return;
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: `${leftPx}px`,
        top: `${topPx}px`,
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        transform: annotation.rotation ? `rotate(${annotation.rotation}deg)` : undefined,
        opacity: annotation.opacity ?? 1,
        zIndex: isSelected ? 30 : 15,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (activeTool === 'eraser') {
          onDelete(annotation.id);
          onSelectTool?.('select');
        } else {
          onSelect(annotation.id);
        }
      }}
      onMouseDown={(e) => {
        if (activeTool === 'eraser') {
          e.stopPropagation();
          onDelete(annotation.id);
          onSelectTool?.('select');
        } else {
          handleMouseDownDrag(e);
        }
      }}
      className={`group transition-shadow select-none ${
        activeTool === 'eraser'
          ? 'cursor-pointer ring-2 ring-red-400 hover:opacity-40'
          : isSelected
            ? 'cursor-grab rounded-lg shadow-[0_0_20px_rgba(59,130,246,0.5)] ring-2 ring-blue-500 active:cursor-grabbing'
            : 'cursor-grab hover:ring-1 hover:ring-white/40 active:cursor-grabbing'
      }`}
    >
      {/* The Attached Image */}
      <img
        src={annotation.dataUrl}
        alt={annotation.name || 'Attached'}
        className={imageClassName}
        style={imageFilterStyle}
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          const naturalW = img.naturalWidth;
          const naturalH = img.naturalHeight;
          if (naturalW > 0 && naturalH > 0 && pageWidth > 0 && pageHeight > 0) {
            const actualRatio = naturalW / naturalH;
            if (!annotation.aspectRatio || Math.abs(annotation.aspectRatio - actualRatio) > 0.05) {
              const maxAllowedW = Math.max(0.04, 1 - annotation.x);
              const maxAllowedH = Math.max(0.04, 1 - annotation.y);
              const maxWidthFromBottom = (maxAllowedH * pageHeight * actualRatio) / pageWidth;
              const upperLimitW = Math.min(maxAllowedW, maxWidthFromBottom);

              const currentPixelW = Math.min(annotation.width, upperLimitW) * pageWidth;
              const correctedPixelH = currentPixelW / actualRatio;
              const correctedHeight = correctedPixelH / pageHeight;

              onUpdate(annotation.id, {
                aspectRatio: actualRatio,
                width: currentPixelW / pageWidth,
                height: correctedHeight,
              });
            }
          }
        }}
      />

      {/* Selection Handles and Quick Controls */}
      {isSelected && (
        <>
          {/* Quick Floating Action Bar on top */}
          <div
            className="animate-slide-up absolute -top-12 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-white/20 bg-[#141418]/95 p-1.5 whitespace-nowrap shadow-2xl backdrop-blur-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Copy Raw Text (available when rasterized from text region) */}
            {annotation.extractedText && (
              <button
                onClick={handleCopyRawText}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[10.5px] font-medium text-white shadow-xs transition-colors hover:bg-blue-500"
                title="Copy extracted raw text from this region"
              >
                {copiedText ? (
                  <Check className="h-3 w-3 text-white" />
                ) : (
                  <Copy className="h-3 w-3 text-white" />
                )}
                <span>{copiedText ? 'Copied' : 'Copy Text'}</span>
              </button>
            )}

            {/* Opacity slider */}
            <input
              type="range"
              min="20"
              max="100"
              value={Math.round((annotation.opacity ?? 1) * 100)}
              onChange={(e) =>
                onUpdate(annotation.id, { opacity: parseInt(e.target.value, 10) / 100 })
              }
              className="ml-1 h-1.5 w-12 cursor-pointer accent-blue-500"
              title="Image Opacity"
            />

            {/* Smart Auto-Invert Mode Toggle */}
            <button
              onClick={() => onUpdate(annotation.id, { invertInLightMode: !autoInvertEnabled })}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10.5px] font-medium transition-all ${
                autoInvertEnabled
                  ? 'border-blue-500/40 bg-blue-500/20 text-blue-300 shadow-xs'
                  : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white'
              }`}
              title={
                autoInvertEnabled
                  ? 'Auto-Invert: ACTIVE (Image dynamically adapts to light/dark themes)'
                  : 'Auto-Invert: OFF (Image remains static)'
              }
            >
              {autoInvertEnabled ? (
                <Moon className="h-3 w-3 text-blue-400" />
              ) : (
                <Sun className="h-3 w-3 text-zinc-400" />
              )}
              <span>{autoInvertEnabled ? 'Auto-Invert ON' : 'Auto-Invert OFF'}</span>
            </button>

            {/* Rotate */}
            <button
              onClick={() =>
                onUpdate(annotation.id, { rotation: ((annotation.rotation || 0) + 90) % 360 })
              }
              className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white"
              title="Rotate 90°"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>

            {/* Delete */}
            <button
              onClick={() => onDelete(annotation.id)}
              className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/20 hover:text-red-300"
              title="Delete Image"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Corner Resize Handles */}
          <div
            onMouseDown={handleMouseDownResize}
            className="absolute -right-2 -bottom-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-blue-500 shadow-md transition-transform hover:scale-125"
            title="Drag to resize"
          />
          <div className="pointer-events-none absolute -top-1.5 -left-1.5 h-3 w-3 rounded-full bg-blue-500/80" />
          <div className="pointer-events-none absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-blue-500/80" />
          <div className="pointer-events-none absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-full bg-blue-500/80" />
        </>
      )}
    </div>
  );
};
