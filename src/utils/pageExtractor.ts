import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import {
  isTauri,
  tauriCopyImageToClipboard,
  tauriCopyTextToClipboard,
  tauriDeletePdfPage,
  tauriAddBlankPageBelow,
} from './tauriBridge';

/**
 * Universal clipboard text writer with native desktop bridge and browser fallback
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // Strategy 1: Tauri native desktop pasteboard
  if (isTauri()) {
    try {
      const nativeOk = await tauriCopyTextToClipboard(text);
      if (nativeOk) return true;
    } catch (e) {
      console.warn('Tauri native copy text failed, trying browser clipboard:', e);
    }
  }

  // Strategy 2: Async Clipboard API
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, attempting execCommand fallback:', err);
    }
  }

  // Strategy 3: Hidden textarea with execCommand('copy')
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, 999999);
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) return true;
  } catch (err) {
    console.error('execCommand copy failed:', err);
  }

  return false;
}

/**
 * Extract clean, structured text from any PDF.js page
 */
export async function extractPageText(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number | unknown
): Promise<string> {
  const safePageNum =
    typeof pageNumber === 'number' && !isNaN(pageNumber)
      ? Math.max(1, Math.floor(pageNumber))
      : 1;

  let page: Awaited<ReturnType<typeof pdfDoc.getPage>> | null = null;
  try {
    page = await pdfDoc.getPage(safePageNum);
    const textContent = await page.getTextContent();

    if (!textContent || !textContent.items || textContent.items.length === 0) {
      return '';
    }

    let extractedText = '';
    let lastY: number | null = null;

    for (const rawItem of textContent.items) {
      if ('str' in rawItem) {
        const item = rawItem as { str: string; transform?: number[]; hasEOL?: boolean };
        const text = item.str;
        if (!text) continue;

        // Detect vertical line breaks using coordinate transform matrix
        const currentY = item.transform ? item.transform[5] : null;
        if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 6) {
          extractedText += '\n';
        } else if (
          extractedText.length > 0 &&
          !extractedText.endsWith(' ') &&
          !extractedText.endsWith('\n')
        ) {
          extractedText += ' ';
        }

        extractedText += text;

        if (item.hasEOL) {
          extractedText += '\n';
        }

        lastY = currentY;
      }
    }

    return extractedText.trim();
  } catch (err) {
    console.error(`Error extracting text from page ${safePageNum}:`, err);
    return '';
  } finally {
    if (page) {
      try {
        page.cleanup();
      } catch {}
    }
  }
}

/**
 * Capture full composite page canvas (from DOM if rendered, or directly via PDF.js offscreen renderer)
 */
export async function capturePageCompositeCanvas(
  pageNumber: number | unknown,
  pdfDoc?: PDFDocumentProxy | null,
  pageIdPrefix: string = 'pdf-page'
): Promise<HTMLCanvasElement | null> {
  const safePageNum =
    typeof pageNumber === 'number' && !isNaN(pageNumber)
      ? Math.max(1, Math.floor(pageNumber))
      : 1;

  const pageContainer = document.getElementById(`${pageIdPrefix}-${safePageNum}`);
  const pdfCanvas = pageContainer?.querySelector('canvas') as HTMLCanvasElement | null;

  // Fast path: capture already-rendered DOM canvas with annotations
  if (pdfCanvas && pdfCanvas.width > 0 && pdfCanvas.height > 0) {
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = pdfCanvas.width;
    outputCanvas.height = pdfCanvas.height;
    const ctx = outputCanvas.getContext('2d');
    if (!ctx) return null;

    // 1. Fill solid white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

    // 2. Draw base PDF canvas
    ctx.drawImage(pdfCanvas, 0, 0);

    // 3. Draw annotations and overlay layers
    if (pageContainer) {
      const otherCanvases = pageContainer.querySelectorAll('canvas');
      otherCanvases.forEach((c) => {
        if (c !== pdfCanvas && c.width > 0 && c.height > 0) {
          ctx.drawImage(c, 0, 0, outputCanvas.width, outputCanvas.height);
        }
      });
    }

    return outputCanvas;
  }

  if (pdfDoc) {
    let page: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | null = null;
    try {
      page = await pdfDoc.getPage(safePageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = Math.floor(viewport.width);
      offscreenCanvas.height = Math.floor(viewport.height);
      const ctx = offscreenCanvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

      await page.render({
        canvasContext: ctx,
        viewport,
      }).promise;

      return offscreenCanvas;
    } catch (err) {
      console.error(`Direct offscreen render failed for page ${safePageNum}:`, err);
    } finally {
      if (page) {
        try {
          page.cleanup();
        } catch {}
      }
    }
  }

  return null;
}

/**
 * Copy composite page image directly to system clipboard as image/png
 * (Uses native OS pasteboard in Tauri, and standard Clipboard API in browsers)
 */
export async function copyPageImageToClipboard(
  pageNumber: number | unknown,
  pdfDoc?: PDFDocumentProxy | null,
  pageIdPrefix: string = 'pdf-page'
): Promise<boolean> {
  const canvas = await capturePageCompositeCanvas(pageNumber, pdfDoc, pageIdPrefix);
  if (!canvas) return false;

  const dataUrl = canvas.toDataURL('image/png');

  // Strategy 1: Tauri native desktop pasteboard (macOS/Windows/Linux)
  if (isTauri()) {
    try {
      const nativeOk = await tauriCopyImageToClipboard(dataUrl);
      if (nativeOk) return true;
    } catch (e) {
      console.warn('Tauri native copy image failed, attempting browser clipboard:', e);
    }
  }

  // Strategy 2: Modern Browser Async Clipboard API
  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      const blobPromise = new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob returned null'));
        }, 'image/png');
      });

      const item = new ClipboardItem({ 'image/png': blobPromise });
      await navigator.clipboard.write([item]);
      return true;
    } catch (clipErr) {
      console.error('Browser ClipboardItem write failed:', clipErr);
    }
  }

  return false;
}

/**
 * Copy a cropped region of a PDF page directly to the clipboard as an image
 */
export async function copyRegionImageToClipboard(
  pageNumber: number | unknown,
  rect: { x: number; y: number; width: number; height: number },
  pdfDoc?: PDFDocumentProxy | null,
  pageIdPrefix: string = 'pdf-page'
): Promise<boolean> {
  const safePageNum =
    typeof pageNumber === 'number' && !isNaN(pageNumber)
      ? Math.max(1, Math.floor(pageNumber))
      : 1;

  const pageContainer =
    document.getElementById(`${pageIdPrefix}-${safePageNum}`) ||
    document.querySelector<HTMLElement>(`[data-pdf-page-number="${safePageNum}"]`);
  const pdfCanvas = pageContainer?.querySelector('canvas') as HTMLCanvasElement | null;

  try {
    if (pdfCanvas && pdfCanvas.width > 0 && pdfCanvas.height > 0) {
      const W = pdfCanvas.width;
      const H = pdfCanvas.height;

      const sx = Math.max(0, Math.floor(rect.x * W));
      const sy = Math.max(0, Math.floor(rect.y * H));
      const sw = Math.min(W - sx, Math.max(4, Math.ceil(rect.width * W)));
      const sh = Math.min(H - sy, Math.max(4, Math.ceil(rect.height * H)));

      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = sw;
      outputCanvas.height = sh;
      const ctx = outputCanvas.getContext('2d');
      if (!ctx) return false;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sw, sh);

      try {
        ctx.drawImage(pdfCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
      } catch (err) {
        console.warn('Canvas region drawImage failed:', err);
      }

      if (pageContainer) {
        const otherCanvases = pageContainer.querySelectorAll('canvas');
        otherCanvases.forEach((c) => {
          if (c !== pdfCanvas && c.width > 0 && c.height > 0) {
            try {
              const csx = Math.max(0, Math.floor(rect.x * c.width));
              const csy = Math.max(0, Math.floor(rect.y * c.height));
              const csw = Math.min(c.width - csx, Math.max(4, Math.ceil(rect.width * c.width)));
              const csh = Math.min(c.height - csy, Math.max(4, Math.ceil(rect.height * c.height)));
              ctx.drawImage(c, csx, csy, csw, csh, 0, 0, sw, sh);
            } catch (e) {
              console.warn('Could not draw secondary canvas overlay:', e);
            }
          }
        });
      }

      const dataUrl = outputCanvas.toDataURL('image/png');

      if (isTauri()) {
        try {
          const nativeOk = await tauriCopyImageToClipboard(dataUrl);
          if (nativeOk) return true;
        } catch (e) {
          console.warn('Tauri native copy region image failed:', e);
        }
      }

      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        try {
          const blobPromise = new Promise<Blob>((resolve, reject) => {
            outputCanvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Canvas toBlob returned null'));
            }, 'image/png');
          });

          const item = new ClipboardItem({ 'image/png': blobPromise });
          await navigator.clipboard.write([item]);
          return true;
        } catch (clipErr) {
          console.error('Browser ClipboardItem write failed:', clipErr);
        }
      }

      return false;
    }
  } catch (err) {
    console.warn('DOM canvas crop failed, falling back to direct PDF render:', err);
  }

  if (pdfDoc) {
    let page: Awaited<ReturnType<typeof pdfDoc.getPage>> | null = null;
    try {
      page = await pdfDoc.getPage(safePageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = Math.floor(viewport.width);
      fullCanvas.height = Math.floor(viewport.height);
      const fullCtx = fullCanvas.getContext('2d');
      if (!fullCtx) return false;

      fullCtx.fillStyle = '#ffffff';
      fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);

      await page.render({
        canvasContext: fullCtx,
        viewport,
      }).promise;

      const W = fullCanvas.width;
      const H = fullCanvas.height;
      const sx = Math.max(0, Math.floor(rect.x * W));
      const sy = Math.max(0, Math.floor(rect.y * H));
      const sw = Math.min(W - sx, Math.max(4, Math.ceil(rect.width * W)));
      const sh = Math.min(H - sy, Math.max(4, Math.ceil(rect.height * H)));

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = sw;
      cropCanvas.height = sh;
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) return false;

      cropCtx.fillStyle = '#ffffff';
      cropCtx.fillRect(0, 0, sw, sh);
      cropCtx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

      const dataUrl = cropCanvas.toDataURL('image/png');

      if (isTauri()) {
        const nativeOk = await tauriCopyImageToClipboard(dataUrl);
        if (nativeOk) return true;
      }

      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const blobPromise = new Promise<Blob>((resolve, reject) => {
          cropCanvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob returned null'));
          }, 'image/png');
        });
        const item = new ClipboardItem({ 'image/png': blobPromise });
        await navigator.clipboard.write([item]);
        return true;
      }
    } catch (err) {
      console.error('Direct offscreen region render failed:', err);
    } finally {
      if (page) {
        try {
          page.cleanup();
        } catch {}
      }
    }
  }

  return false;
}

/** Remove one page from a PDF and return the updated document bytes. */
export async function deletePageFromPdf(
  pdfBytes: Uint8Array,
  pageNumber: number
): Promise<Uint8Array> {
  if (isTauri()) {
    try {
      const nativeBytes = await tauriDeletePdfPage(pdfBytes, pageNumber);
      if (nativeBytes) return nativeBytes;
    } catch (err) {
      console.warn('Native delete page failed, falling back to pdf-lib:', err);
    }
  }

  const document = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pageCount = document.getPageCount();
  if (pageCount <= 1) throw new Error('A PDF must keep at least one page.');
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
    throw new Error(`Page ${pageNumber} does not exist.`);
  }

  document.removePage(pageNumber - 1);
  return document.save({ useObjectStreams: true });
}

/** Insert a new blank page below (after) the specified page with identical dimensions and rotation. */
export async function addBlankPageBelow(
  pdfBytes: Uint8Array,
  pageNumber: number
): Promise<Uint8Array> {
  if (isTauri()) {
    try {
      const nativeBytes = await tauriAddBlankPageBelow(pdfBytes, pageNumber);
      if (nativeBytes) return nativeBytes;
    } catch (err) {
      console.warn('Native add blank page failed, falling back to pdf-lib:', err);
    }
  }

  const document = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pageCount = document.getPageCount();
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
    throw new Error(`Page ${pageNumber} does not exist.`);
  }

  const targetPageIndex = pageNumber - 1;
  const targetPage = document.getPage(targetPageIndex);
  const { width, height } = targetPage.getSize();
  const rotation = targetPage.getRotation();

  const newPage = document.insertPage(pageNumber, [width, height]);
  if (rotation) {
    newPage.setRotation(rotation);
  }

  return document.save({ useObjectStreams: true });
}

/** Shift entries on pages after the newly inserted page, preserving unpaged entries. */
export function reindexAfterPageInsertion<T>(
  entries: T[],
  insertedAfterPageNumber: number
): T[] {
  return entries.map((entry) => {
    const pageNumber = (entry as { pageNumber?: unknown }).pageNumber;
    if (typeof pageNumber !== 'number') return entry;
    if (pageNumber <= insertedAfterPageNumber) return entry;
    return { ...entry, pageNumber: pageNumber + 1 };
  });
}

/** Remove entries attached to a deleted page and shift later ones, preserving unpaged entries. */
export function reindexAfterPageDeletion<T>(
  entries: T[],
  deletedPageNumber: number
): T[] {
  return entries.flatMap((entry) => {
    const pageNumber = (entry as { pageNumber?: unknown }).pageNumber;
    if (typeof pageNumber !== 'number') return [entry];
    if (pageNumber === deletedPageNumber) return [];
    if (pageNumber < deletedPageNumber) return [entry];
    return [{ ...entry, pageNumber: pageNumber - 1 }];
  });
}

/**
 * Download composite page image as high-res JPG (Optional standalone download action)
 */
export async function downloadPageAsJpg(
  pageNumber: number | unknown,
  pdfDoc?: PDFDocumentProxy | null,
  baseFileName: string = 'document'
): Promise<boolean> {
  const canvas = await capturePageCompositeCanvas(pageNumber, pdfDoc);
  if (!canvas) return false;

  const safePageNum =
    typeof pageNumber === 'number' && !isNaN(pageNumber)
      ? Math.max(1, Math.floor(pageNumber))
      : 1;

  try {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const link = document.createElement('a');
    link.href = dataUrl;
    const cleanName = baseFileName.replace(/\.pdf$/i, '');
    link.download = `${cleanName}_page_${safePageNum}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (err) {
    console.error('Failed to download JPG:', err);
    return false;
  }
}
