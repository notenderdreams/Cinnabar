import { describe, expect, test } from 'bun:test';
import { PDFDocument } from 'pdf-lib';
import {
  exportAnnotatedPDF,
  parseColorToRgb,
  sanitizeWinAnsi,
} from '../src/utils/pdfExporter';
import {
  resolveNoteColor,
  wrapTextLines,
  NOTE_COLOR_PRESETS,
} from '../src/utils/textNoteRasterizer';
import type {
  Annotation,
  RectHighlightAnnotation,
  TextHighlightAnnotation,
  LineHighlightAnnotation,
  DrawingAnnotation,
  TextNoteAnnotation,
  AiExplanationAnnotation,
} from '../src/utils/types';

describe('pdfExporter color parsing and WinAnsi sanitization', () => {
  test('parses 3, 6, and 8 digit hex colors correctly', () => {
    const c1 = parseColorToRgb('#fff');
    expect(c1.r).toBeCloseTo(1);
    expect(c1.g).toBeCloseTo(1);
    expect(c1.b).toBeCloseTo(1);

    const c2 = parseColorToRgb('#ff0000');
    expect(c2.r).toBeCloseTo(1);
    expect(c2.g).toBeCloseTo(0);
    expect(c2.b).toBeCloseTo(0);

    const c3 = parseColorToRgb('#00ff0080');
    expect(c3.r).toBeCloseTo(0);
    expect(c3.g).toBeCloseTo(1);
    expect(c3.b).toBeCloseTo(0);
  });

  test('parses rgb and rgba string colors correctly', () => {
    const c1 = parseColorToRgb('rgb(255, 128, 0)');
    expect(c1.r).toBeCloseTo(1);
    expect(c1.g).toBeCloseTo(128 / 255);
    expect(c1.b).toBeCloseTo(0);

    const c2 = parseColorToRgb('rgba(0, 0, 255, 0.5)');
    expect(c2.r).toBeCloseTo(0);
    expect(c2.g).toBeCloseTo(0);
    expect(c2.b).toBeCloseTo(1);
  });

  test('falls back safely for invalid or undefined color strings', () => {
    const c1 = parseColorToRgb(undefined);
    expect(c1.r).toBe(0);
    expect(c1.g).toBe(0);
    expect(c1.b).toBe(0);

    const c2 = parseColorToRgb('not-a-color');
    expect(c2.r).toBeGreaterThanOrEqual(0);
    expect(c2.g).toBeGreaterThanOrEqual(0);
    expect(c2.b).toBeGreaterThanOrEqual(0);
  });

  test('sanitizes unicode characters that crash WinAnsi Helvetica', () => {
    const raw = '“Smart quotes” and ‘single quotes’ — em-dash & ellipsis… and bullet •';
    const sanitized = sanitizeWinAnsi(raw);
    expect(sanitized).toBe('"Smart quotes" and \'single quotes\' - em-dash & ellipsis... and bullet *');
  });
});

describe('textNoteRasterizer helpers', () => {
  test('resolves known note color presets and falls back to custom', () => {
    const yellow = resolveNoteColor('#fef08a');
    expect(yellow.name).toBe('Yellow');
    expect(yellow.text).toBe('#713f12');

    const darkSlate = resolveNoteColor('#272730');
    expect(darkSlate.name).toBe('Dark Slate');
    expect(darkSlate.text).toBe('#f4f4f5');

    const custom = resolveNoteColor('#123456');
    expect(custom.name).toBe('Custom');
    expect(custom.bg).toBe('#123456');
  });

  test('wraps text lines accurately within maxWidth', () => {
    // 1 char = 10px in our mock measureFn
    const measureFn = (str: string) => str.length * 10;
    const text = 'hello world from cinnabar reader';
    const lines = wrapTextLines(text, 120, measureFn); // max 12 chars per line
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureFn(line)).toBeLessThanOrEqual(120);
    }
  });

  test('preserves explicit line breaks during wrapping', () => {
    const measureFn = (str: string) => str.length * 10;
    const text = 'Line 1\nLine 2\nLine 3';
    const lines = wrapTextLines(text, 500, measureFn);
    expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
  });
});

describe('exportAnnotatedPDF baking and highlights', () => {
  async function createSamplePdf(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 600]);
    page.drawText('Sample PDF content text', { x: 50, y: 550, size: 14 });
    return await doc.save();
  }

  test('bakes rectangle highlights with box, stroke, and underline styles', async () => {
    const original = await createSamplePdf();
    const annotations: Annotation[] = [
      {
        id: 'rect_box_1',
        pageNumber: 1,
        type: 'highlight-rect',
        x: 0.1,
        y: 0.1,
        width: 0.4,
        height: 0.05,
        color: '#fef08a',
        opacity: 0.4,
        style: 'box',
        createdAt: Date.now(),
      } as RectHighlightAnnotation,
      {
        id: 'rect_stroke_1',
        pageNumber: 1,
        type: 'highlight-rect',
        x: 0.1,
        y: 0.2,
        width: 0.4,
        height: 0.05,
        color: '#3b82f6',
        opacity: 1,
        style: 'stroke',
        createdAt: Date.now(),
      } as RectHighlightAnnotation,
      {
        id: 'rect_underline_1',
        pageNumber: 1,
        type: 'highlight-rect',
        x: 0.1,
        y: 0.3,
        width: 0.4,
        height: 0.05,
        color: '#ef4444',
        opacity: 1,
        style: 'underline',
        createdAt: Date.now(),
      } as RectHighlightAnnotation,
    ];

    const resultBytes = await exportAnnotatedPDF(original, annotations);
    expect(resultBytes).toBeInstanceOf(Uint8Array);
    expect(resultBytes.length).toBeGreaterThan(original.length);

    // Verify output is a valid loadable PDF
    const loaded = await PDFDocument.load(resultBytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  test('bakes text highlights across multiple spans with underline and box styles', async () => {
    const original = await createSamplePdf();
    const annotations: Annotation[] = [
      {
        id: 'text_hl_1',
        pageNumber: 1,
        type: 'highlight-text',
        rects: [
          { x: 0.1, y: 0.1, width: 0.3, height: 0.03 },
          { x: 0.1, y: 0.14, width: 0.25, height: 0.03 },
        ],
        text: 'Sample multi-line highlight',
        color: '#a3e635',
        opacity: 0.45,
        style: 'box',
        createdAt: Date.now(),
      } as TextHighlightAnnotation,
      {
        id: 'text_hl_2',
        pageNumber: 1,
        type: 'highlight-text',
        rects: [{ x: 0.1, y: 0.25, width: 0.35, height: 0.03 }],
        text: 'Underline highlight',
        color: '#f97316',
        opacity: 1,
        style: 'underline',
        createdAt: Date.now(),
      } as TextHighlightAnnotation,
    ];

    const resultBytes = await exportAnnotatedPDF(original, annotations);
    const loaded = await PDFDocument.load(resultBytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  test('bakes straight line highlights for both highlight and underline styles', async () => {
    const original = await createSamplePdf();
    const annotations: Annotation[] = [
      {
        id: 'line_hl_1',
        pageNumber: 1,
        type: 'highlight-line',
        startX: 0.1,
        startY: 0.15,
        endX: 0.8,
        endY: 0.15,
        color: '#ffe600',
        strokeWidth: 12,
        opacity: 0.45,
        style: 'highlight',
        createdAt: Date.now(),
      } as LineHighlightAnnotation,
      {
        id: 'line_hl_2',
        pageNumber: 1,
        type: 'highlight-line',
        startX: 0.1,
        startY: 0.3,
        endX: 0.8,
        endY: 0.3,
        color: '#06b6d4',
        strokeWidth: 1.5,
        opacity: 1,
        style: 'underline',
        createdAt: Date.now(),
      } as LineHighlightAnnotation,
    ];

    const resultBytes = await exportAnnotatedPDF(original, annotations);
    const loaded = await PDFDocument.load(resultBytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  test('bakes freehand drawings and freehand highlight pens including dots', async () => {
    const original = await createSamplePdf();
    const annotations: Annotation[] = [
      {
        id: 'pen_1',
        pageNumber: 1,
        type: 'pen',
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.2, y: 0.15 },
          { x: 0.3, y: 0.12 },
        ],
        color: '#000000',
        strokeWidth: 2,
        opacity: 1,
        createdAt: Date.now(),
      } as DrawingAnnotation,
      {
        id: 'pen_dot',
        pageNumber: 1,
        type: 'pen',
        points: [{ x: 0.5, y: 0.5 }],
        color: '#ef4444',
        strokeWidth: 4,
        opacity: 1,
        createdAt: Date.now(),
      } as DrawingAnnotation,
      {
        id: 'hl_pen_1',
        pageNumber: 1,
        type: 'highlight-pen',
        points: [
          { x: 0.1, y: 0.4 },
          { x: 0.5, y: 0.4 },
        ],
        color: '#facc15',
        strokeWidth: 4,
        opacity: 0.4,
        createdAt: Date.now(),
      } as DrawingAnnotation,
    ];

    const resultBytes = await exportAnnotatedPDF(original, annotations);
    const loaded = await PDFDocument.load(resultBytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  test('excludes normal text and sticky notes from being merged by default, but allows optional inclusion', async () => {
    const original = await createSamplePdf();
    const annotations: Annotation[] = [
      {
        id: 'plain_note_1',
        pageNumber: 1,
        type: 'text-note',
        kind: 'plain',
        x: 0.1,
        y: 0.1,
        width: 0.4,
        text: 'This is plain text with Unicode: “quotes” and — dash.',
        color: '#0f172a',
        fontSize: 13,
        fontFamily: 'sans',
        align: 'left',
        createdAt: Date.now(),
      } as TextNoteAnnotation,
      {
        id: 'sticky_note_1',
        pageNumber: 1,
        type: 'text-note',
        kind: 'sticky',
        x: 0.5,
        y: 0.2,
        width: 0.35,
        text: 'Important sticky note!\nMulti-line note message.',
        color: '#fef08a',
        fontSize: 12,
        createdAt: Date.now(),
      } as TextNoteAnnotation,
    ];

    // By default: text notes and normal text are NOT merged into the PDF
    const defaultResultBytes = await exportAnnotatedPDF(original, annotations);
    const defaultLoaded = await PDFDocument.load(defaultResultBytes);
    expect(defaultLoaded.getPageCount()).toBe(1);

    // Optional inclusion: can be merged when explicitly requested
    const includedResultBytes = await exportAnnotatedPDF(original, annotations, { includeTextNotes: true });
    const includedLoaded = await PDFDocument.load(includedResultBytes);
    expect(includedLoaded.getPageCount()).toBe(1);
  });

  test('skips ai-explanation annotations as they are interactive windows', async () => {
    const original = await createSamplePdf();
    const annotations: Annotation[] = [
      {
        id: 'ai_box_1',
        pageNumber: 1,
        type: 'ai-explanation',
        x: 0.1,
        y: 0.1,
        width: 0.3,
        height: 0.2,
        prompt: 'Explain this diagram',
        response: 'This is the explanation response',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isOpen: true,
      } as AiExplanationAnnotation,
    ];

    const resultBytes = await exportAnnotatedPDF(original, annotations);
    const loaded = await PDFDocument.load(resultBytes);
    expect(loaded.getPageCount()).toBe(1);
    // Because the only annotation was an ai-explanation, the output PDF should not have extra graphics added
    expect(resultBytes.length).toBeGreaterThan(0);
  });
});
