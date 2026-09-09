import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import type {
  Annotation,
  AttachedImageAnnotation,
  DrawingAnnotation,
  LineHighlightAnnotation,
  RectHighlightAnnotation,
  TextHighlightAnnotation,
  TextNoteAnnotation,
} from './types';
import { isTauri, tauriSavePdf, tauriSaveJson } from './tauriBridge';

// Helper to convert hex color string (#rrggbb or #rrggbbaa) to RGB (0..1)
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let cleaned = hex.replace('#', '');
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map((c) => c + c).join('');
  }
  const num = parseInt(cleaned.slice(0, 6), 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
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

/**
 * Bakes all annotations, images, and highlights into the original PDF binary
 * and returns the new modified PDF bytes.
 */
export async function exportAnnotatedPDF(
  originalPdfBytes: Uint8Array,
  annotations: Annotation[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const totalPages = pdfDoc.getPageCount();
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = pdfDoc.getPage(pageNum - 1);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const pageAnnotations = annotations.filter((a) => a.pageNumber === pageNum);

    for (const ann of pageAnnotations) {
      if (ann.type === 'highlight-rect') {
        const hRect = ann as RectHighlightAnnotation;
        const color = hexToRgb(hRect.color);
        const x = hRect.x * pageWidth;
        const width = hRect.width * pageWidth;
        const height = hRect.height * pageHeight;
        // PDF coordinates are (0,0) at bottom-left
        const y = pageHeight - (hRect.y * pageHeight + height);

        if (hRect.style === 'stroke') {
          page.drawRectangle({
            x,
            y,
            width,
            height,
            borderColor: rgb(color.r, color.g, color.b),
            borderWidth: 1.5,
            opacity: 0.9,
          });
        } else if (hRect.style === 'underline') {
          page.drawLine({
            start: { x, y: y + 1 },
            end: { x: x + width, y: y + 1 },
            thickness: 1.5,
            color: rgb(color.r, color.g, color.b),
            opacity: 0.9,
          });
        } else {
          page.drawRectangle({
            x,
            y,
            width,
            height,
            color: rgb(color.r, color.g, color.b),
            opacity: hRect.opacity || 0.4,
          });
        }
      } else if (ann.type === 'highlight-text') {
        const hText = ann as TextHighlightAnnotation;
        const color = hexToRgb(hText.color);
        for (const rect of hText.rects) {
          const x = rect.x * pageWidth;
          const width = rect.width * pageWidth;
          const height = rect.height * pageHeight;
          const y = pageHeight - (rect.y * pageHeight + height);

          if (hText.style === 'underline') {
            page.drawLine({
              start: { x, y: y + 1 },
              end: { x: x + width, y: y + 1 },
              thickness: 2,
              color: rgb(color.r, color.g, color.b),
              opacity: 0.9,
            });
          } else {
            page.drawRectangle({
              x,
              y,
              width,
              height,
              color: rgb(color.r, color.g, color.b),
              opacity: hText.opacity || 0.45,
            });
          }
        }
      } else if (ann.type === 'image') {
        const imgAnn = ann as AttachedImageAnnotation;
        try {
          // If image was attached in inverted mode and invertInLightMode is enabled, invert its pixels for the exported light PDF
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
      } else if (ann.type === 'pen' || ann.type === 'highlight-pen') {
        const drawAnn = ann as DrawingAnnotation;
        const color = hexToRgb(drawAnn.color);
        const pts = drawAnn.points;
        if (pts.length > 1) {
          // Draw line segments between successive points
          for (let i = 0; i < pts.length - 1; i++) {
            const startX = pts[i].x * pageWidth;
            const startY = pageHeight - pts[i].y * pageHeight;
            const endX = pts[i + 1].x * pageWidth;
            const endY = pageHeight - pts[i + 1].y * pageHeight;

            page.drawLine({
              start: { x: startX, y: startY },
              end: { x: endX, y: endY },
              thickness: (drawAnn.strokeWidth || 3) * (drawAnn.type === 'highlight-pen' ? 3 : 1),
              color: rgb(color.r, color.g, color.b),
              opacity: drawAnn.opacity || (drawAnn.type === 'highlight-pen' ? 0.4 : 1),
            });
          }
        }
      } else if (ann.type === 'highlight-line') {
        const lineAnn = ann as LineHighlightAnnotation;
        const color = hexToRgb(lineAnn.color || '#ffe600');
        const startX = lineAnn.startX * pageWidth;
        const startY = pageHeight - lineAnn.startY * pageHeight;
        const endX = lineAnn.endX * pageWidth;
        const endY = pageHeight - lineAnn.endY * pageHeight;

        page.drawLine({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          thickness: (lineAnn.strokeWidth || 4) * 2.2,
          color: rgb(color.r, color.g, color.b),
          opacity: lineAnn.opacity || 0.45,
        });
      } else if (ann.type === 'text-note') {
        const textAnn = ann as TextNoteAnnotation;
        const fontSize = textAnn.fontSize || 11;
        const lines = textAnn.text.split('\n');
        const lineHeight = fontSize * 1.35;
        const boxPadding = 6;

        let maxLineWidth = 0;
        for (const line of lines) {
          const w = fontHelvetica.widthOfTextAtSize(line, fontSize);
          if (w > maxLineWidth) maxLineWidth = w;
        }

        const boxWidth = Math.max(maxLineWidth + boxPadding * 2, 60);
        const boxHeight = lines.length * lineHeight + boxPadding * 2;
        const x = textAnn.x * pageWidth;
        const yTop = pageHeight - textAnn.y * pageHeight;
        const yBottom = yTop - boxHeight;
        const isPlainText = textAnn.kind === 'plain';

        if (!isPlainText) {
          page.drawRectangle({
            x,
            y: yBottom,
            width: boxWidth,
            height: boxHeight,
            color: rgb(0.99, 0.94, 0.54),
            borderColor: rgb(0.99, 0.88, 0.28),
            borderWidth: 1,
          });
        }

        const textColor = isPlainText ? hexToRgb(textAnn.color || '#18181b') : null;

        // Draw text lines
        for (let l = 0; l < lines.length; l++) {
          page.drawText(lines[l], {
            x: x + (isPlainText ? 0 : boxPadding),
            y: yTop - (isPlainText ? 0 : boxPadding) - (l + 0.8) * lineHeight,
            size: fontSize,
            font: fontHelvetica,
            color: textColor
              ? rgb(textColor.r, textColor.g, textColor.b)
              : rgb(0.15, 0.15, 0.18),
          });
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
    const res = await tauriSavePdf(pdfBytes, fileName);
    if (res.success) return res;
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
    const res = await tauriSaveJson(jsonString, fileName);
    if (res.success) return res;
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
