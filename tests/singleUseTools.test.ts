import { describe, expect, test } from 'bun:test';

async function source(path: string) {
  return Bun.file(new URL(`../${path}`, import.meta.url)).text();
}

describe('single-use tools returning to selection mode', () => {
  test('rectangle highlight tool resets to selection mode after drawing or bounding a box', async () => {
    const canvas = await source('src/components/AnnotationCanvas.tsx');
    // On pointer up after dragging a rectangle highlight
    expect(canvas).toContain(
      "onAddAnnotation(newRect);\n        onSelectTool?.('select');\n      }\n      setRectStart(null);"
    );
    // On double/triple clicking text with rectangle highlight tool
    expect(canvas).toContain(
      "if (activeTool === 'highlight-rect') {\n            onSelectTool?.('select');\n          }"
    );
  });

  test('snip to AI tool resets to selection mode after capture', async () => {
    const [canvas, app] = await Promise.all([
      source('src/components/AnnotationCanvas.tsx'),
      source('src/App.tsx'),
    ]);
    // Canvas triggers onSelectTool('select') after snipping
    expect(canvas).toContain(
      "onCaptureSnippet?.(pageNumber, captureRect);\n        onSelectTool?.('select');\n      }\n      setSnipStart(null);"
    );
    // App sets active tool to select for both ai-prompt and snippet list targets
    expect(app).toContain(
      "addSnippet(entry);\n            setIsSidebarOpen(true);\n            setSidebarTab('snippets');\n            setActiveTool('select');"
    );
  });

  test('explain region (ai-box) tool resets to selection mode after creating the region', async () => {
    const canvas = await source('src/components/AnnotationCanvas.tsx');
    // On pointer up after creating the AI box
    expect(canvas).toContain(
      "onAddAnnotation(annotation);\n      onAiBoxCreated?.(annotation.id);\n      setAiStart(null);\n      setAiCurrent(null);\n      onSelectTool?.('select');"
    );
  });

  test('plain text and sticky note tools reset to selection mode upon placement', async () => {
    const [canvas, viewer] = await Promise.all([
      source('src/components/AnnotationCanvas.tsx'),
      source('src/components/PDFViewer.tsx'),
    ]);
    // Canvas resets to select immediately when note is added
    expect(canvas).toContain(
      "onAddAnnotation(newNote);\n      onSelectAnnotation?.(newNote.id);\n      onSelectTool?.('select');"
    );
    // Viewer margin note creation resets to select immediately when note is added
    expect(viewer).toContain(
      "onAddAnnotation(newNote);\n          onSelectAnnotation(newNote.id);\n          onSelectTool?.('select');"
    );
  });

  test('eraser tool resets to selection mode after global stroke or overlay deletion', async () => {
    const [viewer, textOverlay, imageOverlay, aiOverlay] = await Promise.all([
      source('src/components/PDFViewer.tsx'),
      source('src/components/TextNoteOverlay.tsx'),
      source('src/components/ImageOverlay.tsx'),
      source('src/components/AiExplanationOverlay.tsx'),
    ]);
    // Global eraser pointer up resets to select
    expect(viewer).toContain(
      "const handleGlobalPointerUp = () => {\n      if (isErasingRef.current) {\n        isErasingRef.current = false;\n        onSelectTool?.('select');\n      }\n    };"
    );
    // Text note overlay eraser click / drag-start resets to select
    expect(textOverlay).toContain(
      "if (activeTool === 'eraser') {\n      onDelete(annotation.id);\n      onSelectTool?.('select');\n      return;\n    }"
    );
    // Image overlay eraser click / mouse down resets to select
    expect(imageOverlay).toContain(
      "if (activeTool === 'eraser') {\n          onDelete(annotation.id);\n          onSelectTool?.('select');\n        } else {"
    );
    // AI explanation overlay badge & region eraser click resets to select
    expect(aiOverlay).toContain(
      "if (activeTool === 'eraser') {\n        onDelete(annotation.id);\n        onSelectTool?.('select');\n        return;\n      }"
    );
    expect(aiOverlay).toContain(
      "if (activeTool === 'eraser') {\n                event.stopPropagation();\n                onDelete(annotation.id);\n                onSelectTool?.('select');\n              }"
    );
  });

  test('escape key resets any active non-select tool back to select', async () => {
    const app = await source('src/App.tsx');
    expect(app).toContain(
      "if (activeTool !== 'select') {\n        setActiveTool('select');\n        return;\n      }"
    );
  });
});
