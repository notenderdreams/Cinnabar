import type { TextNoteAnnotation } from '../types/index';

export interface NoteColorPreset {
  name: string;
  bg: string;
  text: string;
  border: string;
}

export const NOTE_COLOR_PRESETS: readonly NoteColorPreset[] = [
  { name: 'Yellow', bg: '#fef08a', text: '#713f12', border: '#fde047' },
  { name: 'Amber', bg: '#fde68a', text: '#78350f', border: '#fcd34d' },
  { name: 'Green', bg: '#bbf7d0', text: '#14532d', border: '#86efac' },
  { name: 'Blue', bg: '#bae6fd', text: '#0c4a6e', border: '#7dd3fc' },
  { name: 'Coral', bg: '#fecdd3', text: '#881337', border: '#fda4af' },
  { name: 'Purple', bg: '#e9d5ff', text: '#581c87', border: '#d8b4fe' },
  { name: 'Dark Slate', bg: '#272730', text: '#f4f4f5', border: '#444452' },
];

export function resolveNoteColor(colorHex: string | undefined): NoteColorPreset {
  if (!colorHex) return NOTE_COLOR_PRESETS[0];
  const lower = colorHex.toLowerCase().trim();
  const found = NOTE_COLOR_PRESETS.find((c) => c.bg.toLowerCase() === lower);
  if (found) return found;
  return {
    name: 'Custom',
    bg: colorHex,
    text: '#18181b',
    border: colorHex,
  };
}

export function wrapTextLines(
  text: string,
  maxWidth: number,
  measureFn: (str: string) => number
): string[] {
  const rawParagraphs = text.split('\n');
  const wrappedLines: string[] = [];

  for (const para of rawParagraphs) {
    if (para === '') {
      wrappedLines.push('');
      continue;
    }

    const words = para.split(' ');
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const candidate = currentLine ? `${currentLine} ${word}` : word;

      if (measureFn(candidate) <= maxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          wrappedLines.push(currentLine);
          currentLine = '';
        }

        // Break very long single word if it exceeds maxWidth
        if (measureFn(word) > maxWidth) {
          let chunk = '';
          for (const char of word) {
            if (measureFn(chunk + char) <= maxWidth) {
              chunk += char;
            } else {
              if (chunk) wrappedLines.push(chunk);
              chunk = char;
            }
          }
          currentLine = chunk;
        } else {
          currentLine = word;
        }
      }
    }

    if (currentLine) {
      wrappedLines.push(currentLine);
    }
  }

  return wrappedLines.length > 0 ? wrappedLines : [''];
}

export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        try {
          const ab = await blob.arrayBuffer();
          resolve(new Uint8Array(ab));
        } catch {
          resolve(null);
        }
      }, 'image/png');
    });
  }

  if (typeof canvas.toDataURL === 'function') {
    const dataUrl = canvas.toDataURL('image/png');
    const base64Index = dataUrl.indexOf(',');
    if (base64Index >= 0) {
      const base64 = dataUrl.slice(base64Index + 1);
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }
  }

  return null;
}

export async function rasterizeStickyNote(
  annotation: TextNoteAnnotation,
  pageWidth: number
): Promise<{ pngBytes: Uint8Array; width: number; height: number } | null> {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }

  const relScale = pageWidth / 612;
  const color = resolveNoteColor(annotation.color);
  const targetWidth = Math.round((annotation.width ?? 0.20) * pageWidth);

  const padding = Math.max(3, Math.round(6 * relScale));
  const contentWidth = Math.max(20, targetWidth - padding * 2);
  const baseFontSize = annotation.fontSize ? annotation.fontSize * 0.65 : 8.5;
  const fontSize = Math.max(5.5, Math.round(baseFontSize * relScale));
  const fontStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  if (!mctx) return null;
  mctx.font = `${fontSize}px ${fontStack}`;

  const lines = wrapTextLines(annotation.text || '', contentWidth, (s) => mctx.measureText(s).width);
  const lineHeight = Math.round(fontSize * 1.35);
  const headerHeight = Math.max(10, Math.round(16 * relScale));
  const bodyHeight = lines.length * lineHeight;
  const targetHeight = Math.max(Math.round(26 * relScale), padding * 2 + headerHeight + bodyHeight);

  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(targetWidth * dpr);
  canvas.height = Math.round(targetHeight * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, targetWidth, targetHeight);

  // Background card with rounded corners
  const radius = Math.max(2.5, Math.round(5 * relScale));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(0, 0, targetWidth, targetHeight, radius);
  } else {
    ctx.moveTo(radius, 0);
    ctx.lineTo(targetWidth - radius, 0);
    ctx.quadraticCurveTo(targetWidth, 0, targetWidth, radius);
    ctx.lineTo(targetWidth, targetHeight - radius);
    ctx.quadraticCurveTo(targetWidth, targetHeight, targetWidth - radius, targetHeight);
    ctx.lineTo(radius, targetHeight);
    ctx.quadraticCurveTo(0, targetHeight, 0, targetHeight - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
  }
  ctx.fillStyle = color.bg;
  ctx.fill();
  ctx.lineWidth = Math.max(0.75, Math.round(0.75 * relScale));
  ctx.strokeStyle = color.border;
  ctx.stroke();

  // Header separator line
  const isDarkSlate = color.bg.toLowerCase() === '#272730';
  const sepY = Math.round(18 * relScale);
  ctx.beginPath();
  ctx.moveTo(padding, sepY);
  ctx.lineTo(targetWidth - padding, sepY);
  ctx.strokeStyle = isDarkSlate ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';
  ctx.lineWidth = Math.max(0.75, Math.round(0.75 * relScale));
  ctx.stroke();

  // "NOTE" header label
  ctx.font = `600 ${Math.max(5.5, Math.round(7.5 * relScale))}px ${fontStack}`;
  ctx.fillStyle = isDarkSlate ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.55)';
  ctx.fillText('NOTE', padding + 1, Math.round(13 * relScale));

  // Text body
  ctx.font = `${fontSize}px ${fontStack}`;
  ctx.fillStyle = color.text;
  const bodyStartY = Math.round(23 * relScale);
  for (let i = 0; i < lines.length; i++) {
    const y = bodyStartY + (i + 0.8) * lineHeight;
    ctx.fillText(lines[i], padding, y);
  }

  const pngBytes = await canvasToPngBytes(canvas);
  if (!pngBytes) return null;

  return {
    pngBytes,
    width: targetWidth,
    height: targetHeight,
  };
}

export async function rasterizePlainText(
  annotation: TextNoteAnnotation,
  pageWidth: number
): Promise<{ pngBytes: Uint8Array; width: number; height: number } | null> {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }

  const relScale = pageWidth / 612;
  const fontStack =
    annotation.fontFamily === 'serif'
      ? 'Georgia, Cambria, "Times New Roman", Times, serif'
      : annotation.fontFamily === 'mono'
        ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
        : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  const baseFontSize = annotation.fontSize || 14;
  const fontSize = Math.max(6, Math.round(baseFontSize * relScale));
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  if (!mctx) return null;
  mctx.font = `${fontSize}px ${fontStack}`;

  let targetWidth: number;
  let lines: string[];

  if (annotation.width) {
    targetWidth = Math.round(annotation.width * pageWidth);
    lines = wrapTextLines(
      annotation.text || '',
      Math.max(20, targetWidth - Math.round(8 * relScale)),
      (s) => mctx.measureText(s).width
    );
  } else {
    const rawLines = (annotation.text || '').split('\n');
    let maxW = 0;
    for (const l of rawLines) {
      const w = mctx.measureText(l).width;
      if (w > maxW) maxW = w;
    }
    targetWidth = Math.min(pageWidth, Math.max(30, Math.ceil(maxW) + Math.round(12 * relScale)));
    lines = rawLines.length > 0 ? rawLines : [''];
  }

  const lineHeight = Math.round(fontSize * 1.45);
  const targetHeight = Math.max(lineHeight, lines.length * lineHeight + Math.round(4 * relScale));

  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(targetWidth * dpr);
  canvas.height = Math.round(targetHeight * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.font = `${fontSize}px ${fontStack}`;
  ctx.fillStyle = annotation.color || '#000000';
  const align = annotation.align || 'left';
  ctx.textAlign = align;

  let textX = Math.round(2 * relScale);
  if (align === 'center') textX = targetWidth / 2;
  else if (align === 'right') textX = targetWidth - Math.round(2 * relScale);

  for (let i = 0; i < lines.length; i++) {
    const y = (i + 0.82) * lineHeight + Math.round(2 * relScale);
    ctx.fillText(lines[i], textX, y);
  }

  const pngBytes = await canvasToPngBytes(canvas);
  if (!pngBytes) return null;

  return {
    pngBytes,
    width: targetWidth,
    height: targetHeight,
  };
}
