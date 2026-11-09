import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { SnippetEntry, SnippetImageEntry, StitchOptions } from '../types/index';
import { isTauri, tauriCopyImageToClipboard } from '../../utils/tauriBridge';

/**
 * Crops a normalized rectangle region from a rendered PDF page DOM canvas.
 */
export async function cropCanvasRegion(
  pageNumber: number,
  rect: { x: number; y: number; width: number; height: number },
  pdfDoc?: PDFDocumentProxy | null,
  pageIdPrefix = 'pdf-page'
): Promise<SnippetImageEntry | null> {
  const safePageNum = Math.max(1, Math.floor(pageNumber));
  const pageContainer = document.getElementById(`${pageIdPrefix}-${safePageNum}`);
  const pdfCanvas = pageContainer?.querySelector('canvas') as HTMLCanvasElement | null;

  try {
    if (pdfCanvas && pdfCanvas.width > 0 && pdfCanvas.height > 0) {
      const W = pdfCanvas.width;
      const H = pdfCanvas.height;

      const sx = Math.max(0, Math.floor(rect.x * W));
      const sy = Math.max(0, Math.floor(rect.y * H));
      const sw = Math.min(W - sx, Math.max(1, Math.ceil(rect.width * W)));
      const sh = Math.min(H - sy, Math.max(1, Math.ceil(rect.height * H)));

      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = sw;
      outputCanvas.height = sh;
      const ctx = outputCanvas.getContext('2d');
      if (!ctx) return null;

      // 1. Fill solid white background so transparent parts don't render black
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sw, sh);

      // 2. Draw base PDF canvas crop
      try {
        ctx.drawImage(pdfCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
      } catch (err) {
        console.warn('Direct canvas drawImage failed:', err);
      }

      // 3. Draw annotations/overlays crop safely
      if (pageContainer) {
        const otherCanvases = pageContainer.querySelectorAll('canvas');
        otherCanvases.forEach((c) => {
          if (c !== pdfCanvas && c.width > 0 && c.height > 0) {
            try {
              const csx = Math.max(0, Math.floor(rect.x * c.width));
              const csy = Math.max(0, Math.floor(rect.y * c.height));
              const csw = Math.min(c.width - csx, Math.max(1, Math.ceil(rect.width * c.width)));
              const csh = Math.min(c.height - csy, Math.max(1, Math.ceil(rect.height * c.height)));
              ctx.drawImage(c, csx, csy, csw, csh, 0, 0, sw, sh);
            } catch (e) {
              console.warn('Could not draw secondary canvas overlay:', e);
            }
          }
        });
      }

      const dataUrl = outputCanvas.toDataURL('image/png');
      return {
        id: `snip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'image',
        pageNumber: safePageNum,
        dataUrl,
        width: sw,
        height: sh,
        aspectRatio: sw / sh,
        createdAt: Date.now(),
        label: `Page ${safePageNum}`,
      };
    }
  } catch (err) {
    console.warn('DOM canvas crop failed, falling back to direct PDF render:', err);
  }

  // Fallback: render directly from PDF document proxy at 2x scale if DOM canvas is not mounted
  if (pdfDoc) {
    let page: Awaited<ReturnType<typeof pdfDoc.getPage>> | null = null;
    try {
      page = await pdfDoc.getPage(safePageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = Math.floor(viewport.width);
      fullCanvas.height = Math.floor(viewport.height);
      const fullCtx = fullCanvas.getContext('2d');
      if (!fullCtx) return null;

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
      const sw = Math.min(W - sx, Math.max(1, Math.ceil(rect.width * W)));
      const sh = Math.min(H - sy, Math.max(1, Math.ceil(rect.height * H)));

      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = sw;
      outputCanvas.height = sh;
      const ctx = outputCanvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sw, sh);
      ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

      const dataUrl = outputCanvas.toDataURL('image/png');
      return {
        id: `snip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'image',
        pageNumber: safePageNum,
        dataUrl,
        width: sw,
        height: sh,
        aspectRatio: sw / sh,
        createdAt: Date.now(),
        label: `Page ${safePageNum}`,
      };
    } catch (err) {
      console.error(`Direct render fallback failed for snippet crop:`, err);
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

export interface MeasuredStitchItem {
  entry: SnippetEntry;
  height: number;
  imageWidth?: number;
  imageHeight?: number;
}

export interface StitchLayout {
  canvasWidth: number;
  canvasHeight: number;
  columnWidth: number;
  padding: number;
  gap: number;
  items: MeasuredStitchItem[];
}

/**
 * Pure calculation of stitched canvas dimensions and item positions
 */
export function computeStitchLayout(
  snippets: SnippetEntry[],
  options?: StitchOptions,
  imageDimensions?: Map<string, { width: number; height: number }>
): StitchLayout {
  const padding = options?.padding ?? 24;
  const gap = options?.gap ?? 18;
  const includePageBadges = options?.includePageBadges ?? true;

  let maxImageWidth = 0;
  for (const entry of snippets) {
    if (entry.type === 'image') {
      const natural = imageDimensions?.get(entry.id);
      const w = natural ? natural.width : entry.width;
      if (w > maxImageWidth) maxImageWidth = w;
    }
  }

  const columnWidth = Math.max(640, maxImageWidth);
  const canvasWidth = columnWidth + padding * 2;

  const measuredItems: MeasuredStitchItem[] = [];
  let totalContentHeight = 0;

  for (const entry of snippets) {
    if (entry.type === 'image') {
      const natural = imageDimensions?.get(entry.id);
      const imgW = natural ? natural.width : entry.width;
      const imgH = natural ? natural.height : entry.height;

      const scale = imgW > columnWidth ? columnWidth / imgW : 1;
      const renderW = Math.round(imgW * scale);
      const renderH = Math.round(imgH * scale);
      const itemH = renderH + (includePageBadges ? 24 : 0);

      measuredItems.push({
        entry,
        height: itemH,
        imageWidth: renderW,
        imageHeight: renderH,
      });
      totalContentHeight += itemH;
    } else if (entry.type === 'divider') {
      const dividerH = entry.label ? 36 : 24;
      measuredItems.push({
        entry,
        height: dividerH,
      });
      totalContentHeight += dividerH;
    }
  }

  const totalGaps = Math.max(0, measuredItems.length - 1) * gap;
  const canvasHeight = padding * 2 + totalContentHeight + totalGaps;

  return {
    canvasWidth,
    canvasHeight,
    columnWidth,
    padding,
    gap,
    items: measuredItems,
  };
}

/**
 * Loads an image from DataURL as an HTMLImageElement
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Image is not defined in this environment'));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Stitches multiple snippets and horizontal divider lines into a single vertical composite canvas.
 */
export async function stitchSnippetsToCanvas(
  snippets: SnippetEntry[],
  options?: StitchOptions
): Promise<HTMLCanvasElement | null> {
  if (!snippets || snippets.length === 0 || typeof document === 'undefined') return null;

  const padding = options?.padding ?? 24;
  const gap = options?.gap ?? 18;
  const bgColor = options?.backgroundColor ?? '#ffffff';
  const isDarkBg = bgColor === '#1e1e24' || bgColor === '#18181f' || bgColor === '#000000';
  const dividerLineColor = options?.dividerColor ?? (isDarkBg ? '#3e3e4c' : '#e2e8f0');
  const textColor = isDarkBg ? '#f0f0f4' : '#1e293b';
  const badgeBg = isDarkBg ? '#2d2d38' : '#f1f5f9';
  const badgeBorder = isDarkBg ? '#444456' : '#cbd5e1';
  const badgeText = isDarkBg ? '#94a3b8' : '#475569';
  const includePageBadges = options?.includePageBadges ?? true;

  // 1. Preload all image assets
  const loadedImages = new Map<string, HTMLImageElement>();
  for (const entry of snippets) {
    if (entry.type === 'image' && entry.dataUrl) {
      try {
        const img = await loadImage(entry.dataUrl);
        loadedImages.set(entry.id, img);
      } catch (err) {
        console.warn(`Failed to preload snippet image ${entry.id}:`, err);
      }
    }
  }

  // 2. Compute unified column width
  let maxImageWidth = 0;
  for (const entry of snippets) {
    if (entry.type === 'image') {
      const img = loadedImages.get(entry.id);
      const w = img ? img.naturalWidth : entry.width;
      if (w > maxImageWidth) maxImageWidth = w;
    }
  }

  const columnWidth = Math.max(640, maxImageWidth);
  const canvasWidth = columnWidth + padding * 2;

  // 3. Compute item dimensions and total canvas height
  interface MeasuredItem {
    entry: SnippetEntry;
    height: number;
    imageWidth?: number;
    imageHeight?: number;
  }

  const measuredItems: MeasuredItem[] = [];
  let totalContentHeight = 0;

  for (const entry of snippets) {
    if (entry.type === 'image') {
      const img = loadedImages.get(entry.id);
      const imgW = img ? img.naturalWidth : entry.width;
      const imgH = img ? img.naturalHeight : entry.height;

      // Preserve native aspect ratio: scale to columnWidth if wider than columnWidth
      const scale = imgW > columnWidth ? columnWidth / imgW : 1;
      const renderW = Math.round(imgW * scale);
      const renderH = Math.round(imgH * scale);
      const itemH = renderH + (includePageBadges ? 24 : 0);

      measuredItems.push({
        entry,
        height: itemH,
        imageWidth: renderW,
        imageHeight: renderH,
      });
      totalContentHeight += itemH;
    } else if (entry.type === 'divider') {
      const dividerH = entry.label ? 36 : 24;
      measuredItems.push({
        entry,
        height: dividerH,
      });
      totalContentHeight += dividerH;
    }
  }

  const totalGaps = Math.max(0, measuredItems.length - 1) * gap;
  const canvasHeight = padding * 2 + totalContentHeight + totalGaps;

  // 4. Create and paint the composite canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Fill background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 5. Draw items sequentially
  let currentY = padding;

  for (const item of measuredItems) {
    const { entry, height, imageWidth, imageHeight } = item;

    if (entry.type === 'image') {
      const img = loadedImages.get(entry.id);
      const renderW = imageWidth || entry.width;
      const renderH = imageHeight || entry.height;
      const renderX = Math.round((canvasWidth - renderW) / 2);

      let imageDrawY = currentY;

      // Draw subtle page badge banner if enabled
      if (includePageBadges) {
        const badgeLabel = entry.label || `Page ${entry.pageNumber}`;
        ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        const textMetrics = ctx.measureText(badgeLabel);
        const badgeW = textMetrics.width + 16;
        const badgeH = 18;
        const badgeX = renderX;
        const badgeY = currentY;

        // Badge pill
        ctx.fillStyle = badgeBg;
        ctx.strokeStyle = badgeBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
        ctx.fill();
        ctx.stroke();

        // Badge text
        ctx.fillStyle = badgeText;
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeLabel, badgeX + 8, badgeY + badgeH / 2 + 0.5);

        imageDrawY = currentY + 24;
      }

      // Draw image
      if (img) {
        // Draw subtle border around image
        ctx.strokeStyle = isDarkBg ? '#343442' : '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(renderX - 0.5, imageDrawY - 0.5, renderW + 1, renderH + 1);

        ctx.drawImage(img, renderX, imageDrawY, renderW, renderH);
      }

      currentY += height + gap;
    } else if (entry.type === 'divider') {
      const lineY = currentY + height / 2;
      const lineLeft = padding;
      const lineRight = canvasWidth - padding;

      // Draw horizontal line
      ctx.strokeStyle = dividerLineColor;
      ctx.lineWidth = entry.style === 'thick' ? 2.5 : 1.5;

      if (entry.style === 'dashed') {
        ctx.setLineDash([6, 4]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(lineLeft, lineY);
      ctx.lineTo(lineRight, lineY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw center label pill if divider has a label
      if (entry.label && entry.label.trim()) {
        const labelText = entry.label.trim();
        ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        const metrics = ctx.measureText(labelText);
        const pillW = metrics.width + 20;
        const pillH = 22;
        const pillX = (canvasWidth - pillW) / 2;
        const pillY = lineY - pillH / 2;

        // Pill background
        ctx.fillStyle = bgColor;
        ctx.fillRect(pillX - 2, pillY, pillW + 4, pillH);

        ctx.fillStyle = badgeBg;
        ctx.strokeStyle = dividerLineColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 11);
        ctx.fill();
        ctx.stroke();

        // Pill text
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, canvasWidth / 2, lineY);
        ctx.textAlign = 'left';
      }

      currentY += height + gap;
    }
  }

  return canvas;
}

/**
 * Stitches all snippets into a single image and copies it to the system clipboard.
 */
export async function copyStitchedSnippetsToClipboard(
  snippets: SnippetEntry[],
  options?: StitchOptions
): Promise<boolean> {
  const canvas = await stitchSnippetsToCanvas(snippets, options);
  if (!canvas) return false;

  const dataUrl = canvas.toDataURL('image/png');

  // Strategy 1: Tauri native desktop pasteboard (macOS/Windows/Linux)
  if (isTauri()) {
    try {
      const nativeOk = await tauriCopyImageToClipboard(dataUrl);
      if (nativeOk) return true;
    } catch (e) {
      console.warn('Tauri native copy stitched image failed, attempting browser clipboard:', e);
    }
  }

  // Strategy 2: Modern Browser Async Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
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
      console.error('Browser ClipboardItem write failed for stitched image:', clipErr);
    }
  }

  return false;
}

/**
 * Downloads the stitched snippets image as a PNG file.
 */
export async function downloadStitchedSnippets(
  snippets: SnippetEntry[],
  baseFileName: string = 'cinnabar_snippets',
  options?: StitchOptions
): Promise<boolean> {
  const canvas = await stitchSnippetsToCanvas(snippets, options);
  if (!canvas) return false;

  try {
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    const cleanName = baseFileName.replace(/\.pdf$/i, '');
    link.download = `${cleanName}_ai_digest.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (err) {
    console.error('Failed to download stitched snippet image:', err);
    return false;
  }
}
