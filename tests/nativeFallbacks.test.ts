import { describe, expect, test } from 'bun:test';
import * as bridge from '../src/utils/tauriBridge';

describe('public desktop bridge in the browser', () => {
  test('file workflows return expected unavailable results without invoking native commands', async () => {
    expect(bridge.isTauri()).toBe(false);
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await bridge.tauriOpenPdf()).toBeNull();
    expect(await bridge.tauriReadFile('/book.pdf')).toBeNull();
    expect(await bridge.tauriOpenImage()).toBeNull();
    expect(await bridge.tauriOpenJson()).toBeNull();
    expect(await bridge.tauriSelectDirectory()).toBeNull();
    expect(await bridge.tauriScanDirectoryPdfs('/books')).toEqual([]);
    expect(await bridge.tauriGetDefaultDirectories()).toEqual([]);
    expect(await bridge.tauriSavePdf(bytes, 'book.pdf')).toEqual({ success: false });
    expect(await bridge.tauriWritePdf(bytes, '/book.pdf')).toBe(false);
    expect(await bridge.tauriSaveJson('[]', 'annotations.json')).toEqual({ success: false });
    expect(await bridge.tauriDeletePdfPage(bytes, 1)).toBeNull();
    expect(await bridge.tauriAddBlankPageBelow(bytes, 1)).toBeNull();
    expect(await bridge.tauriComputePdfFingerprint(bytes)).toBeNull();
    expect(await bridge.tauriCompressImage('data:image/png;base64,')).toBeNull();
  });

  test('library fallbacks preserve the public shape', async () => {
    expect(await bridge.tauriListLibrary()).toEqual({ directories: [], documents: [] });
    expect(await bridge.tauriRefreshLibrary()).toEqual({ directories: [], documents: [] });
    expect(await bridge.tauriImportLibraryPdf()).toBeNull();
    expect(await bridge.tauriImportLibraryFolder()).toBeNull();
    expect(await bridge.tauriRelinkLibraryDocument('book')).toBeNull();
  });

  test('AI fallbacks report a native requirement as a domain result', async () => {
    const provider = await bridge.getAiProviderStatus();
    expect(provider.status).toBe('native_required');
    expect(provider.availableProviders).toEqual([]);
    const response = await bridge.runAiExplanation({ requestId: 'test', prompt: 'Explain', pngDataUrl: '' });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.code).toBe('native_required');
    expect(await bridge.cancelAiExplanation('test')).toBe(false);
  });
});
