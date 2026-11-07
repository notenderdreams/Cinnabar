import { commands } from '../../lib/bindings';
import { isTauri } from './runtime';

export async function tauriDeletePdfPage(
  pdfBytes: Uint8Array,
  pageNumber: number
): Promise<Uint8Array | null> {
  if (!isTauri()) return null;
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
  pageNumber: number
): Promise<Uint8Array | null> {
  if (!isTauri()) return null;
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

export async function tauriComputePdfFingerprint(
  pdfBytes: Uint8Array
): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const res = await commands.computePdfFingerprint(Array.from(pdfBytes));
    if (res.status === 'ok') {
      return res.data;
    }
    return null;
  } catch (err) {
    console.warn('Native compute fingerprint failed:', err);
    return null;
  }
}

export async function tauriCompressImage(
  dataUrl: string,
  maxWidth = 1920,
  quality = 85
): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const res = await commands.compressImageNative(dataUrl, maxWidth, quality);
    if (res.status === 'ok') {
      return res.data;
    }
    return null;
  } catch (err) {
    console.warn('Native compress image failed:', err);
    return null;
  }
}
