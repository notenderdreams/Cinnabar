import type {
  Annotation,
  DrawingAnnotation,
  LineHighlightAnnotation,
  RectHighlightAnnotation,
  TextHighlightAnnotation,
  TextNoteAnnotation,
  AiExplanationAnnotation,
  AttachedImageAnnotation,
} from './types';

export function distToSegment(
  p: { x: number; y: number },
  v: { x: number; y: number },
  w: { x: number; y: number }
): number {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

export function isAnnotationHitByEraser(
  ann: Annotation,
  px: number,
  py: number,
  pageWidth: number,
  pageHeight: number,
  eraseRadius: number = 22,
  scale: number = 1
): boolean {
  const zoomScale = Math.max(0.1, scale);
  if (ann.type === 'pen' || ann.type === 'highlight-pen') {
    const drawAnn = ann as DrawingAnnotation;
    const threshold = eraseRadius + (drawAnn.strokeWidth || 4) * zoomScale;
    if (!drawAnn.points || drawAnn.points.length === 0) return false;
    if (drawAnn.points.length === 1) {
      const ptX = drawAnn.points[0].x * pageWidth;
      const ptY = drawAnn.points[0].y * pageHeight;
      return Math.hypot(px - ptX, py - ptY) <= threshold;
    }
    for (let i = 0; i < drawAnn.points.length - 1; i++) {
      const p1 = { x: drawAnn.points[i].x * pageWidth, y: drawAnn.points[i].y * pageHeight };
      const p2 = { x: drawAnn.points[i + 1].x * pageWidth, y: drawAnn.points[i + 1].y * pageHeight };
      if (distToSegment({ x: px, y: py }, p1, p2) <= threshold) {
        return true;
      }
    }
    return false;
  }

  if (ann.type === 'highlight-line') {
    const lineAnn = ann as LineHighlightAnnotation;
    const x1 = lineAnn.startX * pageWidth;
    const y1 = lineAnn.startY * pageHeight;
    const x2 = lineAnn.endX * pageWidth;
    const y2 = lineAnn.endY * pageHeight;
    const dist = distToSegment({ x: px, y: py }, { x: x1, y: y1 }, { x: x2, y: y2 });
    return dist <= eraseRadius + ((lineAnn.strokeWidth || 10) * zoomScale) / 2;
  }

  if (ann.type === 'highlight-rect') {
    const hRect = ann as RectHighlightAnnotation;
    const rx = hRect.x * pageWidth;
    const ry = hRect.y * pageHeight;
    const rw = hRect.width * pageWidth;
    const rh = hRect.height * pageHeight;
    return (
      px >= rx - eraseRadius &&
      px <= rx + rw + eraseRadius &&
      py >= ry - eraseRadius &&
      py <= ry + rh + eraseRadius
    );
  }

  if (ann.type === 'highlight-text') {
    const textHighlight = ann as TextHighlightAnnotation;
    return textHighlight.rects.some((rect) => {
      const rx = rect.x * pageWidth;
      const ry = rect.y * pageHeight;
      const rw = rect.width * pageWidth;
      const rh = rect.height * pageHeight;
      return (
        px >= rx - eraseRadius &&
        px <= rx + rw + eraseRadius &&
        py >= ry - eraseRadius &&
        py <= ry + rh + eraseRadius
      );
    });
  }

  if (ann.type === 'text-note') {
    const note = ann as TextNoteAnnotation;
    const nx = note.x * pageWidth;
    const ny = note.y * pageHeight;
    return Math.hypot(px - nx, py - ny) <= eraseRadius + 40;
  }

  if (ann.type === 'ai-explanation') {
    const box = ann as AiExplanationAnnotation;
    const rx = box.x * pageWidth;
    const ry = box.y * pageHeight;
    const rw = box.width * pageWidth;
    const rh = box.height * pageHeight;
    return (
      px >= rx - eraseRadius &&
      px <= rx + rw + eraseRadius &&
      py >= ry - eraseRadius &&
      py <= ry + rh + eraseRadius
    );
  }

  if (ann.type === 'image') {
    const img = ann as AttachedImageAnnotation;
    const rx = img.x * pageWidth;
    const ry = img.y * pageHeight;
    const rw = img.width * pageWidth;
    const rh = img.height * pageHeight;
    return (
      px >= rx - eraseRadius &&
      px <= rx + rw + eraseRadius &&
      py >= ry - eraseRadius &&
      py <= ry + rh + eraseRadius
    );
  }

  return false;
}
