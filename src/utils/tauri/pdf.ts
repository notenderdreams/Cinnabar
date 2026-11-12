import { commands } from '../../lib/bindings';

export async function tauriDeletePdfPage(
  pdfBytes: Uint8Array,
  pageNumber: number,
): Promise<Uint8Array | null> {
  try {
    const res = await commands.deletePdfPageNative(Array.from(pdfBytes), pageNumber);
    if (res.status === 'ok') {
      return new Uint8Array(res.data);
    }
    console.warn('Native delete page returned error:', res.error);
    return null;
  } catch (err) {
    console.warn('Native delete page failed:', err);
    return null;
  }
}

export async function tauriAddBlankPageBelow(
  pdfBytes: Uint8Array,
  pageNumber: number,
): Promise<Uint8Array | null> {
  try {
    const res = await commands.addBlankPageBelowNative(Array.from(pdfBytes), pageNumber);
    if (res.status === 'ok') {
      return new Uint8Array(res.data);
    }
    console.warn('Native add blank page returned error:', res.error);
    return null;
  } catch (err) {
    console.warn('Native add blank page failed:', err);
    return null;
  }
}
