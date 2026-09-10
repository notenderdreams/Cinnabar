import { describe, expect, test } from 'bun:test';

async function source(path: string) {
  return Bun.file(new URL(`../${path}`, import.meta.url)).text();
}

describe('plain text and sticky note tools', () => {
  test('offers separate toolbar tools and keyboard shortcuts', async () => {
    const [toolbar, keyboard, shortcuts] = await Promise.all([
      source('src/components/Toolbar.tsx'),
      source('src/hooks/useKeyboard.ts'),
      source('src/components/KeyboardShortcutsModal.tsx'),
    ]);

    expect(toolbar).toContain("{ id: 'text', icon: Type, label: 'Plain Text', shortcut: 'T' }");
    expect(toolbar).toContain("{ id: 'sticky-note', icon: StickyNote, label: 'Sticky Note', shortcut: 'N' }");
    expect(keyboard).toContain("options.onSelectTool('sticky-note')");
    expect(shortcuts).toContain("{ keys: ['T'], desc: 'Plain Text Tool' }");
    expect(shortcuts).toContain("{ keys: ['N'], desc: 'Sticky Note Tool' }");
  });

  test('stores a presentation kind while treating legacy notes as sticky', async () => {
    const [canvas, overlay, exporter] = await Promise.all([
      source('src/components/AnnotationCanvas.tsx'),
      source('src/components/TextNoteOverlay.tsx'),
      source('src/utils/pdfExporter.ts'),
    ]);

    expect(canvas).toContain("kind: activeTool === 'text' ? 'plain' : 'sticky'");
    expect(canvas).toContain("color: activeTool === 'text' ? '#000000' : '#fef08a'");
    expect(canvas).toContain("activeTool === 'text' ? 'cursor-text' : 'cursor-default'");
    expect(overlay).toContain("if (annotation.kind === 'plain')");
    expect(overlay).toContain('aria-label="Edit plain text"');
    expect(overlay).toContain('onBlur={handleSaveEdit}');
    expect(overlay).toContain(
      'textareaRef.current.setSelectionRange(annotation.text.length, annotation.text.length)'
    );
    expect(overlay).toContain("e.key === 'Enter' && (e.metaKey || e.ctrlKey)");
    expect(overlay).not.toContain('flex min-w-[180px] flex-col gap-1.5 rounded-lg');
    expect(exporter).toContain("const isPlainText = textAnn.kind === 'plain'");
    expect(exporter).toContain('if (!isPlainText)');
  });

  test('allows text notes to be positioned outside PDF boundaries into margins', async () => {
    const overlay = await source('src/components/TextNoteOverlay.tsx');
    expect(overlay).toContain('const newX = initialAnnPosRef.current.x + dx;');
    expect(overlay).toContain('const newY = initialAnnPosRef.current.y + dy;');
    expect(overlay).not.toContain('Math.min(initialAnnPosRef.current.x + dx, 0.92)');
  });

  test('makes sticky notes resizable via invisible corner and edge zones without changing text size', async () => {
    const [overlay, types] = await Promise.all([
      source('src/components/TextNoteOverlay.tsx'),
      source('src/utils/types.ts'),
    ]);

    expect(types).toContain('width?: number;');
    expect(overlay).toContain('cursor-nwse-resize');
    expect(overlay).toContain('cursor-ew-resize');
    expect(overlay).toContain('handleResizeStart');
    expect(overlay).toContain('stickyWidthPx');
    expect(overlay).toContain('fontSize: `${annotation.fontSize || 12}px`');
    expect(overlay).not.toContain('resize-handle-dot');
  });

  test('allows text notes to be created directly in workspace margins outside PDF', async () => {
    const [viewer, overlay] = await Promise.all([
      source('src/components/PDFViewer.tsx'),
      source('src/components/TextNoteOverlay.tsx'),
    ]);

    expect(viewer).toContain("const isNoteCreationTool = (activeTool === 'text' || activeTool === 'sticky-note')");
    expect(viewer).toContain('onAddAnnotation(newNote)');
    expect(viewer).toContain('onSelectAnnotation(newNote.id)');
    expect(overlay).toContain("const [isEditing, setIsEditing] = useState(annotation.text === '')");
  });

  test('provides icon-only text formatting toolbar for alignment, font, size, and color', async () => {
    const [toolbar, overlay] = await Promise.all([
      source('src/components/TextFormattingToolbar.tsx'),
      source('src/components/TextNoteOverlay.tsx'),
    ]);

    // Alignment icons
    expect(toolbar).toContain('AlignLeft');
    expect(toolbar).toContain('AlignCenter');
    expect(toolbar).toContain('AlignRight');

    // Font size controls
    expect(toolbar).toContain('AArrowDown');
    expect(toolbar).toContain('AArrowUp');

    // App highlight palette integration
    expect(toolbar).toContain('HIGHLIGHT_COLOR_PRESETS');
    expect(toolbar).toContain('colors.map');

    // Integrated into overlays
    expect(overlay).toContain('<TextFormattingToolbar');
    expect(overlay).toContain('colors={highlightColors}');
  });

  test('switches back to selection tool after single use of text, sticky note, or area explanation', async () => {
    const [canvas, viewer, app, overlay] = await Promise.all([
      source('src/components/AnnotationCanvas.tsx'),
      source('src/components/PDFViewer.tsx'),
      source('src/App.tsx'),
      source('src/components/TextNoteOverlay.tsx'),
    ]);

    // Note overlay resets to select when editing is off or note deleted
    expect(overlay).toContain("onSelectTool?.('select')");
    // Canvas and Viewer allow resetting tool to select when clicking away
    expect(canvas).toContain("onSelectTool?.('select')");
    expect(viewer).toContain("onSelectTool?.('select')");
    // App wires onSelectTool into PDFViewer
    expect(app).toContain('onSelectTool={handleSelectTool}');
    // App keeps tool until AI prompt is submitted, cancelled, or closed
    expect(app).toContain("if (activeTool === 'ai-box') {\n                    setActiveTool('select');");
  });
});
