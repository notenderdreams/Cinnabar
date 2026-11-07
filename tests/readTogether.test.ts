import { describe, expect, test } from 'bun:test';
import { getReadTogetherPageRows } from '../src/lib/pdf/readTogether';

describe('read together page rows', () => {
  test('wires a read-only companion PDF into the continuous viewer', async () => {
    const [appSource, viewerSource, pageSource, dashboardSource, headerSource] = await Promise.all([
      Bun.file(new URL('../src/App.tsx', import.meta.url)).text(),
      Bun.file(new URL('../src/components/viewer/PDFViewer.tsx', import.meta.url)).text(),
      Bun.file(new URL('../src/components/viewer/PDFPage.tsx', import.meta.url)).text(),
      Bun.file(new URL('../src/components/dashboard/Dashboard.tsx', import.meta.url)).text(),
      Bun.file(new URL('../src/components/layout/Header.tsx', import.meta.url)).text(),
    ]);

    expect(appSource).toContain('companionPdfDoc={companionPdfDoc}');
    expect(appSource).toContain("setViewMode('continuous')");
    expect(viewerSource).toContain('pageIdPrefix="companion-pdf-page"');
    expect(viewerSource).toContain('isReadOnly');
    expect(viewerSource).toContain('data-read-together-split');
    expect(viewerSource).toContain('data-read-together-divider');
    expect(viewerSource.match(/w-1\/2 min-w-0 flex-none flex-col overflow-hidden/g)?.length).toBe(2);
    expect(viewerSource.match(/min-h-0 flex-1 overflow-auto/g)?.length).toBe(2);
    expect(viewerSource).toContain('ref={companionContainerRef}');
    expect(viewerSource).toContain("onActivePaneChange?.('companion')");
    expect(viewerSource).toContain('scale={companionZoom}');
    expect(appSource).toContain("activeReaderPane === 'companion'");
    expect(headerSource).not.toContain('activePaneLabel');
    expect(appSource).toContain("'companion-pdf-page'");
    expect(pageSource).toContain('{!isReadOnly && <AnnotationCanvas');
    expect(dashboardSource).toContain('if (event.shiftKey)');
    expect(dashboardSource).toContain("event.key === 'Enter' && selectedPdfIds.length === 2");
    expect(dashboardSource).toContain('onOpenPdfPair(');
    expect(viewerSource).toContain('getTargetContainerForPoint');
    expect(viewerSource).toContain('handleSpaceOverlayMouseDown');
    expect(viewerSource).toContain('onMouseDown={handleSpaceOverlayMouseDown}');
    expect(viewerSource).toContain('onActivePaneChange?.(pane)');
  });

  test('ensures companion pages have data-pdf-page-number and active side header has white text on blur', async () => {
    const [pageSource, viewerSource] = await Promise.all([
      Bun.file(new URL('../src/components/viewer/PDFPage.tsx', import.meta.url)).text(),
      Bun.file(new URL('../src/components/viewer/PDFViewer.tsx', import.meta.url)).text(),
    ]);

    expect(pageSource).toContain('data-pdf-page-number={pageNumber}');
    expect(viewerSource).toContain('text-white font-semibold shadow-sm');
  });
});
