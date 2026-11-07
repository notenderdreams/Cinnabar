import type { Annotation } from '../types/index';
import { extractTextFromDomPageRegion } from './textHighlight';

export interface AnnotationListPresentation {
  title: string;
  preview?: string;
  prompt?: string;
  isAi: boolean;
}

const compact = (value: string): string => value.replace(/\s+/g, ' ').trim();

export function getAnnotationListPresentation(
  annotation: Annotation
): AnnotationListPresentation {
  if (annotation.type === 'ai-explanation') {
    const response = compact(annotation.response || '');
    const prompt = compact(annotation.prompt || '');
    return {
      title: response ? 'AI response' : 'AI prompt',
      prompt: prompt || undefined,
      preview: response || prompt || 'Waiting for a prompt',
      isAi: true,
    };
  }

  if (annotation.type === 'text-note') {
    const text = compact(annotation.text || '');
    return {
      title: annotation.kind === 'sticky' ? 'Sticky note' : 'Text note',
      preview: text || undefined,
      isAi: false,
    };
  }

  if (annotation.type === 'highlight-text') {
    const text = compact(annotation.text || '');
    return {
      title: annotation.style === 'underline' ? 'Underline' : 'Highlight',
      preview: text || undefined,
      isAi: false,
    };
  }

  if (annotation.type === 'highlight-rect') {
    let text = compact(annotation.text || '');
    if (!text) {
      text = compact(
        extractTextFromDomPageRegion(annotation.pageNumber, {
          x: annotation.x,
          y: annotation.y,
          width: annotation.width,
          height: annotation.height,
        })
      );
    }
    const title =
      annotation.style === 'underline'
        ? 'Underline'
        : annotation.style === 'stroke'
          ? 'Box highlight'
          : 'Highlight';
    return {
      title,
      preview: text || undefined,
      isAi: false,
    };
  }

  if (annotation.type === 'highlight-line') {
    let text = compact(annotation.text || '');
    if (!text) {
      const minX = Math.min(annotation.startX, annotation.endX);
      const minY = Math.min(annotation.startY, annotation.endY);
      const w = Math.max(0.01, Math.abs(annotation.endX - annotation.startX));
      const h = Math.max(0.02, Math.abs(annotation.endY - annotation.startY));
      text = compact(
        extractTextFromDomPageRegion(annotation.pageNumber, {
          x: minX,
          y: minY,
          width: w,
          height: h,
        })
      );
    }
    return {
      title: annotation.style === 'underline' ? 'Underline' : 'Line highlight',
      preview: text || undefined,
      isAi: false,
    };
  }

  if (annotation.type === 'pen' || annotation.type === 'highlight-pen') {
    let text = compact(annotation.text || '');
    if (!text && annotation.points && annotation.points.length > 0) {
      let minX = 1;
      let maxX = 0;
      let minY = 1;
      let maxY = 0;
      for (const p of annotation.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      text = compact(
        extractTextFromDomPageRegion(annotation.pageNumber, {
          x: minX,
          y: minY,
          width: Math.max(0.01, maxX - minX),
          height: Math.max(0.01, maxY - minY),
        })
      );
    }
    return {
      title: annotation.type === 'highlight-pen' ? 'Ink highlight' : 'Drawing',
      preview: text || undefined,
      isAi: false,
    };
  }

  if (annotation.type === 'image') {
    return {
      title: 'Image',
      preview: annotation.name || annotation.extractedText || undefined,
      isAi: false,
    };
  }

  return {
    title: (annotation as { type: string }).type.replace('-', ' '),
    isAi: false,
  };
}

/**
 * Calculates normalized (0..1) bounding box for any annotation.
 */
export function getAnnotationBoundingBox(ann: Annotation): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (ann.type === 'highlight-rect' || ann.type === 'ai-explanation' || ann.type === 'image') {
    return {
      x: ann.x,
      y: ann.y,
      width: Math.max(0.01, ann.width),
      height: Math.max(0.01, ann.height),
    };
  }

  if (ann.type === 'highlight-text') {
    if (ann.rects && ann.rects.length > 0) {
      const minX = Math.min(...ann.rects.map((r) => r.x));
      const minY = Math.min(...ann.rects.map((r) => r.y));
      const maxX = Math.max(...ann.rects.map((r) => r.x + r.width));
      const maxY = Math.max(...ann.rects.map((r) => r.y + r.height));
      return {
        x: minX,
        y: minY,
        width: Math.max(0.01, maxX - minX),
        height: Math.max(0.01, maxY - minY),
      };
    }
  }

  if (ann.type === 'highlight-line') {
    const minX = Math.min(ann.startX, ann.endX);
    const maxX = Math.max(ann.startX, ann.endX);
    const lineDeltaY = Math.abs(ann.endY - ann.startY);
    const halfH = Math.max(0.015, lineDeltaY / 2);
    const midY = (ann.startY + ann.endY) / 2;
    return {
      x: minX,
      y: midY - halfH,
      width: Math.max(0.01, maxX - minX),
      height: Math.max(0.03, halfH * 2),
    };
  }

  if (ann.type === 'pen' || ann.type === 'highlight-pen') {
    if (ann.points && ann.points.length > 0) {
      const minX = Math.min(...ann.points.map((p) => p.x));
      const minY = Math.min(...ann.points.map((p) => p.y));
      const maxX = Math.max(...ann.points.map((p) => p.x));
      const maxY = Math.max(...ann.points.map((p) => p.y));
      return {
        x: minX,
        y: minY,
        width: Math.max(0.01, maxX - minX),
        height: Math.max(0.01, maxY - minY),
      };
    }
  }

  if (ann.type === 'text-note') {
    return {
      x: ann.x,
      y: ann.y,
      width: 0.2,
      height: 0.1,
    };
  }

  return { x: 0, y: 0, width: 1, height: 1 };
}

/**
 * Extracts or returns the text covered by an annotation.
 */
export function getAnnotationCoveredText(ann: Annotation): string {
  if (ann.type === 'highlight-text') {
    if (ann.text) return ann.text.trim();
  }
  if (
    ann.type === 'highlight-rect' ||
    ann.type === 'highlight-line' ||
    ann.type === 'highlight-pen' ||
    ann.type === 'pen'
  ) {
    if (ann.text) return ann.text.trim();
    const bounds = getAnnotationBoundingBox(ann);
    return extractTextFromDomPageRegion(ann.pageNumber, bounds);
  }
  if (ann.type === 'text-note') {
    return ann.text.trim();
  }
  if (ann.type === 'ai-explanation') {
    return [ann.prompt ? `Q: ${ann.prompt}` : '', ann.response].filter(Boolean).join('\n\n').trim();
  }
  if (ann.type === 'image') {
    return ann.name || ann.extractedText || '';
  }
  return '';
}
