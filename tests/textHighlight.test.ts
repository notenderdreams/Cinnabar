import { describe, expect, test } from 'bun:test';
import { normalizeSelectionRects } from '../src/lib/annotations/textHighlight';

describe('normalizeSelectionRects', () => {
  test('converts browser selection rectangles to normalized PDF page coordinates', () => {
    const rects = normalizeSelectionRects(
      [{ left: 120, top: 240, right: 320, bottom: 260, width: 200, height: 20 }],
      { left: 100, top: 200, right: 500, bottom: 800, width: 400, height: 600 }
    );

    expect(rects).toEqual([
      {
        x: 0.05,
        y: 40 / 600,
        width: 0.5,
        height: 20 / 600,
      },
    ]);
  });

  test('clips selection fragments at page boundaries and ignores other pages', () => {
    const page = { left: 100, top: 100, right: 500, bottom: 700, width: 400, height: 600 };
    const rects = normalizeSelectionRects(
      [
        { left: 80, top: 120, right: 180, bottom: 140, width: 100, height: 20 },
        { left: 120, top: 720, right: 220, bottom: 740, width: 100, height: 20 },
      ],
      page
    );

    expect(rects).toEqual([
      {
        x: 0,
        y: 20 / 600,
        width: 0.2,
        height: 20 / 600,
      },
    ]);
  });

  test('merges fragmented and overlapping word rects on a line into a single clean rectangle', () => {
    const page = { left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 };
    const rects = normalizeSelectionRects(
      [
        // Multiple fragments and words on same line with subpixel overlaps and word gaps
        { left: 100, top: 200, right: 220, bottom: 220, width: 120, height: 20 },
        { left: 218, top: 201, right: 350, bottom: 221, width: 132, height: 20 }, // 2px subpixel overlap
        { left: 355, top: 199, right: 480, bottom: 219, width: 125, height: 20 }, // 5px word space
        { left: 480, top: 200, right: 600, bottom: 220, width: 120, height: 20 },
      ],
      page
    );

    // Must result in exactly ONE single unified rectangle spanning from 100 to 600
    expect(rects.length).toBe(1);
    expect(rects[0].x).toBe(0.1);
    expect(rects[0].width).toBe(0.5); // (600 - 100) / 1000
    expect(rects[0].y).toBeCloseTo(0.199, 3);
  });
});

describe('getLineSpansAtTarget and selectFullLineAtTarget', () => {
  function createMockSpan(text: string, rect: { left: number; right: number; top: number; bottom: number }) {
    const span = {
      textContent: text,
      childNodes: [{ nodeType: 3, textContent: text }],
      firstChild: { nodeType: 3, textContent: text },
      lastChild: { nodeType: 3, textContent: text },
      closest: (selector: string) => (selector === 'span' ? span : null),
      getBoundingClientRect: () => ({
        ...rect,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
        x: rect.left,
        y: rect.top,
        toJSON: () => {},
      }),
    };
    return span as unknown as HTMLSpanElement;
  }

  function createMockContainer(spans: HTMLSpanElement[]) {
    return {
      querySelectorAll: (selector: string) => (selector === 'span' ? spans : []),
      contains: (node: unknown) => spans.includes(node as HTMLSpanElement),
    } as unknown as HTMLElement;
  }

  test('groups multiple spans on the same horizontal line into a single line selection', async () => {
    const { getLineSpansAtTarget, selectFullLineAtTarget } = await import('../src/lib/annotations/textHighlight');

    const span1 = createMockSpan('The quick ', { left: 50, right: 120, top: 100, bottom: 120 });
    const span2 = createMockSpan('brown fox ', { left: 125, right: 195, top: 100, bottom: 120 });
    const span3 = createMockSpan('jumps', { left: 200, right: 250, top: 100, bottom: 120 });
    const span4 = createMockSpan('Second line of text', { left: 50, right: 200, top: 130, bottom: 150 });

    const container = createMockContainer([span1, span2, span3, span4]);

    const lineSpans = getLineSpansAtTarget(span2, container);
    expect(lineSpans).toEqual([span1, span2, span3]);
    expect(lineSpans).not.toContain(span4);

    let setRangeCalled = false;
    let selectedText = '';
    const mockSelection = {
      removeAllRanges: () => {},
      addRange: (r: { startContainer: unknown; endContainer: unknown }) => {
        setRangeCalled = true;
      },
    };
    const origGetSelection = globalThis.window?.getSelection;
    const origDoc = globalThis.document;

    (globalThis as unknown as { window: { getSelection: () => unknown } }).window = {
      getSelection: () => mockSelection,
    };
    (globalThis as unknown as { document: { createRange: () => unknown; createTreeWalker: (node: unknown) => unknown } }).document = {
      createRange: () => ({
        setStart: () => {},
        setEnd: () => {},
      }),
      createTreeWalker: (node: unknown) => {
        const n = node as { childNodes?: { textContent: string }[] };
        let done = false;
        return {
          nextNode: () => {
            if (done) return null;
            done = true;
            return n.childNodes?.[0] || null;
          },
        };
      },
    };

    try {
      const ok = selectFullLineAtTarget(span2, container);
      expect(ok).toBe(true);
      expect(setRangeCalled).toBe(true);
    } finally {
      if (origGetSelection) {
        (globalThis as unknown as { window: { getSelection: unknown } }).window.getSelection = origGetSelection;
      }
      if (origDoc) {
        (globalThis as unknown as { document: unknown }).document = origDoc;
      } else {
        delete (globalThis as unknown as { document?: unknown }).document;
      }
    }
  });

  test('does not group spans across large column gaps on multi-column pages', async () => {
    const { getLineSpansAtTarget } = await import('../src/lib/annotations/textHighlight');

    const col1Span1 = createMockSpan('Column 1 text ', { left: 50, right: 150, top: 100, bottom: 120 });
    const col1Span2 = createMockSpan('here', { left: 155, right: 200, top: 100, bottom: 120 });
    const col2Span = createMockSpan('Column 2 parallel text', { left: 450, right: 600, top: 100, bottom: 120 });

    const container = createMockContainer([col1Span1, col1Span2, col2Span]);

    const lineSpans = getLineSpansAtTarget(col1Span1, container);
    expect(lineSpans).toEqual([col1Span1, col1Span2]);
    expect(lineSpans).not.toContain(col2Span);
  });

  test('findHighlightAnnotationsCoveringWord and findHighlightAnnotationsCoveringLine find overlapping highlights', async () => {
    const { findHighlightAnnotationsCoveringWord, findHighlightAnnotationsCoveringLine } = await import(
      '../src/lib/annotations/textHighlight'
    );

    const rectHighlight = {
      id: 'rect_1',
      pageNumber: 1,
      type: 'highlight-rect' as const,
      x: 0.1,
      y: 0.2,
      width: 0.4,
      height: 0.05,
      color: '#fef08a',
      opacity: 0.4,
      createdAt: Date.now(),
    };

    const otherPageHighlight = {
      id: 'rect_2',
      pageNumber: 2,
      type: 'highlight-rect' as const,
      x: 0.1,
      y: 0.2,
      width: 0.4,
      height: 0.05,
      color: '#fef08a',
      opacity: 0.4,
      createdAt: Date.now(),
    };

    const wordBoundsInside = {
      pageNumber: 1,
      text: 'Sample',
      startX: 0.15,
      startY: 0.225,
      endX: 0.25,
      endY: 0.225,
      x: 0.15,
      y: 0.2,
      width: 0.1,
      height: 0.05,
    };

    const wordBoundsOutside = {
      pageNumber: 1,
      text: 'FarAway',
      startX: 0.7,
      startY: 0.8,
      endX: 0.8,
      endY: 0.8,
      x: 0.7,
      y: 0.8,
      width: 0.1,
      height: 0.05,
    };

    const lineBounds = {
      pageNumber: 1,
      text: 'Full line text here',
      startX: 0.1,
      startY: 0.225,
      endX: 0.5,
      endY: 0.225,
      x: 0.1,
      y: 0.2,
      width: 0.4,
      height: 0.05,
    };

    const annotations = [rectHighlight, otherPageHighlight];

    const wordHits = findHighlightAnnotationsCoveringWord(annotations, 1, wordBoundsInside, 1000, 1000);
    expect(wordHits).toHaveLength(1);
    expect(wordHits[0].id).toBe('rect_1');

    const wordMisses = findHighlightAnnotationsCoveringWord(annotations, 1, wordBoundsOutside, 1000, 1000);
    expect(wordMisses).toHaveLength(0);

    const lineHits = findHighlightAnnotationsCoveringLine(annotations, 1, lineBounds, 1000, 1000);
    expect(lineHits).toHaveLength(1);
    expect(lineHits[0].id).toBe('rect_1');
  });

  test('computeLineHighlightCoverage correctly calculates coverage fraction and handles multiple highlights', async () => {
    const { computeLineHighlightCoverage } = await import('../src/lib/annotations/textHighlight');

    const lineBounds = {
      pageNumber: 1,
      text: 'Full line text here',
      startX: 0.1,
      startY: 0.225,
      endX: 0.5,
      endY: 0.225,
      x: 0.1,
      y: 0.2,
      width: 0.4,
      height: 0.05,
    };

    const wordHighlight1: RectHighlightAnnotation = {
      id: 'rect_w1',
      pageNumber: 1,
      type: 'highlight-rect',
      x: 0.1,
      y: 0.2,
      width: 0.1, // 0.1 / 0.4 = 25% of line
      height: 0.05,
      color: '#ffff00',
      createdAt: 1,
    };

    const wordHighlight2: RectHighlightAnnotation = {
      id: 'rect_w2',
      pageNumber: 1,
      type: 'highlight-rect',
      x: 0.3,
      y: 0.2,
      width: 0.1, // Another 0.1 / 0.4 = 25%
      height: 0.05,
      color: '#ffff00',
      createdAt: 2,
    };

    const fullLineHighlight: RectHighlightAnnotation = {
      id: 'rect_full',
      pageNumber: 1,
      type: 'highlight-rect',
      x: 0.1,
      y: 0.2,
      width: 0.4,
      height: 0.05,
      color: '#ffff00',
      createdAt: 3,
    };

    // No highlights
    expect(computeLineHighlightCoverage(lineBounds, [])).toBe(0);

    // Single word highlight covering 25%
    const cov1 = computeLineHighlightCoverage(lineBounds, [wordHighlight1]);
    expect(cov1).toBeCloseTo(0.25, 2);

    // Two non-overlapping word highlights covering 50%
    const cov2 = computeLineHighlightCoverage(lineBounds, [wordHighlight1, wordHighlight2]);
    expect(cov2).toBeCloseTo(0.5, 2);

    // Full line highlight covering 100%
    const covFull = computeLineHighlightCoverage(lineBounds, [fullLineHighlight]);
    expect(covFull).toBeCloseTo(1.0, 2);
  });
});
