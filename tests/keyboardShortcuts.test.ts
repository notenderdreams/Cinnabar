import { describe, expect, test } from 'bun:test';
import { handleKeyboardShortcut, type KeyboardShortcutOptions } from '../src/hooks/useKeyboard';

const projectFile = (path: string) => Bun.file(new URL(`../${path}`, import.meta.url)).text();

describe('annotation keyboard shortcuts', () => {
  test('an Escape already handled by the text editor cannot reach the app fullscreen handler', () => {
    let escapeCalls = 0;
    let blurCalls = 0;
    const noop = () => {};
    const options: KeyboardShortcutOptions = {
      onOpenPdf: noop,
      onSavePdf: noop,
      onSaveJson: noop,
      onToggleInvert: noop,
      onToggleSearch: noop,
      onSelectTool: noop,
      onUndo: noop,
      onRedo: noop,
      onZoomIn: noop,
      onZoomOut: noop,
      onResetZoom: noop,
      onNextPage: noop,
      onPrevPage: noop,
      onToggleZen: noop,
      onToggleShortcuts: noop,
      onEscape: () => {
        escapeCalls += 1;
      },
    };

    handleKeyboardShortcut(
      {
        key: 'Escape',
        code: 'Escape',
        defaultPrevented: true,
        target: {
          tagName: 'TEXTAREA',
          isContentEditable: false,
          blur: () => {
            blurCalls += 1;
          },
        },
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault: noop,
        stopPropagation: noop,
      } as unknown as KeyboardEvent,
      options
    );

    expect(escapeCalls).toBe(0);
    expect(blurCalls).toBe(0);
  });

  test('reading layouts have discoverable shortcuts and a valid side-by-side mode', async () => {
    const [keyboardSource, appSource, headerSource, settingsSource] = await Promise.all([
      projectFile('src/hooks/useKeyboard.ts'),
      projectFile('src/App.tsx'),
      projectFile('src/components/layout/Header.tsx'),
      projectFile('src/components/modals/SettingsModal.tsx'),
    ]);

    expect(keyboardSource).toContain("options.onChangeViewMode?.('spread')");
    expect(appSource).toContain("viewMode === 'spread' ? spreadStart + 2");
    expect(headerSource).toContain('aria-label="Side-by-side pages"');
    expect(settingsSource).toContain("{ id: 'spread' as ViewMode, label: 'Side by Side'");
    expect(settingsSource).not.toContain("id: 'book' as ViewMode");
  });

  test('U underlines selected text before falling back to the underline-line tool', async () => {
    const [keyboardSource, appSource, modalSource] = await Promise.all([
      projectFile('src/hooks/useKeyboard.ts'),
      projectFile('src/App.tsx'),
      projectFile('src/components/modals/KeyboardShortcutsModal.tsx'),
    ]);

    expect(keyboardSource).toContain("case 'u':");
    expect(keyboardSource).toContain('options.onSelectUnderlineTool?.()');
    expect(appSource).toContain("if (addHighlightsFromSelection('underline', false)) return;");
    expect(appSource).toContain("handleSelectTool('highlight-line')");
    expect(appSource).toContain("setLineHighlightStyle('underline')");
    expect(modalSource).toContain(
      "{ keys: ['U'], desc: 'Underline Selected Text / Tool' }"
    );
  });

  test('number keys select palette colors and recolor a selected highlight', async () => {
    const [keyboardSource, appSource, toolbarSource] = await Promise.all([
      projectFile('src/hooks/useKeyboard.ts'),
      projectFile('src/App.tsx'),
      projectFile('src/components/layout/Toolbar.tsx'),
    ]);

    expect(keyboardSource).toContain("if (/^[1-8]$/.test(e.key))");
    expect(keyboardSource).toContain('options.onSelectHighlightColor?.(Number(e.key) - 1)');
    expect(appSource).toContain('setSelectedColor(color);');
    expect(appSource).toContain("selectedAnnotation.type === 'highlight-text'");
    expect(appSource).toContain('updateAnnotation(selectedAnnotation.id, { color });');
    expect(appSource).not.toContain('if (!isHighlightTool(activeTool)) return;');
    expect(appSource).toContain('setSelectedColor(selectedAnnotation.color);');
    expect(appSource).toContain('colorPresets={highlightColors}');
    expect(appSource).toContain('replaceHighlightPaletteColor');
    expect(toolbarSource).toContain('onReplaceSelectedColor(e.target.value)');
    expect(toolbarSource).toContain('aria-label={`Select highlight color ${index + 1}`}');
    expect(toolbarSource).toContain('className={`macos-color-orb');
    expect(toolbarSource).toContain('<Palette className="h-4 w-4" aria-hidden="true" />');
    expect(toolbarSource).not.toContain('fill={selectedColor}');
    expect(toolbarSource).toContain('aria-label="Choose a custom color"');
    expect(toolbarSource).toContain(
      'text-[9px] leading-none font-mono font-semibold text-[var(--muted-foreground)]'
    );
    expect(toolbarSource).not.toContain('text-white mix-blend-difference');
  });

  test('Cmd+Enter toggles application fullscreen without triggering zen focus mode', async () => {
    const [keyboardSource, appSource, modalSource, bridgeSource] = await Promise.all([
      projectFile('src/hooks/useKeyboard.ts'),
      projectFile('src/App.tsx'),
      projectFile('src/components/modals/KeyboardShortcutsModal.tsx'),
      projectFile('src/utils/tauri/window.ts'),
    ]);

    expect(keyboardSource).toContain("} else if (e.key === 'Enter') {");
    expect(keyboardSource).toContain('options.onToggleFullscreen?.()');
    expect(appSource).toContain('onToggleFullscreen: () => void toggleFullscreenWindow()');
    expect(bridgeSource).toContain('export async function toggleFullscreenWindow()');
    expect(modalSource).toContain("{ keys: ['Cmd', 'Enter'], desc: 'Toggle App Fullscreen' }");
  });

  test('Escape dismisses active inputs and modals before exiting fullscreen mode', async () => {
    const [keyboardSource, appSource, overlaySource, canvasSource, noteSource, bridgeSource] =
      await Promise.all([
        projectFile('src/hooks/useKeyboard.ts'),
        projectFile('src/App.tsx'),
        projectFile('src/components/annotations/AiExplanationOverlay.tsx'),
        projectFile('src/components/annotations/AnnotationCanvas.tsx'),
        projectFile('src/components/annotations/TextNoteOverlay.tsx'),
        projectFile('src/utils/tauri/window.ts'),
      ]);

    // useKeyboard intercepts Escape inside inputs with preventDefault + stopPropagation
    expect(keyboardSource).toContain("if (e.key === 'Escape') {");
    expect(keyboardSource).toContain('e.preventDefault();');
    expect(keyboardSource).toContain('e.stopPropagation();');
    expect(keyboardSource).toContain("case 'escape':");
    expect(keyboardSource).toContain('options.onEscape?.()');

    // Overlay and Note components also prevent bubbling on Escape during edit
    expect(overlaySource).toContain('handleClose()');
    expect(noteSource).toContain('handleCancelEdit(e.currentTarget)');
    expect(noteSource).toContain('setIsEditing(false)');

    // App onEscape hierarchically checks open modals, selection, zen, and finally exits fullscreen
    expect(appSource).toContain('onEscape: () => {');
    expect(appSource).toContain('void exitFullscreenWindow()');
    expect(bridgeSource).toContain('export async function exitFullscreenWindow()');
  });

  test('PDFViewer anchors scroll position during window resize and fullscreen transitions', async () => {
    const [viewerSource, overlaySource] = await Promise.all([
      projectFile('src/components/viewer/PDFViewer.tsx'),
      projectFile('src/components/annotations/AiExplanationOverlay.tsx'),
    ]);

    // Viewer tracks active page and compensates for layout shifts on resize
    expect(viewerSource).toContain('preResizeOffset');
    expect(viewerSource).toContain('anchorPage');
    expect(viewerSource).toContain('isProgrammaticScrollRef.current = true');
    expect(viewerSource).toContain('currentContainer.scrollTop += delta');

    // AiExplanationOverlay no longer registers individual window keydown listeners
    expect(overlaySource).not.toContain("window.addEventListener('keydown', handleKeyDown)");
  });

  test('Cmd+Shift+L triggers light and dark theme toggle', () => {
    let toggleCalls = 0;
    const noop = () => {};
    const options: KeyboardShortcutOptions = {
      onOpenPdf: noop,
      onSavePdf: noop,
      onSaveJson: noop,
      onToggleInvert: () => {
        toggleCalls += 1;
      },
      onToggleSearch: noop,
      onSelectTool: noop,
      onUndo: noop,
      onRedo: noop,
      onZoomIn: noop,
      onZoomOut: noop,
      onResetZoom: noop,
      onNextPage: noop,
      onPrevPage: noop,
      onToggleZen: noop,
      onToggleShortcuts: noop,
    };

    handleKeyboardShortcut(
      {
        key: 'l',
        code: 'KeyL',
        defaultPrevented: false,
        target: {
          tagName: 'DIV',
          isContentEditable: false,
        } as unknown as HTMLElement,
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
        preventDefault: noop,
        stopPropagation: noop,
      } as unknown as KeyboardEvent,
      options
    );

    expect(toggleCalls).toBe(1);
  });

  test('Cmd+Comma, Ctrl+Cmd+Comma, and Cmd+Shift+Comma trigger preferences and settings toggle', () => {
    let settingsCalls = 0;
    const noop = () => {};
    const options: KeyboardShortcutOptions = {
      onOpenPdf: noop,
      onSavePdf: noop,
      onSaveJson: noop,
      onToggleInvert: noop,
      onToggleSearch: noop,
      onSelectTool: noop,
      onUndo: noop,
      onRedo: noop,
      onZoomIn: noop,
      onZoomOut: noop,
      onResetZoom: noop,
      onNextPage: noop,
      onPrevPage: noop,
      onToggleZen: noop,
      onToggleShortcuts: noop,
      onToggleSettings: () => {
        settingsCalls += 1;
      },
    };

    // Standard Cmd+,
    handleKeyboardShortcut(
      {
        key: ',',
        code: 'Comma',
        defaultPrevented: false,
        target: { tagName: 'DIV', isContentEditable: false } as unknown as HTMLElement,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault: noop,
        stopPropagation: noop,
      } as unknown as KeyboardEvent,
      options
    );

    // Ctrl+Cmd+,
    handleKeyboardShortcut(
      {
        key: ',',
        code: 'Comma',
        defaultPrevented: false,
        target: { tagName: 'DIV', isContentEditable: false } as unknown as HTMLElement,
        metaKey: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        preventDefault: noop,
        stopPropagation: noop,
      } as unknown as KeyboardEvent,
      options
    );

    // Cmd+Shift+, (which yields key '<' and code 'Comma' on US keyboards)
    handleKeyboardShortcut(
      {
        key: '<',
        code: 'Comma',
        defaultPrevented: false,
        target: { tagName: 'DIV', isContentEditable: false } as unknown as HTMLElement,
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
        preventDefault: noop,
        stopPropagation: noop,
      } as unknown as KeyboardEvent,
      options
    );

    // Ctrl+Shift+, (Windows/Linux)
    handleKeyboardShortcut(
      {
        key: '<',
        code: 'Comma',
        defaultPrevented: false,
        target: { tagName: 'DIV', isContentEditable: false } as unknown as HTMLElement,
        metaKey: false,
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
        preventDefault: noop,
        stopPropagation: noop,
      } as unknown as KeyboardEvent,
      options
    );

    expect(settingsCalls).toBe(4);
  });

  test('Cmd+Shift+N triggers add blank page below', async () => {
    let addPageCalls = 0;
    const noop = () => {};
    const options: KeyboardShortcutOptions = {
      onOpenPdf: noop,
      onSavePdf: noop,
      onSaveJson: noop,
      onToggleInvert: noop,
      onToggleSearch: noop,
      onSelectTool: noop,
      onUndo: noop,
      onRedo: noop,
      onZoomIn: noop,
      onZoomOut: noop,
      onResetZoom: noop,
      onNextPage: noop,
      onPrevPage: noop,
      onToggleZen: noop,
      onToggleShortcuts: noop,
      onAddPageBelow: () => {
        addPageCalls += 1;
      },
    };

    handleKeyboardShortcut(
      {
        key: 'N',
        code: 'KeyN',
        defaultPrevented: false,
        target: { tagName: 'DIV', isContentEditable: false } as unknown as HTMLElement,
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
        preventDefault: noop,
        stopPropagation: noop,
      } as unknown as KeyboardEvent,
      options
    );

    handleKeyboardShortcut(
      {
        key: 'n',
        code: 'KeyN',
        defaultPrevented: false,
        target: { tagName: 'DIV', isContentEditable: false } as unknown as HTMLElement,
        metaKey: false,
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
        preventDefault: noop,
        stopPropagation: noop,
      } as unknown as KeyboardEvent,
      options
    );

    expect(addPageCalls).toBe(2);

    const [keyboardSource, modalSource, appSource] = await Promise.all([
      projectFile('src/hooks/useKeyboard.ts'),
      projectFile('src/components/modals/KeyboardShortcutsModal.tsx'),
      projectFile('src/App.tsx'),
    ]);

    expect(keyboardSource).toContain("e.shiftKey && e.key.toLowerCase() === 'n'");
    expect(keyboardSource).toContain('options.onAddPageBelow?.()');
    expect(modalSource).toContain("desc: 'Add Blank Page Below'");
    expect(appSource).toContain('onAddPageBelow: () =>');
  });
});
