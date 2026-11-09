import type {
  Annotation,
  HighlightStyle,
  TextHighlightAnnotation,
  RectHighlightAnnotation,
} from '../types/index';
import { resolveHighlightOpacity } from './highlightStyle';
import { isAnnotationHitByEraser } from './eraserUtils';
import { getAnnotationBoundingBox } from './annotationPresentation';

export interface ClientRectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Merges and smooths fragmented DOM selection client rects into unified horizontal line bars.
 * Fixes jitter, subpixel discrepancies, and breaks between words across line spans.
 */
export function normalizeSelectionRects(
  rawRects: ClientRectLike[],
  pageRect: ClientRectLike
): TextHighlightAnnotation['rects'] {
  if (pageRect.width <= 0 || pageRect.height <= 0 || rawRects.length === 0) {
    return [];
  }

  // 1. Clamp rects to page boundaries and discard subpixel/degenerate fragments
  const validRects: ClientRectLike[] = [];
  for (const r of rawRects) {
    const left = Math.max(r.left, pageRect.left);
    const top = Math.max(r.top, pageRect.top);
    const right = Math.min(r.right, pageRect.right);
    const bottom = Math.min(r.bottom, pageRect.bottom);
    const width = right - left;
    const height = bottom - top;

    if (width > 0.5 && height > 0.5) {
      validRects.push({ left, top, right, bottom, width, height });
    }
  }

  if (validRects.length === 0) return [];

  // 2. Sort rects primarily top-to-bottom, secondarily left-to-right
  validRects.sort((a, b) => a.top - b.top || a.left - b.left);

  // 3. Cluster rects into lines based on vertical overlap with multi-pass line merging
  let lines: ClientRectLike[][] = [];
  for (const rect of validRects) {
    let matchedLine: ClientRectLike[] | null = null;

    for (const line of lines) {
      const lineTop = Math.min(...line.map((r) => r.top));
      const lineBottom = Math.max(...line.map((r) => r.bottom));
      const lineHeight = lineBottom - lineTop;

      const overlap = Math.min(rect.bottom, lineBottom) - Math.max(rect.top, lineTop);
      const minH = Math.min(rect.height, lineHeight);
      const centerDist = Math.abs((rect.top + rect.bottom) / 2 - (lineTop + lineBottom) / 2);

      // Overlaps by at least 30% of height or line centers/tops are close
      if (
        overlap >= minH * 0.3 ||
        centerDist <= minH * 0.55 ||
        Math.abs(rect.top - lineTop) <= 4 ||
        Math.abs(rect.bottom - lineBottom) <= 4
      ) {
        matchedLine = line;
        break;
      }
    }

    if (matchedLine) {
      matchedLine.push(rect);
    } else {
      lines.push([rect]);
    }
  }

  // Merge any lines that vertically overlap with each other
  let mergedLines: ClientRectLike[][] = [];
  for (const line of lines) {
    const lineTop = Math.min(...line.map((r) => r.top));
    const lineBottom = Math.max(...line.map((r) => r.bottom));
    const lineHeight = lineBottom - lineTop;

    let targetGroup = mergedLines.find((group) => {
      const gTop = Math.min(...group.map((r) => r.top));
      const gBottom = Math.max(...group.map((r) => r.bottom));
      const gHeight = gBottom - gTop;
      const overlap = Math.min(lineBottom, gBottom) - Math.max(lineTop, gTop);
      const minH = Math.min(lineHeight, gHeight);
      return overlap >= minH * 0.35 || Math.abs((lineTop + lineBottom) / 2 - (gTop + gBottom) / 2) <= minH * 0.5;
    });

    if (targetGroup) {
      targetGroup.push(...line);
    } else {
      mergedLines.push([...line]);
    }
  }

  // 4. For each line cluster, unify the vertical bounds and bridge horizontal word gaps into smooth bars
  const smoothedRects: ClientRectLike[] = [];

  for (const line of mergedLines) {
    line.sort((a, b) => a.left - b.left);

    const lineTop = Math.min(...line.map((r) => r.top));
    const lineBottom = Math.max(...line.map((r) => r.bottom));
    const lineHeight = lineBottom - lineTop;

    let currentBar: ClientRectLike = {
      left: line[0].left,
      top: lineTop,
      right: line[0].right,
      bottom: lineBottom,
      width: line[0].right - line[0].left,
      height: lineHeight,
    };

    for (let i = 1; i < line.length; i++) {
      const next = line[i];
      const gap = next.left - currentBar.right;
      // Bridge word gaps (up to 2.5x line height or 35px) to form a smooth single line bar
      const maxBridgeableGap = Math.max(35, lineHeight * 2.5);

      if (gap <= maxBridgeableGap) {
        currentBar.left = Math.min(currentBar.left, next.left);
        currentBar.right = Math.max(currentBar.right, next.right);
        currentBar.width = currentBar.right - currentBar.left;
      } else {
        smoothedRects.push(currentBar);
        currentBar = {
          left: next.left,
          top: lineTop,
          right: next.right,
          bottom: lineBottom,
          width: next.right - next.left,
          height: lineHeight,
        };
      }
    }

    smoothedRects.push(currentBar);
  }

  // 5. Deduplicate and merge any remaining overlapping rectangles to prevent dark overlapping seams
  const nonOverlappingRects: ClientRectLike[] = [];
  for (const rect of smoothedRects) {
    let merged = false;
    for (const existing of nonOverlappingRects) {
      const hOverlap = Math.min(rect.right, existing.right) - Math.max(rect.left, existing.left);
      const vOverlap = Math.min(rect.bottom, existing.bottom) - Math.max(rect.top, existing.top);

      if (hOverlap >= 0 && vOverlap >= 0) {
        // Merge into single bounding box
        existing.left = Math.min(existing.left, rect.left);
        existing.right = Math.max(existing.right, rect.right);
        existing.top = Math.min(existing.top, rect.top);
        existing.bottom = Math.max(existing.bottom, rect.bottom);
        existing.width = existing.right - existing.left;
        existing.height = existing.bottom - existing.top;
        merged = true;
        break;
      }
    }
    if (!merged) {
      nonOverlappingRects.push({ ...rect });
    }
  }

  // 6. Convert to normalized coordinates relative to pageRect
  return nonOverlappingRects.map((r) => ({
    x: (r.left - pageRect.left) / pageRect.width,
    y: (r.top - pageRect.top) / pageRect.height,
    width: r.width / pageRect.width,
    height: r.height / pageRect.height,
  }));
}

export function createTextHighlightsFromSelection(
  selection: Selection | null,
  color: string,
  opacity: number,
  style: HighlightStyle = 'box'
): RectHighlightAnnotation[] {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return [];

  const anchorElement = selection.anchorNode instanceof Element
    ? selection.anchorNode
    : selection.anchorNode?.parentElement;
  const focusElement = selection.focusNode instanceof Element
    ? selection.focusNode
    : selection.focusNode?.parentElement;

  if (
    !anchorElement?.closest('[data-pdf-text-layer]') ||
    !focusElement?.closest('[data-pdf-text-layer]')
  ) {
    return [];
  }

  const text = selection.toString().trim();
  if (!text) return [];

  const rangeRects = Array.from(selection.getRangeAt(0).getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0
  );
  const createdAt = Date.now();

  return Array.from(document.querySelectorAll<HTMLElement>('[data-pdf-page-number]')).flatMap(
    (page) => {
      const pageNumber = Number(page.dataset.pdfPageNumber);
      if (!Number.isInteger(pageNumber) || pageNumber < 1) return [];

      const rects = normalizeSelectionRects(rangeRects, page.getBoundingClientRect());
      if (rects.length === 0) return [];

      return rects.map((rect, idx) => ({
        id: `highlight_rect_${createdAt}_${pageNumber}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        pageNumber,
        type: 'highlight-rect' as const,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color,
        opacity: resolveHighlightOpacity(style, opacity || 0.4),
        style,
        text,
        createdAt,
      }));
    }
  );
}

/**
 * Extracts underlying text within a normalized bounding box on a rendered PDF page.
 */
export function extractTextFromDomPageRegion(
  pageNumber: number,
  normalizedBounds: { x: number; y: number; width: number; height: number },
  pageIdPrefix?: string
): string {
  if (typeof document === 'undefined') return '';

  const pageContainer = pageIdPrefix
    ? document.getElementById(`${pageIdPrefix}-${pageNumber}`)
    : document.querySelector<HTMLElement>(`[data-pdf-page-number="${pageNumber}"]`) ||
      document.getElementById(`pdf-page-${pageNumber}`);
  if (!pageContainer) return '';

  const textLayer = pageContainer.querySelector<HTMLElement>('[data-pdf-text-layer]');
  if (!textLayer) return '';

  const pageRect = pageContainer.getBoundingClientRect();
  if (pageRect.width <= 0 || pageRect.height <= 0) return '';

  // Slight padding to catch edges
  const padX = 4 / pageRect.width;
  const padY = 4 / pageRect.height;
  const minX = Math.max(0, normalizedBounds.x - padX);
  const minY = Math.max(0, normalizedBounds.y - padY);
  const maxX = Math.min(1, normalizedBounds.x + normalizedBounds.width + padX);
  const maxY = Math.min(1, normalizedBounds.y + normalizedBounds.height + padY);

  const targetLeft = pageRect.left + minX * pageRect.width;
  const targetTop = pageRect.top + minY * pageRect.height;
  const targetRight = pageRect.left + maxX * pageRect.width;
  const targetBottom = pageRect.top + maxY * pageRect.height;

  const spans = Array.from(textLayer.querySelectorAll<HTMLElement>('span'));
  const matchingSpans: { top: number; left: number; text: string }[] = [];

  for (const span of spans) {
    const text = span.textContent?.trim();
    if (!text) continue;

    const spanRect = span.getBoundingClientRect();
    if (spanRect.width <= 0 || spanRect.height <= 0) continue;

    const overlapLeft = Math.max(targetLeft, spanRect.left);
    const overlapTop = Math.max(targetTop, spanRect.top);
    const overlapRight = Math.min(targetRight, spanRect.right);
    const overlapBottom = Math.min(targetBottom, spanRect.bottom);

    const overlapW = overlapRight - overlapLeft;
    const overlapH = overlapBottom - overlapTop;

    if (
      overlapW > 0 &&
      overlapH > 0 &&
      (overlapW * overlapH >= spanRect.width * spanRect.height * 0.12 ||
        (overlapW >= Math.min(spanRect.width, 3) && overlapH >= Math.min(spanRect.height, 3)))
    ) {
      matchingSpans.push({
        top: spanRect.top,
        left: spanRect.left,
        text: span.textContent || '',
      });
    }
  }

  if (matchingSpans.length === 0) return '';

  matchingSpans.sort((a, b) => {
    if (Math.abs(a.top - b.top) <= 6) {
      return a.left - b.left;
    }
    return a.top - b.top;
  });

  return matchingSpans
    .map((s) => s.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TextLineBounds {
  pageNumber: number;
  text: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Finds all spans on the same horizontal line as a reference span or coordinate within a text layer.
 * Groups by proximity to avoid cross-column selection across large gaps.
 */
export function getLineSpansAtTarget(
  target: HTMLElement | null,
  textLayerContainer: HTMLElement | null,
  clientX?: number,
  clientY?: number
): HTMLSpanElement[] {
  if (!textLayerContainer) return [];

  const allSpans = Array.from(textLayerContainer.querySelectorAll<HTMLSpanElement>('span')).filter(
    (s) => (s.textContent?.trim().length ?? 0) > 0
  );
  if (allSpans.length === 0) return [];

  // Find reference span
  let refSpan: HTMLSpanElement | null = null;
  if (target) {
    refSpan = target.closest('span');
    if (refSpan && !textLayerContainer.contains(refSpan)) {
      refSpan = null;
    }
  }

  if (!refSpan && typeof clientX === 'number' && typeof clientY === 'number') {
    let closestDist = Infinity;
    for (const span of allSpans) {
      const rect = span.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const vDist =
        clientY >= rect.top && clientY <= rect.bottom
          ? 0
          : Math.min(Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom));

      const hDist =
        clientX >= rect.left && clientX <= rect.right
          ? 0
          : Math.min(Math.abs(clientX - rect.left), Math.abs(clientX - rect.right));

      // Heavily penalize vertical distance so we pick the correct line
      const dist = vDist * 10 + hDist;
      if (dist < closestDist) {
        closestDist = dist;
        refSpan = span;
      }
    }
  }

  if (!refSpan) return [];

  const refRect = refSpan.getBoundingClientRect();
  if (refRect.height <= 0 && refRect.width <= 0) return [refSpan];

  const matchedSpans: { span: HTMLSpanElement; rect: DOMRect }[] = [];

  for (const span of allSpans) {
    const rect = span.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const overlap = Math.min(refRect.bottom, rect.bottom) - Math.max(refRect.top, rect.top);
    const minH = Math.min(refRect.height, rect.height);
    const centerDist = Math.abs((refRect.top + refRect.bottom) / 2 - (rect.top + rect.bottom) / 2);

    if (
      overlap >= minH * 0.35 ||
      centerDist <= minH * 0.55 ||
      Math.abs(refRect.top - rect.top) <= 4
    ) {
      matchedSpans.push({ span, rect });
    }
  }

  if (matchedSpans.length === 0) return [refSpan];

  // Sort left-to-right
  matchedSpans.sort((a, b) => a.rect.left - b.rect.left);

  // Cluster spans into contiguous segments (handling columns)
  const segments: { span: HTMLSpanElement; rect: DOMRect }[][] = [];
  let currentSegment: { span: HTMLSpanElement; rect: DOMRect }[] = [matchedSpans[0]];

  for (let i = 1; i < matchedSpans.length; i++) {
    const prev = matchedSpans[i - 1];
    const curr = matchedSpans[i];
    const gap = curr.rect.left - prev.rect.right;
    const maxBridgeableGap = Math.max(32, refRect.height * 2.5);

    if (gap <= maxBridgeableGap) {
      currentSegment.push(curr);
    } else {
      segments.push(currentSegment);
      currentSegment = [curr];
    }
  }
  segments.push(currentSegment);

  // Find the segment containing refSpan
  const targetSegment = segments.find((seg) => seg.some((item) => item.span === refSpan)) || segments[0];

  return targetSegment.map((item) => item.span);
}

/**
 * Selects the entire line of text spanning across all PDF text layer spans
 * that belong to the same visual line as the clicked target or coordinates.
 */
export function selectFullLineAtTarget(
  target: HTMLElement | null,
  textLayerContainer: HTMLElement | null,
  clientX?: number,
  clientY?: number
): boolean {
  const lineSpans = getLineSpansAtTarget(target, textLayerContainer, clientX, clientY);
  if (lineSpans.length === 0) return false;

  const firstSpan = lineSpans[0];
  const lastSpan = lineSpans[lineSpans.length - 1];

  let startNode: Node = firstSpan;
  let startOffset = 0;
  const showTextFilter = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4;
  if (typeof document !== 'undefined' && document.createTreeWalker) {
    const startWalker = document.createTreeWalker(firstSpan, showTextFilter);
    const firstText = startWalker.nextNode();
    if (firstText) {
      startNode = firstText;
      startOffset = 0;
    }
  }

  let endNode: Node = lastSpan;
  let endOffset = lastSpan.childNodes.length;
  if (typeof document !== 'undefined' && document.createTreeWalker) {
    const endWalker = document.createTreeWalker(lastSpan, showTextFilter);
    let lastText: Node | null = null;
    let cur = endWalker.nextNode();
    while (cur) {
      lastText = cur;
      cur = endWalker.nextNode();
    }
    if (lastText) {
      endNode = lastText;
      endOffset = lastText.textContent ? lastText.textContent.length : 0;
    }
  }

  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }
  } catch (err) {
    console.warn('Failed to select full line:', err);
  }

  return false;
}

/**
 * Selects the word of text at a target span or coordinates within a text layer.
 */
export function selectWordAtTarget(
  target: HTMLElement | null,
  textLayerContainer: HTMLElement | null,
  clientX?: number,
  clientY?: number
): boolean {
  if (!textLayerContainer) return false;
  const allSpans = Array.from(textLayerContainer.querySelectorAll<HTMLSpanElement>('span')).filter(
    (s) => (s.textContent?.trim().length ?? 0) > 0
  );
  if (allSpans.length === 0) return false;

  let targetSpan: HTMLSpanElement | null = null;
  if (target) {
    targetSpan = target.closest('span');
    if (targetSpan && !textLayerContainer.contains(targetSpan)) {
      targetSpan = null;
    }
  }

  if (!targetSpan && typeof clientX === 'number' && typeof clientY === 'number') {
    let minDistance = Infinity;
    for (const span of allSpans) {
      const rect = span.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const inY = clientY >= rect.top - 4 && clientY <= rect.bottom + 4;
      const inX = clientX >= rect.left - 4 && clientX <= rect.right + 4;
      if (inY && inX) {
        targetSpan = span;
        break;
      }
      const vDist = inY ? 0 : Math.min(Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom));
      const hDist = inX ? 0 : Math.min(Math.abs(clientX - rect.left), Math.abs(clientX - rect.right));
      const dist = vDist * 10 + hDist;
      if (dist < minDistance) {
        minDistance = dist;
        targetSpan = span;
      }
    }
  }

  if (!targetSpan) return false;

  const textNode = targetSpan.firstChild || targetSpan;
  const spanText = targetSpan.textContent || '';
  const wordRegex = /\S+/g;
  let match: RegExpExecArray | null;
  const words: { text: string; start: number; end: number }[] = [];
  while ((match = wordRegex.exec(spanText)) !== null) {
    words.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  if (words.length === 0) return false;

  let bestWord = words[0];
  if (
    typeof clientX === 'number' &&
    typeof clientY === 'number' &&
    typeof document !== 'undefined' &&
    document.createRange &&
    textNode.nodeType === 3
  ) {
    let minWordDist = Infinity;
    for (const word of words) {
      try {
        const range = document.createRange();
        range.setStart(textNode, word.start);
        range.setEnd(textNode, word.end);
        const rect = range.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          bestWord = word;
          break;
        }
        const hDist = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
        const vDist = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
        const dist = vDist * 10 + hDist;
        if (dist < minWordDist) {
          minWordDist = dist;
          bestWord = word;
        }
      } catch {}
    }
  }

  try {
    const range = document.createRange();
    range.setStart(textNode, bestWord.start);
    range.setEnd(textNode, bestWord.end);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }
  } catch (err) {
    console.warn('Failed to select word:', err);
  }
  return false;
}

/**
 * Calculates normalized line bounds and extracted text for the line at a given normalized coordinate on a PDF page.
 */
export function getTextLineBoundsAtPoint(
  pageNumber: number,
  normalizedX: number,
  normalizedY: number
): TextLineBounds | null {
  if (typeof document === 'undefined') return null;

  const pageContainer =
    document.querySelector<HTMLElement>(`[data-pdf-page-number="${pageNumber}"]`) ||
    document.getElementById(`pdf-page-${pageNumber}`);
  if (!pageContainer) return null;

  const textLayer = pageContainer.querySelector<HTMLElement>('[data-pdf-text-layer]');
  if (!textLayer) return null;

  const pageRect = pageContainer.getBoundingClientRect();
  if (pageRect.width <= 0 || pageRect.height <= 0) return null;

  const clientX = pageRect.left + normalizedX * pageRect.width;
  const clientY = pageRect.top + normalizedY * pageRect.height;

  const lineSpans = getLineSpansAtTarget(null, textLayer, clientX, clientY);
  if (lineSpans.length === 0) return null;

  let minLeft = Infinity;
  let maxRight = -Infinity;
  let minTop = Infinity;
  let maxBottom = -Infinity;
  const texts: string[] = [];

  for (const span of lineSpans) {
    const rect = span.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    minLeft = Math.min(minLeft, rect.left);
    maxRight = Math.max(maxRight, rect.right);
    minTop = Math.min(minTop, rect.top);
    maxBottom = Math.max(maxBottom, rect.bottom);
    const txt = span.textContent?.trim();
    if (txt) texts.push(txt);
  }

  if (minLeft === Infinity || maxRight === -Infinity) return null;

  // Add slight padding so character serifs, ascenders, descenders, and punctuation are fully enclosed
  const padX = 2;
  const padY = 1.5;
  const boundLeft = Math.max(pageRect.left, minLeft - padX);
  const boundRight = Math.min(pageRect.right, maxRight + padX);
  const boundTop = Math.max(pageRect.top, minTop - padY);
  const boundBottom = Math.min(pageRect.bottom, maxBottom + padY);

  const x = Math.max(0, Math.min(1, (boundLeft - pageRect.left) / pageRect.width));
  const y = Math.max(0, Math.min(1, (boundTop - pageRect.top) / pageRect.height));
  const width = Math.max(0.005, Math.min(1 - x, (boundRight - boundLeft) / pageRect.width));
  const height = Math.max(0.005, Math.min(1 - y, (boundBottom - boundTop) / pageRect.height));

  const startX = x;
  const startY = y + height / 2;
  const endX = x + width;
  const endY = startY;

  return {
    pageNumber,
    text: texts.join(' '),
    startX,
    startY,
    endX,
    endY,
    x,
    y,
    width,
    height,
  };
}

/**
 * Calculates normalized bounds and extracted text for the single word at a given coordinate on a PDF page.
 */
export function getWordBoundsAtPoint(
  pageNumber: number,
  normalizedX: number,
  normalizedY: number
): TextLineBounds | null {
  if (typeof document === 'undefined') return null;

  const pageContainer =
    document.querySelector<HTMLElement>(`[data-pdf-page-number="${pageNumber}"]`) ||
    document.getElementById(`pdf-page-${pageNumber}`);
  if (!pageContainer) return null;

  const textLayer = pageContainer.querySelector<HTMLElement>('[data-pdf-text-layer]');
  if (!textLayer) return null;

  const pageRect = pageContainer.getBoundingClientRect();
  if (pageRect.width <= 0 || pageRect.height <= 0) return null;

  const clientX = pageRect.left + normalizedX * pageRect.width;
  const clientY = pageRect.top + normalizedY * pageRect.height;

  const allSpans = Array.from(textLayer.querySelectorAll<HTMLSpanElement>('span')).filter(
    (s) => (s.textContent?.trim().length ?? 0) > 0
  );
  if (allSpans.length === 0) return null;

  // Find candidate spans on the same line
  let targetSpan: HTMLSpanElement | null = null;
  let minDistance = Infinity;

  for (const span of allSpans) {
    const rect = span.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const inY = clientY >= rect.top - 4 && clientY <= rect.bottom + 4;
    const inX = clientX >= rect.left - 4 && clientX <= rect.right + 4;

    if (inY && inX) {
      targetSpan = span;
      break;
    }

    const vDist = inY ? 0 : Math.min(Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom));
    const hDist = inX ? 0 : Math.min(Math.abs(clientX - rect.left), Math.abs(clientX - rect.right));
    const dist = vDist * 10 + hDist;

    if (dist < minDistance) {
      minDistance = dist;
      targetSpan = span;
    }
  }

  if (!targetSpan) return null;

  const spanText = targetSpan.textContent || '';
  const textNode = targetSpan.firstChild || targetSpan;

  // Find word boundaries in targetSpan
  const wordRegex = /\S+/g;
  let match: RegExpExecArray | null;
  const words: { text: string; start: number; end: number }[] = [];
  while ((match = wordRegex.exec(spanText)) !== null) {
    words.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  if (words.length === 0) return null;

  let bestWord = words[0];
  let bestRect: { left: number; top: number; right: number; bottom: number; width: number; height: number } | null = null;
  let minWordDist = Infinity;

  for (const word of words) {
    let rect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
    if (typeof document !== 'undefined' && document.createRange && textNode.nodeType === 3) {
      try {
        const range = document.createRange();
        range.setStart(textNode, word.start);
        range.setEnd(textNode, word.end);
        const r = range.getBoundingClientRect();
        rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      } catch {
        const r = targetSpan.getBoundingClientRect();
        rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      }
    } else {
      const r = targetSpan.getBoundingClientRect();
      rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    }

    if (rect.width <= 0 || rect.height <= 0) continue;

    const inY = clientY >= rect.top - 2 && clientY <= rect.bottom + 2;
    const inX = clientX >= rect.left - 2 && clientX <= rect.right + 2;
    if (inY && inX) {
      bestWord = word;
      bestRect = rect;
      break;
    }

    const vDist = inY ? 0 : Math.min(Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom));
    const hDist = inX ? 0 : Math.min(Math.abs(clientX - rect.left), Math.abs(clientX - rect.right));
    const dist = vDist * 10 + hDist;
    if (dist < minWordDist) {
      minWordDist = dist;
      bestWord = word;
      bestRect = rect;
    }
  }

  if (!bestRect) return null;

  const padX = 1.5;
  const padY = 1;
  const boundLeft = Math.max(pageRect.left, bestRect.left - padX);
  const boundRight = Math.min(pageRect.right, bestRect.right + padX);
  const boundTop = Math.max(pageRect.top, bestRect.top - padY);
  const boundBottom = Math.min(pageRect.bottom, bestRect.bottom + padY);

  const x = Math.max(0, Math.min(1, (boundLeft - pageRect.left) / pageRect.width));
  const y = Math.max(0, Math.min(1, (boundTop - pageRect.top) / pageRect.height));
  const width = Math.max(0.003, Math.min(1 - x, (boundRight - boundLeft) / pageRect.width));
  const height = Math.max(0.003, Math.min(1 - y, (boundBottom - boundTop) / pageRect.height));

  return {
    pageNumber,
    text: bestWord.text,
    startX: x,
    startY: y + height / 2,
    endX: x + width,
    endY: y + height / 2,
    x,
    y,
    width,
    height,
  };
}

/**
 * Finds all highlight annotations on the given page that cover or overlap with a word bounding box.
 */
export function findHighlightAnnotationsCoveringWord(
  annotations: Annotation[],
  pageNumber: number,
  wordBounds: TextLineBounds,
  pageWidth: number,
  pageHeight: number
): Annotation[] {
  const pageAnns = annotations.filter((a) => a.pageNumber === pageNumber);
  const wordCenterX = (wordBounds.x + wordBounds.width / 2) * pageWidth;
  const wordCenterY = (wordBounds.y + wordBounds.height / 2) * pageHeight;

  return pageAnns.filter((ann) => {
    if (
      ann.type !== 'highlight-rect' &&
      ann.type !== 'highlight-line' &&
      ann.type !== 'highlight-text' &&
      ann.type !== 'highlight-pen'
    ) {
      return false;
    }

    // 1. Direct point hit test on center of word
    if (isAnnotationHitByEraser(ann, wordCenterX, wordCenterY, pageWidth, pageHeight, 14)) {
      return true;
    }

    // 2. Bounding box overlap test with generous tolerance
    const b = getAnnotationBoundingBox(ann);
    const bHeight = Math.max(b.height, wordBounds.height * 0.8);
    const bTop = b.y - (bHeight - b.height) / 2;
    const bBottom = bTop + bHeight;

    const hOverlap = Math.min(b.x + b.width, wordBounds.x + wordBounds.width) - Math.max(b.x, wordBounds.x);
    const vOverlap = Math.min(bBottom, wordBounds.y + wordBounds.height) - Math.max(bTop, wordBounds.y);

    return (
      hOverlap >= Math.min(b.width, wordBounds.width) * 0.25 &&
      vOverlap >= Math.min(bHeight, wordBounds.height) * 0.25
    );
  });
}

/**
 * Finds all highlight annotations on the given page that belong to or overlap with a full line bounding box.
 */
export function findHighlightAnnotationsCoveringLine(
  annotations: Annotation[],
  pageNumber: number,
  lineBounds: TextLineBounds,
  pageWidth: number,
  pageHeight: number
): Annotation[] {
  const pageAnns = annotations.filter((a) => a.pageNumber === pageNumber);
  const lineMidY = (lineBounds.y + lineBounds.height / 2) * pageHeight;
  const lineStartX = (lineBounds.x + lineBounds.width * 0.2) * pageWidth;
  const lineCenterX = (lineBounds.x + lineBounds.width * 0.5) * pageWidth;
  const lineEndX = (lineBounds.x + lineBounds.width * 0.8) * pageWidth;

  return pageAnns.filter((ann) => {
    if (
      ann.type !== 'highlight-rect' &&
      ann.type !== 'highlight-line' &&
      ann.type !== 'highlight-text' &&
      ann.type !== 'highlight-pen'
    ) {
      return false;
    }

    // 1. Direct hit-test at points along the line
    if (
      isAnnotationHitByEraser(ann, lineCenterX, lineMidY, pageWidth, pageHeight, 16) ||
      isAnnotationHitByEraser(ann, lineStartX, lineMidY, pageWidth, pageHeight, 16) ||
      isAnnotationHitByEraser(ann, lineEndX, lineMidY, pageWidth, pageHeight, 16)
    ) {
      return true;
    }

    // 2. Bounding box overlap test with line height tolerance
    const b = getAnnotationBoundingBox(ann);
    const bHeight = Math.max(b.height, lineBounds.height * 0.8);
    const bTop = b.y - (bHeight - b.height) / 2;
    const bBottom = bTop + bHeight;

    const vOverlap = Math.min(bBottom, lineBounds.y + lineBounds.height) - Math.max(bTop, lineBounds.y);
    const minH = Math.min(bHeight, lineBounds.height);
    const vCenterDist = Math.abs((bTop + bHeight / 2) - (lineBounds.y + lineBounds.height / 2));

    const isSameLine = vOverlap >= minH * 0.25 || vCenterDist <= lineBounds.height * 0.75;
    if (!isSameLine) return false;

    const hOverlap = Math.min(b.x + b.width, lineBounds.x + lineBounds.width) - Math.max(b.x, lineBounds.x);
    return hOverlap > 0.005;
  });
}

/**
 * Calculates the fraction (0.0 to 1.0) of a line bounding box covered by existing highlight annotations.
 */
export function computeLineHighlightCoverage(
  lineBounds: TextLineBounds,
  highlights: Annotation[]
): number {
  if (!highlights || highlights.length === 0 || lineBounds.width <= 0) return 0;

  const lineStart = lineBounds.x;
  const lineEnd = lineBounds.x + lineBounds.width;

  const intervals: Array<[number, number]> = [];
  for (const ann of highlights) {
    const b = getAnnotationBoundingBox(ann);
    const start = Math.max(lineStart, b.x);
    const end = Math.min(lineEnd, b.x + b.width);
    if (end > start) {
      intervals.push([start, end]);
    }
  }

  if (intervals.length === 0) return 0;

  intervals.sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = intervals[i];
    if (curr[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], curr[1]);
    } else {
      merged.push(curr);
    }
  }

  const totalCovered = merged.reduce((sum, [start, end]) => sum + (end - start), 0);
  return Math.min(1, Math.max(0, totalCovered / lineBounds.width));
}
