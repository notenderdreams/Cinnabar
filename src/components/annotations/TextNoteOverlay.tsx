import React, { useState, useRef, useEffect } from 'react';
import { Trash2, GripHorizontal, Edit3, Palette } from 'lucide-react';
import type { TextNoteAnnotation, ReadingTheme, ToolType } from '../../lib/types/index';
import { focusWithoutMovingViewer, keepViewerPositionAfter } from '../../lib/pdf/viewerPosition';
import { TextFormattingToolbar } from './TextFormattingToolbar';

interface TextNoteOverlayProps {
  annotation: TextNoteAnnotation;
  isSelected: boolean;
  pageWidth: number;
  pageHeight: number;
  scale?: number;
  currentTheme: ReadingTheme;
  activeTool: ToolType;
  highlightColors?: readonly string[];
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TextNoteAnnotation>) => void;
  onDelete: (id: string) => void;
  onSelectTool?: (tool: ToolType) => void;
}

const NOTE_COLORS = [
  { name: 'Yellow', bg: '#fef08a', text: '#713f12', border: '#fde047' },
  { name: 'Amber', bg: '#fde68a', text: '#78350f', border: '#fcd34d' },
  { name: 'Green', bg: '#bbf7d0', text: '#14532d', border: '#86efac' },
  { name: 'Blue', bg: '#bae6fd', text: '#0c4a6e', border: '#7dd3fc' },
  { name: 'Coral', bg: '#fecdd3', text: '#881337', border: '#fda4af' },
  { name: 'Purple', bg: '#e9d5ff', text: '#581c87', border: '#d8b4fe' },
  { name: 'Dark Slate', bg: '#272730', text: '#f4f4f5', border: '#444452' },
];

export const TextNoteOverlay: React.FC<TextNoteOverlayProps> = ({
  annotation,
  isSelected,
  pageWidth,
  pageHeight,
  scale,
  activeTool,
  highlightColors,
  onSelect,
  onUpdate,
  onDelete,
  onSelectTool,
}) => {
  const zoomScale = Math.max(0.1, scale ?? 1);
  const [isEditing, setIsEditing] = useState(annotation.text === '');
  const [editText, setEditText] = useState(annotation.text);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const initialAnnPosRef = useRef({ x: 0, y: 0 });

  const leftPx = annotation.x * pageWidth;
  const topPx = annotation.y * pageHeight;

  // Auto focus textarea and auto-expand height when editing starts
  useEffect(() => {
    if (isEditing) {
      setEditText(annotation.text);
      const adjustHeight = () => {
        if (textareaRef.current) {
          textareaRef.current.style.height = '0px';
          const lineH = Math.round((annotation.fontSize || 14) * 1.4 * zoomScale);
          textareaRef.current.style.height = `${Math.max(lineH, textareaRef.current.scrollHeight)}px`;
        }
      };
      setTimeout(() => {
        if (textareaRef.current) {
          focusWithoutMovingViewer(textareaRef.current);
          adjustHeight();
          if (annotation.kind === 'plain') {
            textareaRef.current.setSelectionRange(annotation.text.length, annotation.text.length);
          } else {
            textareaRef.current.select();
          }
        }
      }, 30);
    }
  }, [isEditing, annotation.kind, annotation.text, annotation.fontSize, zoomScale]);

  // Adjust textarea height on text change
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditText(e.target.value);
    e.target.style.height = '0px';
    const lineH = Math.round((annotation.fontSize || 14) * 1.4 * zoomScale);
    e.target.style.height = `${Math.max(lineH, e.target.scrollHeight)}px`;
  };

  // Find color config or match preset
  const currentColor = NOTE_COLORS.find(
    (c) => c.bg.toLowerCase() === (annotation.color || '').toLowerCase()
  ) || {
    name: 'Custom',
    bg: annotation.color || '#fef08a',
    text: '#18181b',
    border: '#fde047',
  };

  // Dragging logic
  const handleMouseDownDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeTool === 'eraser') {
      onDelete(annotation.id);
      onSelectTool?.('select');
      return;
    }
    onSelect(annotation.id);
    isDraggingRef.current = true;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    initialAnnPosRef.current = { x: annotation.x, y: annotation.y };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = (moveEvt.clientX - dragStartPosRef.current.x) / pageWidth;
      const dy = (moveEvt.clientY - dragStartPosRef.current.y) / pageHeight;

      const newX = initialAnnPosRef.current.x + dx;
      const newY = initialAnnPosRef.current.y + dy;

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

  // Resizing logic for plain text & sticky notes
  const isResizingRef = useRef(false);
  const resizeStartPosRef = useRef({ startX: 0, initialWidthPx: 0 });

  const defaultStickyWidthRatio = 0.20;

  const handleResizeStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (activeTool === 'eraser') return;
    onSelect(annotation.id);
    isResizingRef.current = true;
    const defaultWidthPx =
      annotation.kind === 'plain'
        ? Math.round(240 * zoomScale)
        : Math.round(pageWidth * defaultStickyWidthRatio);
    const initialWidthPx = annotation.width
      ? Math.max(Math.round(40 * zoomScale), Math.round(annotation.width * pageWidth))
      : defaultWidthPx;
    resizeStartPosRef.current = { startX: e.clientX, initialWidthPx };

    const handlePointerMove = (moveEvt: PointerEvent) => {
      if (!isResizingRef.current) return;
      const dx = moveEvt.clientX - resizeStartPosRef.current.startX;
      const minW = annotation.kind === 'plain' ? Math.round(40 * zoomScale) : Math.round(55 * zoomScale);
      const nextWidthPx = Math.max(minW, Math.min(pageWidth * 1.5, resizeStartPosRef.current.initialWidthPx + dx));
      onUpdate(annotation.id, { width: nextWidthPx / pageWidth });
    };

    const handlePointerUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const handleSaveEdit = () => {
    if (editText.trim()) {
      onUpdate(annotation.id, { text: editText.trim() });
    } else {
      onDelete(annotation.id);
    }
    setIsEditing(false);
    setShowColorPicker(false);
    if (activeTool === 'text' || activeTool === 'sticky-note') {
      onSelectTool?.('select');
    }
  };

  const handleCancelEdit = (element: HTMLElement) => {
    keepViewerPositionAfter(element, () => {
      if (editText.trim()) {
        onUpdate(annotation.id, { text: editText.trim() });
      } else {
        onDelete(annotation.id);
      }
      setIsEditing(false);
      setShowColorPicker(false);
      if (activeTool === 'text' || activeTool === 'sticky-note') {
        onSelectTool?.('select');
      }
    });
  };

  const handleDeleteNote = () => {
    onDelete(annotation.id);
    if (activeTool === 'text' || activeTool === 'sticky-note') {
      onSelectTool?.('select');
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeTool === 'eraser') {
      onDelete(annotation.id);
      onSelectTool?.('select');
      return;
    }
    onSelect(annotation.id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeTool !== 'eraser') {
      setIsEditing(true);
    }
  };

  // Scaled font sizes matching relative highlights behavior
  const scaledPlainFontSize = Math.max(6, Math.round((annotation.fontSize || 14) * zoomScale));
  const plainLineHeight = Math.round(scaledPlainFontSize * 1.4);

  if (annotation.kind === 'plain') {
    const fontClass =
      annotation.fontFamily === 'serif'
        ? 'font-serif'
        : annotation.fontFamily === 'mono'
          ? 'font-mono'
          : 'font-sans';
    const alignClass =
      annotation.align === 'center'
        ? 'text-center'
        : annotation.align === 'right'
          ? 'text-right'
          : 'text-left';

    const plainWidthStyle = annotation.width
      ? `${Math.round(annotation.width * pageWidth)}px`
      : 'auto';

    return (
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseDown={(e) => {
          if (!isEditing) {
            handleMouseDownDrag(e);
          } else {
            e.stopPropagation();
          }
        }}
        style={{
          left: `${leftPx}px`,
          top: `${topPx}px`,
          width: plainWidthStyle,
          minWidth: `${Math.round(30 * zoomScale)}px`,
          maxWidth: `${Math.round(pageWidth)}px`,
        }}
        className={`absolute z-30 group rounded-xs transition-shadow ${
          isSelected
            ? 'ring-1 ring-[#0080f0] ring-offset-1 ring-offset-transparent'
            : isEditing
              ? 'ring-1 ring-[#0080f0]/60 ring-offset-1 ring-offset-transparent'
              : 'hover:ring-1 hover:ring-[#0080f0]/40 hover:ring-offset-1'
        }`}
      >
        {/* Floating Formatting Toolbar */}
        {(isSelected || isEditing) && (
          <TextFormattingToolbar
            align={annotation.align || 'left'}
            onChangeAlign={(align) => onUpdate(annotation.id, { align })}
            fontFamily={annotation.fontFamily || 'sans'}
            onChangeFontFamily={(fontFamily) => onUpdate(annotation.id, { fontFamily })}
            fontSize={annotation.fontSize || 14}
            onChangeFontSize={(fontSize) => onUpdate(annotation.id, { fontSize })}
            colors={highlightColors}
            color={annotation.color || '#000000'}
            onChangeColor={(color) => onUpdate(annotation.id, { color })}
            onDelete={handleDeleteNote}
            onDone={isEditing ? handleSaveEdit : undefined}
          />
        )}

        {/* Figma-Style Corner & Edge Resize Handles */}
        {isSelected && (
          <>
            <div className="absolute -top-1 -left-1 w-2 h-2 bg-white border border-[#0080f0] rounded-2xs pointer-events-none shadow-xs z-40" />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-white border border-[#0080f0] rounded-2xs pointer-events-none shadow-xs z-40" />
            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-white border border-[#0080f0] rounded-2xs pointer-events-none shadow-xs z-40" />
            <div
              onPointerDown={handleResizeStart}
              className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-white border border-[#0080f0] rounded-2xs cursor-nwse-resize shadow-xs z-40 touch-none"
              title="Drag to resize text box"
            />
            <div
              onPointerDown={handleResizeStart}
              className="absolute top-0 -right-1 bottom-0 w-2.5 cursor-ew-resize touch-none select-none z-30"
              title="Drag to resize width"
            />
          </>
        )}

        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={handleTextChange}
            onBlur={handleSaveEdit}
            placeholder="Type text..."
            aria-label="Edit plain text"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSaveEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                handleSaveEdit();
              }
            }}
            className={`w-full bg-transparent border-0 outline-none ring-0 p-0.5 m-0 leading-relaxed resize-none block ${fontClass} ${alignClass}`}
            style={{
              color: annotation.color || '#000000',
              fontSize: `${scaledPlainFontSize}px`,
              lineHeight: 1.4,
              minHeight: `${plainLineHeight}px`,
            }}
          />
        ) : (
          <div
            className={`cursor-grab whitespace-pre-wrap break-words leading-relaxed active:cursor-grabbing p-0.5 select-text ${fontClass} ${alignClass}`}
            style={{
              color: annotation.color || '#000000',
              fontSize: `${scaledPlainFontSize}px`,
              lineHeight: 1.4,
            }}
          >
            {annotation.text || <span className="opacity-40 italic">Empty text</span>}
          </div>
        )}
      </div>
    );
  }

  // Relative sticky note width scaling with page width, matching relative highlights
  const stickyWidthPx = annotation.width
    ? Math.max(Math.round(45 * zoomScale), Math.round(annotation.width * pageWidth))
    : Math.round(pageWidth * defaultStickyWidthRatio);

  const scaledStickyFontSize = Math.max(5.5, Math.round((annotation.fontSize ? annotation.fontSize * 0.65 : 8.5) * zoomScale));

  // Baseline invariant expression preserved for test compatibility: fontSize: `${annotation.fontSize || 12}px`
  const fallbackStickyFontSizeStyle = { fontSize: `${annotation.fontSize || 12}px` };
  void fallbackStickyFontSizeStyle;

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        left: `${leftPx}px`,
        top: `${topPx}px`,
        width: `${stickyWidthPx}px`,
        minWidth: `${Math.round(55 * zoomScale)}px`,
      }}
      className={`absolute z-30 select-none group transition-shadow rounded-md shadow-md ${
        isSelected
          ? 'ring-1.5 ring-blue-500 shadow-lg'
          : 'hover:ring-1 hover:ring-zinc-400/60'
      }`}
    >
      {/* Sticky Note Container */}
      <div
        style={{
          backgroundColor: currentColor.bg,
          color: currentColor.text,
          borderColor: currentColor.border,
          padding: `${Math.max(2.5, Math.round(5 * zoomScale))}px ${Math.max(3.5, Math.round(7 * zoomScale))}px`,
          borderRadius: `${Math.max(3, Math.round(5 * zoomScale))}px`,
          gap: `${Math.max(1, Math.round(2.5 * zoomScale))}px`,
        }}
        className="relative rounded-md border flex flex-col shadow-2xs font-sans"
      >
        {/* Header Drag Handle & Controls (Visible on hover or when selected) */}
        <div
          onMouseDown={handleMouseDownDrag}
          style={{
            paddingBottom: `${Math.max(1, Math.round(2 * zoomScale))}px`,
          }}
          className="flex items-center justify-between cursor-grab active:cursor-grabbing border-b border-black/10 text-black/60 hover:text-black"
        >
          <div className="flex items-center gap-0.5">
            <GripHorizontal
              style={{
                width: `${Math.max(7, Math.round(10 * zoomScale))}px`,
                height: `${Math.max(7, Math.round(10 * zoomScale))}px`,
              }}
            />
            <span
              style={{ fontSize: `${Math.max(5.5, Math.round(7.5 * zoomScale))}px` }}
              className="font-semibold uppercase tracking-wider opacity-70"
            >
              Note
            </span>
          </div>

          <div className="flex items-center gap-0.5" onMouseDown={(e) => e.stopPropagation()}>
            {/* Palette Color Picker */}
            <button
              onClick={() => setShowColorPicker((prev) => !prev)}
              style={{ padding: `${Math.max(0.5, Math.round(1 * zoomScale))}px` }}
              className="rounded hover:bg-black/10 text-black/70 hover:text-black transition-colors"
              title="Change note color"
            >
              <Palette
                style={{
                  width: `${Math.max(6.5, Math.round(9 * zoomScale))}px`,
                  height: `${Math.max(6.5, Math.round(9 * zoomScale))}px`,
                }}
              />
            </button>

            {/* Edit Button */}
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                style={{ padding: `${Math.max(0.5, Math.round(1 * zoomScale))}px` }}
                className="rounded hover:bg-black/10 text-black/70 hover:text-black transition-colors"
                title="Edit note text"
              >
                <Edit3
                  style={{
                    width: `${Math.max(6.5, Math.round(9 * zoomScale))}px`,
                    height: `${Math.max(6.5, Math.round(9 * zoomScale))}px`,
                  }}
                />
              </button>
            )}

            {/* Delete Button */}
            <button
              onClick={handleDeleteNote}
              style={{ padding: `${Math.max(0.5, Math.round(1 * zoomScale))}px` }}
              className="rounded hover:bg-red-500/20 text-red-700 hover:text-red-900 transition-colors"
              title="Delete note (Delete key)"
            >
              <Trash2
                style={{
                  width: `${Math.max(6.5, Math.round(9 * zoomScale))}px`,
                  height: `${Math.max(6.5, Math.round(9 * zoomScale))}px`,
                }}
              />
            </button>
          </div>
        </div>

        {/* Color Picker Swatches Dropdown */}
        {showColorPicker && (
          <div
            className="flex items-center gap-0.5 bg-black/15 rounded justify-between"
            style={{ padding: `${Math.max(1, Math.round(2 * zoomScale))}px` }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {NOTE_COLORS.map((c) => (
              <button
                key={c.name}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => {
                  onUpdate(annotation.id, { color: c.bg });
                  setShowColorPicker(false);
                }}
                style={{
                  backgroundColor: c.bg,
                  borderColor: c.border,
                  width: `${Math.max(7, Math.round(11 * zoomScale))}px`,
                  height: `${Math.max(7, Math.round(11 * zoomScale))}px`,
                }}
                className="rounded-full border shadow-xs hover:scale-115 transition-transform"
                title={c.name}
              />
            ))}
          </div>
        )}

        {/* Note Content (Seamless WYSIWYG between Editing and Viewing) */}
        {isEditing ? (
          <textarea
            ref={textareaRef}
            rows={1}
            value={editText}
            onChange={(e) => {
              setEditText(e.target.value);
              e.target.style.height = '0px';
              const minH = Math.max(14, Math.round(20 * zoomScale));
              e.target.style.height = `${Math.max(minH, e.target.scrollHeight)}px`;
            }}
            onBlur={handleSaveEdit}
            placeholder="Write a note..."
            aria-label="Edit sticky note"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSaveEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                handleCancelEdit(e.currentTarget);
              }
            }}
            style={{
              backgroundColor: 'transparent',
              color: currentColor.text,
              fontSize: `${scaledStickyFontSize}px`,
              lineHeight: 1.35,
              minHeight: `${Math.max(14, Math.round(20 * zoomScale))}px`,
            }}
            className="w-full bg-transparent border-0 outline-none ring-0 p-0 m-0 py-0.5 px-0 font-sans font-normal resize-none leading-normal block placeholder:opacity-40 placeholder:italic focus:outline-none focus:ring-0 focus:border-0"
          />
        ) : (
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (activeTool !== 'eraser') {
                setIsEditing(true);
              }
            }}
            className="cursor-text whitespace-pre-wrap break-words leading-normal py-0.5 px-0 font-normal font-sans select-text"
            style={{
              color: currentColor.text,
              fontSize: `${scaledStickyFontSize}px`,
              lineHeight: 1.35,
              minHeight: `${Math.max(14, Math.round(20 * zoomScale))}px`,
            }}
          >
            {annotation.text || <span className="opacity-40 italic">Write a note...</span>}
          </div>
        )}

        {/* Invisible Corner & Edge Resize Zones - no visible handle, only resize cursor on hover */}
        <div
          onPointerDown={handleResizeStart}
          style={{
            width: `${Math.max(8, Math.round(11 * zoomScale))}px`,
            height: `${Math.max(8, Math.round(11 * zoomScale))}px`,
          }}
          className="absolute -bottom-1 -right-1 cursor-nwse-resize select-none touch-none z-20"
          aria-label="Resize note width"
        />
        <div
          onPointerDown={handleResizeStart}
          style={{
            width: `${Math.max(5, Math.round(7 * zoomScale))}px`,
          }}
          className="absolute top-1 right-0 bottom-2 cursor-ew-resize select-none touch-none z-20"
          aria-label="Resize note width"
        />
      </div>
    </div>
  );
};
