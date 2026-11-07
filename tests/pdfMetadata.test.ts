import { describe, expect, test } from 'bun:test';

describe('PDF metadata', () => {
  test('does not transfer complete PDFs into the UI to obtain library page counts', async () => {
    const [dashboardSource, bridgeSource] = await Promise.all([
      Bun.file(new URL('../src/components/dashboard/Dashboard.tsx', import.meta.url)).text(),
      Bun.file(new URL('../src/utils/tauri/documents.ts', import.meta.url)).text(),
    ]);

    expect(dashboardSource).not.toContain('const file = await tauriReadFile(item.filePath)');
    expect(dashboardSource).not.toContain('Counting pages…');
    expect(bridgeSource).toContain('num_pages?: number');
  });
});
