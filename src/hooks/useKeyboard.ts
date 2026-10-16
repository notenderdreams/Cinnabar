import { useEffect } from 'react';
import type { ToolType, ViewMode } from '../utils/types';

export interface KeyboardShortcutOptions {
  onOpenPdf: () => void;
  onSavePdf: () => void;
  onSaveJson: () => void;
  onToggleInvert: () => void;
  onToggleSearch: () => void;
  onSelectTool: (tool: ToolType) => void;
  onSelectLineTool?: () => void;
  onSelectUnderlineTool?: () => void;
  onSelectHighlightColor?: (index: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  onToggleZen: () => void;
  onToggleFullscreen?: () => void;
  onEscape?: () => void;
  onToggleSidebar?: () => void;
  onToggleAiPanel?: () => void;
  onToggleShortcuts: () => void;
  onToggleSettings?: () => void;
  onChangeViewMode?: (mode: ViewMode) => void;
  onToggleLibrary?: () => void;
  onCopyPageText?: () => void;
  onCopyPageJpg?: () => void;
  onCopyStitchedSnippets?: () => void;
  onClearSnippets?: () => void;
  onHighlightSelectedText?: () => void;
  onDeleteSelectedAnnotation?: () => void;
  onAddPageBelow?: () => void;
}

export function handleKeyboardShortcut(
  e: KeyboardEvent,
  options: KeyboardShortcutOptions
) {
  if (e.defaultPrevented) return;

  const target = e.target as HTMLElement | null;
  const isCmdOrCtrl = e.metaKey || e.ctrlKey;
  const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter';

  // Always allow Cmd/Ctrl + Enter to toggle app fullscreen (unless typing in a multiline textarea)
  if (isCmdOrCtrl && isEnter) {
    if (!target || target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      options.onToggleFullscreen?.();
      return;
    }
  }

  // Don't intercept other shortcuts if user is typing in an input, textarea or contenteditable
  if (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable)
  ) {
    // Only allow Escape to close inside inputs
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      target.blur();
    }
    return;
  }

  const cmdOrCtrl = isCmdOrCtrl;

  if (cmdOrCtrl) {
    const isSettingsKey = e.key === ',' || e.key === '<' || e.code === 'Comma';
    if (isSettingsKey) {
      e.preventDefault();
      options.onToggleSettings?.();
      return;
    }

    if (e.shiftKey && e.key === '1') {
      e.preventDefault();
      options.onChangeViewMode?.('single');
    } else if (e.shiftKey && e.key === '2') {
      e.preventDefault();
      options.onChangeViewMode?.('spread');
    } else if (e.shiftKey && e.key === '3') {
      e.preventDefault();
      options.onChangeViewMode?.('continuous');
    } else if (e.shiftKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      options.onHighlightSelectedText?.();
    } else if (e.altKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      options.onCopyStitchedSnippets?.();
    } else if (e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      options.onCopyStitchedSnippets?.();
    } else if (e.shiftKey && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      options.onClearSnippets?.();
    } else if (e.altKey && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      options.onClearSnippets?.();
    } else if (e.shiftKey && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      options.onClearSnippets?.();
    } else if (e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      options.onToggleInvert();
    } else if (e.shiftKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      options.onAddPageBelow?.();
    } else if (e.key.toLowerCase() === 'l') {
      e.preventDefault();
      options.onToggleLibrary?.();
    } else if (e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      options.onCopyPageText?.();
    } else if (e.shiftKey && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      options.onCopyPageJpg?.();
    } else if (!e.shiftKey && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      options.onToggleAiPanel?.();
    } else if (e.key.toLowerCase() === 'o') {
      e.preventDefault();
      options.onOpenPdf();
    } else if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      options.onSavePdf();
    } else if (e.key.toLowerCase() === 'i') {
      e.preventDefault();
      options.onToggleInvert();
    } else if (e.key.toLowerCase() === 'b') {
      e.preventDefault();
      options.onToggleSidebar?.();
    } else if (e.key.toLowerCase() === 'f') {
      e.preventDefault();
      options.onToggleSearch();
    } else if (e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        options.onRedo();
      } else {
        options.onUndo();
      }
    } else if (e.key.toLowerCase() === 'y') {
      e.preventDefault();
      options.onRedo();
    } else if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      options.onZoomIn();
    } else if (e.key === '-') {
      e.preventDefault();
      options.onZoomOut();
    } else if (e.key === '0') {
      e.preventDefault();
      options.onResetZoom();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      options.onToggleFullscreen?.();
    }
  } else {
    // Single key shortcuts
    if (/^[1-8]$/.test(e.key)) {
      options.onSelectHighlightColor?.(Number(e.key) - 1);
      return;
    }
    switch (e.key.toLowerCase()) {
      case 'u':
        options.onSelectUnderlineTool?.();
        break;
      case 'l':
        options.onSelectLineTool?.();
        break;
      case 'h':
        options.onSelectTool('highlight-pen');
        break;
      case 'p':
        options.onSelectTool('pen');
        break;
      case 'c':
      case 'i':
        options.onSelectTool('snip');
        break;
      case 't':
        options.onSelectTool('text');
        break;
      case 'n':
        options.onSelectTool('sticky-note');
        break;
      case 'a':
        options.onSelectTool('ai-box');
        break;
      case 'e':
        options.onSelectTool('eraser');
        break;
      case 'v':
        options.onSelectTool('select');
        break;
      case 'r':
        options.onSelectTool('highlight-rect');
        break;
      case 'f':
        options.onToggleZen();
        break;
      case '?':
      case '/':
        options.onToggleShortcuts();
        break;
      case 'backspace':
      case 'delete':
        options.onDeleteSelectedAnnotation?.();
        break;
      case 'arrowright':
      case 'j':
        options.onNextPage();
        break;
      case 'arrowleft':
      case 'k':
        options.onPrevPage();
        break;
      case 'escape':
        e.preventDefault();
        options.onEscape?.();
        break;
    }
  }
}

export function useKeyboard(options: KeyboardShortcutOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => handleKeyboardShortcut(e, options);

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [options]);
}
