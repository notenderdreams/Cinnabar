import { describe, expect, test } from 'bun:test';

const projectFile = (path: string) => Bun.file(new URL(`../${path}`, import.meta.url)).text();

describe('document opening', () => {
  test('does not race a selected PDF with an automatically generated welcome PDF', async () => {
    const appSource = await projectFile('src/App.tsx');

    expect(appSource).not.toContain("from './utils/samplePdf'");
    expect(appSource).not.toContain('Welcome-Document.pdf');
  });

  test('does not enter the reader until the selected PDF has loaded', async () => {
    const appSource = await projectFile('src/App.tsx');

    const sessionSource = await projectFile('src/hooks/useDocumentSession.ts');
    expect(appSource).toContain('useDocumentSession({');
    expect(sessionSource).toContain('const loaded = await loadPdf(');
    expect(sessionSource).toContain("if (loaded) {\n        void idbSaveActivePdf(bytes, fileName);\n        onScreenChange('reader');");
    expect(sessionSource.indexOf('const loaded = await loadPdf(')).toBeLessThan(
      sessionSource.indexOf('void idbSaveActivePdf(bytes, fileName)')
    );
  });
});
