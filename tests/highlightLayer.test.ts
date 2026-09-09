import { describe, expect, test } from 'bun:test';

const projectFile = (path: string) => Bun.file(new URL(`../${path}`, import.meta.url)).text();

describe('Highlight layer and line highlight selection', () => {
  test('renders highlights in a dedicated blend-mode layer so they render under text', async () => {
    const canvasSource = await projectFile('src/components/AnnotationCanvas.tsx');
    const pageSource = await projectFile('src/components/PDFPage.tsx');

    expect(canvasSource).toContain('data-pdf-highlight-layer');
    expect(canvasSource).toContain("mixBlendMode: isInvertedColorMode ? 'screen' : 'multiply'");
    expect(canvasSource).toContain('data-pdf-drawing-layer');

    // The canvas wrapper itself must not create a stacking context above PDF.js's
    // text layer. Its children straddle the text layer instead: highlight fills
    // below it, with drawings and interactive controls above it.
    expect(pageSource).toContain('data-pdf-text-layer');
    expect(pageSource).toContain('leading-none z-10');
    expect(canvasSource).not.toContain('absolute inset-0 z-20 select-none touch-none');
    expect(canvasSource).toContain(
      'data-pdf-highlight-layer\n        className="w-full h-full absolute inset-0 z-[5] pointer-events-none"'
    );
    expect(canvasSource).toContain(
      'data-pdf-drawing-layer\n        className="w-full h-full absolute inset-0 z-20 pointer-events-none"'
    );
  });

  test('makes straight line highlights selectable, draggable, and resizable with endpoint handles', async () => {
    const canvasSource = await projectFile('src/components/AnnotationCanvas.tsx');

    // Selected highlight supports highlight-line
    expect(canvasSource).toContain("a.type === 'highlight-line'");
    expect(canvasSource).toContain('handleLineDragStart');
    expect(canvasSource).toContain('handleLineEndpointDragStart');

    // Hit targets and endpoint handles for highlight-line
    expect(canvasSource).toContain('hit_line_');
    expect(canvasSource).toContain('Drag to adjust start point');
    expect(canvasSource).toContain('Drag to adjust end point');
  });

  test('offers Copy highlight text and Copy region as image in right-click context menu', async () => {
    const [contextMenuSource, pageSource] = await Promise.all([
      projectFile('src/components/PageContextMenu.tsx'),
      projectFile('src/components/PDFPage.tsx'),
    ]);

    expect(contextMenuSource).toContain('hitAnnotation');
    expect(contextMenuSource).toContain('onCopyAnnotationText');
    expect(contextMenuSource).toContain('onCopyAnnotationImage');
    expect(contextMenuSource).toContain('Copy region as image');
    expect(pageSource).toContain('handleCopyAnnotationText');
    expect(pageSource).toContain('handleCopyAnnotationImage');
    expect(pageSource).toContain('getAnnotationCoveredText');
    expect(pageSource).toContain('copyRegionImageToClipboard');
  });

  test('scales stroke widths and underlines proportionally with zoom level', async () => {
    const [canvasSource, pageSource] = await Promise.all([
      projectFile('src/components/AnnotationCanvas.tsx'),
      projectFile('src/components/PDFPage.tsx'),
    ]);

    expect(canvasSource).toContain('scale?: number;');
    expect(canvasSource).toContain('const zoomScale = Math.max(0.1, scale);');
    expect(canvasSource).toContain('const DEFAULT_UNDERLINE_WIDTH = 1.5;');
    expect(canvasSource).toContain('const DEFAULT_RECT_STROKE_WIDTH = 1.5;');
    expect(canvasSource).toContain("strokeWidth={(line.style === 'underline' ? DEFAULT_UNDERLINE_WIDTH : line.strokeWidth) * zoomScale}");
    expect(canvasSource).toContain('strokeWidth={draw.strokeWidth * zoomScale}');
    expect(canvasSource).toContain('strokeWidth={DEFAULT_UNDERLINE_WIDTH * zoomScale}');
    expect(canvasSource).toContain('strokeWidth={DEFAULT_RECT_STROKE_WIDTH * zoomScale}');
    expect(canvasSource).toContain('strokeWidth={strokeWidth * zoomScale}');
    expect(pageSource).toContain('scale={scale}');
  });
});
