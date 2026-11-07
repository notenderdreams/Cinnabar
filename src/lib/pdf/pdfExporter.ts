import { PDFDocument, rgb, degrees, StandardFonts, BlendMode, LineCapStyle } from 'pdf-lib';
import type {
  Annotation,
  AttachedImageAnnotation,
  DrawingAnnotation,
  LineHighlightAnnotation,
  RectHighlightAnnotation,
  TextHighlightAnnotation,
  TextNoteAnnotation,
} from '../types/index';
import { isTauri, tauriSavePdf, tauriSaveJson } from '../../utils/tauriBridge';
import { rasterizeStickyNote, rasterizePlainText } from '../annotations/textNoteRasterizer';

// Robust helper to convert any color format (hex3, hex6, hex8, rgb, rgba, named colors) to RGB (0..1)
export function parseColorToRgb(colorStr: string | undefined): { r: number; g: number; b: number } {
  if (!colorStr || typeof colorStr !== 'string') {
    return { r: 0, g: 0, b: 0 };
  }
  const str = colorStr.trim().toLowerCase();

  // Hex colors: #rgb, #rgba, #rrggbb, #rrggbbaa
  if (str.startsWith('#')) {
    let hex = str.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length >= 6) {
      const num = parseInt(hex.slice(0, 6), 16);
      if (!isNaN(num)) {
        return {
          r: ((num >> 16) & 255) / 255,
          g: ((num >> 8) & 255) / 255,
          b: (num & 255) / 255,
        };
      }
    }
  }

  // rgb(...) or rgba(...)
  const rgbMatch = str.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10))) / 255;
    const g = Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10))) / 255;
    const b = Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10))) / 255;
    return { r, g, b };
  }

  // Standard CSS named colors
  const NAMED_COLORS: Record<string, { r: number; g: number; b: number }> = {
    black: { r: 0, g: 0, b: 0 },
    white: { r: 1, g: 1, b: 1 },
    red: { r: 1, g: 0, b: 0 },
    green: { r: 0, g: 0.5, b: 0 },
    blue: { r: 0, g: 0, b: 1 },
    yellow: { r: 1, g: 1, b: 0 },
    cyan: { r: 0, g: 1, b: 1 },
    magenta: { r: 1, g: 0, b: 1 },
    gray: { r: 0.5, g: 0.5, b: 0.5 },
    grey: { r: 0.5, g: 0.5, b: 0.5 },
    orange: { r: 1, g: 0.647, b: 0 },
    purple: { r: 0.5, g: 0, b: 0.5 },
    pink: { r: 1, g: 0.753, b: 0.796 },
  };

  if (NAMED_COLORS[str]) {
    return NAMED_COLORS[str];
  }

  return { r: 0.1, g: 0.1, b: 0.12 };
}

// Ensure strings drawn with StandardFonts.Helvetica never trigger WinAnsi encoding crashes
export function sanitizeWinAnsi(text: string): string {
  if (!text) return '';
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/•/g, '*')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

// Convert any DataURL (PNG, JPG, SVG, WebP) to PNG Uint8Array via an offscreen HTMLCanvas with optional pixel color inversion
async function dataUrlToPngBytes(dataUrl: string, invertColors: boolean = false): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 400;
      canvas.height = img.naturalHeight || img.height || 300;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to create canvas 2D context'));
        return;
      }
      ctx.drawImage(img, 0, 0);

      // If image was attached in inverted mode, invert its RGB pixel values for the standard light PDF background
      if (invertColors) {
        try {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            d[i] = 255 - d[i];         // R
            d[i + 1] = 255 - d[i + 1]; // G
            d[i + 2] = 255 - d[i + 2]; // B
            // Alpha channel d[i+3] remains untouched
          }
          ctx.putImageData(imgData, 0, 0);
        } catch (e) {
          console.warn('Canvas pixel inversion warning:', e);
        }
      }

      canvas.toBlob(async (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) {
          reject(new Error('Failed to create image blob'));
          return;
        }
        try {
          const arrayBuffer = await blob.arrayBuffer();
          resolve(new Uint8Array(arrayBuffer));
        } catch (e) {
          reject(e);
        }
      }, 'image/png');
    };
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}

export interface ExportPdfOptions {
  includeTextNotes?: boolean;
  includeStickyNotes?: boolean;
}

/**
 * Bakes all annotations, images, and highlights into the original PDF binary
 * and returns the new modified PDF bytes.
 */
export async function exportAnnotatedPDF(
  originalPdfBytes: Uint8Array,
  annotations: Annotation[],
  options?: ExportPdfOptions
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = pdfDoc.getPage(pageNum - 1);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const pageAnnotations = annotations.filter((a) => a.pageNumber === pageNum);

    for (const ann of pageAnnotations) {
      // 1. Skip AI explanation windows during PDF export as requested
      if (ann.type === 'ai-explanation') {
        continue;
      }

      // 2. Rectangle Highlights
      if (ann.type === 'highlight-rect') {
        const hRect = ann as RectHighlightAnnotation;
        const color = parseColorToRgb(hRect.color);
        const normWidth = Math.abs(hRect.width);
        const normHeight = Math.abs(hRect.height);
        const normX = hRect.width < 0 ? hRect.x - normWidth : hRect.x;
        const normY = hRect.height < 0 ? hRect.y - normHeight : hRect.y;

        const x = normX * pageWidth;
        const width = normWidth * pageWidth;
        const height = normHeight * pageHeight;
        // PDF coordinates are (0,0) at bottom-left
        const y = pageHeight - (normY * pageHeight + height);

        if (hRect.style === 'stroke') {
          page.drawRectangle({
            x,
            y,
            width,
            height,
            borderColor: rgb(color.r, color.g, color.b),
            borderWidth: 1.5,
            opacity: 1,
          });
        } else if (hRect.style === 'underline') {
          page.drawLine({
            start: { x, y: y + 1 },
            end: { x: x + width, y: y + 1 },
            thickness: 1.5,
            color: rgb(color.r, color.g, color.b),
            opacity: 1,
            lineCap: LineCapStyle.Round,
          });
        } else {
          page.drawRectangle({
            x,
            y,
            width,
            height,
            color: rgb(color.r, color.g, color.b),
            opacity: hRect.opacity || 0.4,
            blendMode: BlendMode.Multiply,
          });
        }
      }

      // 3. Text Highlights (selection spans)
      else if (ann.type === 'highlight-text') {
        const hText = ann as TextHighlightAnnotation;
        const color = parseColorToRgb(hText.color);
        for (const rect of hText.rects) {
          const normWidth = Math.abs(rect.width);
          const normHeight = Math.abs(rect.height);
          const normX = rect.width < 0 ? rect.x - normWidth : rect.x;
          const normY = rect.height < 0 ? rect.y - normHeight : rect.y;

          const x = normX * pageWidth;
          const width = normWidth * pageWidth;
          const height = normHeight * pageHeight;
          const y = pageHeight - (normY * pageHeight + height);

          if (hText.style === 'underline') {
            page.drawLine({
              start: { x, y: y + 1.2 },
              end: { x: x + width, y: y + 1.2 },
              thickness: 1.5,
              color: rgb(color.r, color.g, color.b),
              opacity: 1,
              lineCap: LineCapStyle.Round,
            });
          } else {
            page.drawRectangle({
              x,
              y,
              width,
              height,
              color: rgb(color.r, color.g, color.b),
              opacity: hText.opacity || 0.45,
              blendMode: BlendMode.Multiply,
            });
          }
        }
      }

      // 4. Straight Line Highlights
      else if (ann.type === 'highlight-line') {
        const lineAnn = ann as LineHighlightAnnotation;
        const color = parseColorToRgb(lineAnn.color || '#ffe600');
        const startX = lineAnn.startX * pageWidth;
        const startY = pageHeight - lineAnn.startY * pageHeight;
        const endX = lineAnn.endX * pageWidth;
        const endY = pageHeight - lineAnn.endY * pageHeight;

        const isUnderline = lineAnn.style === 'underline';
        const thickness = isUnderline ? 1.5 : (lineAnn.strokeWidth || 12);
        const opacity = isUnderline ? 1 : (lineAnn.opacity || 0.45);

        page.drawLine({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          thickness,
          color: rgb(color.r, color.g, color.b),
          opacity,
          lineCap: LineCapStyle.Round,
          blendMode: isUnderline ? undefined : BlendMode.Multiply,
        });
      }

      // 5. Freehand Drawings & Freehand Highlighters
      else if (ann.type === 'pen' || ann.type === 'highlight-pen') {
        const drawAnn = ann as DrawingAnnotation;
        const isHighlight = drawAnn.type === 'highlight-pen';
        const color = parseColorToRgb(drawAnn.color);
        const pts = drawAnn.points;
        const thickness = isHighlight
          ? (drawAnn.strokeWidth || 3) * 2.5
          : (drawAnn.strokeWidth || 2);
        const opacity = drawAnn.opacity ?? (isHighlight ? 0.45 : 1);
        const blendMode = isHighlight ? BlendMode.Multiply : undefined;

        if (pts.length === 1) {
          const px = pts[0].x * pageWidth;
          const py = pageHeight - pts[0].y * pageHeight;
          page.drawCircle({
            x: px,
            y: py,
            size: Math.max(1, thickness / 2),
            color: rgb(color.r, color.g, color.b),
            opacity,
            blendMode,
          });
        } else if (pts.length > 1) {
          for (let i = 0; i < pts.length - 1; i++) {
            const startX = pts[i].x * pageWidth;
            const startY = pageHeight - pts[i].y * pageHeight;
            const endX = pts[i + 1].x * pageWidth;
            const endY = pageHeight - pts[i + 1].y * pageHeight;

            page.drawLine({
              start: { x: startX, y: startY },
              end: { x: endX, y: endY },
              thickness,
              color: rgb(color.r, color.g, color.b),
              opacity,
              lineCap: LineCapStyle.Round,
              blendMode,
            });
          }
        }
      }

      // 6. Attached Images
      else if (ann.type === 'image') {
        const imgAnn = ann as AttachedImageAnnotation;
        try {
          const shouldInvertPixels = Boolean(imgAnn.invertInLightMode ?? imgAnn.attachedInInvertedMode);
          const pngBytes = await dataUrlToPngBytes(imgAnn.dataUrl, shouldInvertPixels);
          const embeddedImage = await pdfDoc.embedPng(pngBytes);

          const x = imgAnn.x * pageWidth;
          const width = imgAnn.width * pageWidth;
          const height = imgAnn.height * pageHeight;
          const y = pageHeight - (imgAnn.y * pageHeight + height);

          page.drawImage(embeddedImage, {
            x,
            y,
            width,
            height,
            opacity: imgAnn.opacity ?? 1,
            rotate: imgAnn.rotation ? degrees(imgAnn.rotation) : undefined,
          });
        } catch (err) {
          console.error('Failed to embed attached image into PDF:', err);
        }
      }

      // 7. Text Notes (Include text, not the sticky note)
      else if (ann.type === 'text-note') {
        const textAnn = ann as TextNoteAnnotation;
        const isPlainText = textAnn.kind === 'plain';

        // Include the text not the sticky note
        if (!isPlainText) {
          if (!options?.includeStickyNotes) {
            continue;
          }
        }

        if (options?.includeTextNotes === false) {
          continue;
        }

        if (!textAnn.text || !textAnn.text.trim()) {
          continue;
        }

        // Attempt rasterization for pixel-perfect card styling, wrapping, and full Unicode/emoji support
        let rasterResult: { pngBytes: Uint8Array; width: number; height: number } | null = null;
        try {
          if (isPlainText) {
            rasterResult = await rasterizePlainText(textAnn, pageWidth);
          } else {
            rasterResult = await rasterizeStickyNote(textAnn, pageWidth);
          }
        } catch (rasterErr) {
          console.warn('Text note rasterization failed, falling back to vector:', rasterErr);
        }

        if (rasterResult && rasterResult.pngBytes.length > 0) {
          try {
            const embeddedImg = await pdfDoc.embedPng(rasterResult.pngBytes);
            const drawWidth = rasterResult.width;
            const drawHeight = rasterResult.height;
            const x = textAnn.x * pageWidth;
            const yTop = pageHeight - textAnn.y * pageHeight;
            const y = yTop - drawHeight;

            page.drawImage(embeddedImg, {
              x,
              y,
              width: drawWidth,
              height: drawHeight,
              opacity: 1,
            });
            continue;
          } catch (embedErr) {
            console.warn('Embedding rasterized note failed, falling back:', embedErr);
          }
        }

        // Vector / standard text fallback for headless/test environments
        const relScale = pageWidth / 612;
        const fontSize = Math.max(6, Math.round((textAnn.fontSize || (isPlainText ? 14 : 11)) * relScale));
        const lines = textAnn.text.split('\n');
        const lineHeight = fontSize * 1.35;
        const boxPadding = isPlainText ? 0 : Math.max(3, Math.round(6 * relScale));

        let maxLineWidth = 0;
        for (const line of lines) {
          try {
            const w = fontHelvetica.widthOfTextAtSize(sanitizeWinAnsi(line), fontSize);
            if (w > maxLineWidth) maxLineWidth = w;
          } catch {
            maxLineWidth = Math.max(maxLineWidth, line.length * fontSize * 0.5);
          }
        }

        const boxWidth = textAnn.width
          ? textAnn.width * pageWidth
          : Math.max(maxLineWidth + boxPadding * 2, Math.round(40 * relScale));
        const boxHeight = lines.length * lineHeight + boxPadding * 2;
        const x = textAnn.x * pageWidth;
        const yTop = pageHeight - textAnn.y * pageHeight;
        const yBottom = yTop - boxHeight;

        if (!isPlainText) {
          const noteColor = parseColorToRgb(textAnn.color || '#fef08a');
          page.drawRectangle({
            x,
            y: yBottom,
            width: boxWidth,
            height: boxHeight,
            color: rgb(noteColor.r, noteColor.g, noteColor.b),
            borderColor: rgb(
              Math.max(0, noteColor.r - 0.12),
              Math.max(0, noteColor.g - 0.12),
              Math.max(0, noteColor.b - 0.12)
            ),
            borderWidth: Math.max(0.5, 1 * relScale),
          });
        }

        const textColor = parseColorToRgb(isPlainText ? (textAnn.color || '#000000') : '#18181b');

        // Draw text lines with WinAnsi sanitization
        for (let l = 0; l < lines.length; l++) {
          const safeText = sanitizeWinAnsi(lines[l]);
          if (!safeText) continue;
          try {
            page.drawText(safeText, {
              x: x + (isPlainText ? 0 : boxPadding),
              y: yTop - (isPlainText ? 0 : boxPadding) - (l + 0.82) * lineHeight,
              size: fontSize,
              font: fontHelvetica,
              color: rgb(textColor.r, textColor.g, textColor.b),
            });
          } catch (e) {
            console.warn('Fallback drawText failed for line:', e);
          }
        }
      }
    }
  }

  return await pdfDoc.save();
}

/**
 * Downloads or saves the generated PDF bytes via Tauri native dialog or Web Browser download
 */
export async function savePdfFile(
  pdfBytes: Uint8Array,
  fileName: string = 'document_annotated.pdf'
): Promise<{ success: boolean; path?: string }> {
  if (isTauri()) {
    return await tauriSavePdf(pdfBytes, fileName);
  }

  // Web Browser fallback
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { success: true };
}

/**
 * Saves annotations session as JSON file via Tauri native dialog or Web Browser
 */
export async function saveAnnotationsJson(
  annotations: Annotation[],
  fileName: string = 'annotations.json'
): Promise<{ success: boolean; path?: string }> {
  const jsonString = JSON.stringify(annotations, null, 2);

  if (isTauri()) {
    return await tauriSaveJson(jsonString, fileName);
  }

  // Web Browser fallback
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { success: true };
}
