import { describe, expect, test } from 'bun:test';
import { distToSegment, isAnnotationHitByEraser } from '../src/lib/annotations/eraserUtils';
import type {
  DrawingAnnotation,
  LineHighlightAnnotation,
  RectHighlightAnnotation,
  TextHighlightAnnotation,
  TextNoteAnnotation,
  AiExplanationAnnotation,
  AttachedImageAnnotation,
} from '../src/lib/types/index';

describe('eraserUtils', () => {
  const pageWidth = 600;
  const pageHeight = 800;

  test('distToSegment calculates perpendicular and endpoint distances correctly', () => {
    // Horizontal segment from (10, 50) to (100, 50)
    const p1 = { x: 10, y: 50 };
    const p2 = { x: 100, y: 50 };

    // Point directly above segment at x=50, y=30 -> distance is 20
    expect(distToSegment({ x: 50, y: 30 }, p1, p2)).toBeCloseTo(20);

    // Point before start endpoint at x=0, y=50 -> distance is 10
    expect(distToSegment({ x: 0, y: 50 }, p1, p2)).toBeCloseTo(10);

    // Point after end endpoint at x=110, y=50 -> distance is 10
    expect(distToSegment({ x: 110, y: 50 }, p1, p2)).toBeCloseTo(10);
  });

  test('isAnnotationHitByEraser correctly detects drawing and pen strokes', () => {
    const penAnn: DrawingAnnotation = {
      id: 'pen1',
      pageNumber: 1,
      type: 'pen',
      points: [
        { x: 0.1, y: 0.1 }, // (60, 80)
        { x: 0.2, y: 0.2 }, // (120, 160)
      ],
      color: '#ff0000',
      strokeWidth: 4,
      opacity: 1,
      createdAt: 1,
    };

    // Eraser directly at point 1 (60, 80)
    expect(isAnnotationHitByEraser(penAnn, 60, 80, pageWidth, pageHeight, 22)).toBe(true);

    // Eraser midpoint between points (90, 120)
    expect(isAnnotationHitByEraser(penAnn, 90, 120, pageWidth, pageHeight, 22)).toBe(true);

    // Eraser far away (500, 500)
    expect(isAnnotationHitByEraser(penAnn, 500, 500, pageWidth, pageHeight, 22)).toBe(false);
  });

  test('isAnnotationHitByEraser correctly detects straight line highlights', () => {
    const lineAnn: LineHighlightAnnotation = {
      id: 'line1',
      pageNumber: 1,
      type: 'highlight-line',
      startX: 0.1, // 60
      startY: 0.5, // 400
      endX: 0.5, // 300
      endY: 0.5, // 400
      color: '#facc15',
      strokeWidth: 10,
      opacity: 0.5,
      createdAt: 1,
    };

    // Close to line center (180, 410) -> distance is 10, within radius (22 + 5)
    expect(isAnnotationHitByEraser(lineAnn, 180, 410, pageWidth, pageHeight, 22)).toBe(true);

    // Far above line (180, 200)
    expect(isAnnotationHitByEraser(lineAnn, 180, 200, pageWidth, pageHeight, 22)).toBe(false);
  });

  test('isAnnotationHitByEraser correctly detects rectangle highlights', () => {
    const rectAnn: RectHighlightAnnotation = {
      id: 'rect1',
      pageNumber: 1,
      type: 'highlight-rect',
      x: 0.2, // 120
      y: 0.2, // 160
      width: 0.2, // 120 (extends to 240)
      height: 0.1, // 80 (extends to 240)
      color: '#facc15',
      opacity: 0.5,
      createdAt: 1,
    };

    // Inside rect (150, 180)
    expect(isAnnotationHitByEraser(rectAnn, 150, 180, pageWidth, pageHeight, 22)).toBe(true);

    // Just outside rect within 22px radius (105, 180) -> 15px from edge
    expect(isAnnotationHitByEraser(rectAnn, 105, 180, pageWidth, pageHeight, 22)).toBe(true);

    // Far away (50, 50)
    expect(isAnnotationHitByEraser(rectAnn, 50, 50, pageWidth, pageHeight, 22)).toBe(false);
  });

  test('isAnnotationHitByEraser correctly detects text highlights', () => {
    const textHighlight: TextHighlightAnnotation = {
      id: 'th1',
      pageNumber: 1,
      type: 'highlight-text',
      rects: [
        { x: 0.1, y: 0.1, width: 0.3, height: 0.05 }, // (60, 80, 180, 40)
      ],
      text: 'Test',
      color: '#facc15',
      opacity: 0.5,
      createdAt: 1,
    };

    expect(isAnnotationHitByEraser(textHighlight, 100, 90, pageWidth, pageHeight, 22)).toBe(true);
    expect(isAnnotationHitByEraser(textHighlight, 500, 500, pageWidth, pageHeight, 22)).toBe(false);
  });

  test('isAnnotationHitByEraser correctly detects text notes, ai boxes, and images', () => {
    const note: TextNoteAnnotation = {
      id: 'note1',
      pageNumber: 1,
      type: 'text-note',
      x: 0.5, // 300
      y: 0.5, // 400
      text: 'Sticky note',
      color: '#fef08a',
      fontSize: 14,
      createdAt: 1,
    };

    const aiBox: AiExplanationAnnotation = {
      id: 'ai1',
      pageNumber: 1,
      type: 'ai-explanation',
      x: 0.1, // 60
      y: 0.1, // 80
      width: 0.2, // 120
      height: 0.1, // 80
      prompt: 'Explain',
      response: 'Resp',
      createdAt: 1,
      updatedAt: 1,
    };

    const image: AttachedImageAnnotation = {
      id: 'img1',
      pageNumber: 1,
      type: 'image',
      dataUrl: 'data:...',
      x: 0.7, // 420
      y: 0.7, // 560
      width: 0.2, // 120
      height: 0.2, // 160
      rotation: 0,
      aspectRatio: 1,
      name: 'Test Image',
      createdAt: 1,
    };

    // Note hit
    expect(isAnnotationHitByEraser(note, 310, 410, pageWidth, pageHeight, 22)).toBe(true);
    expect(isAnnotationHitByEraser(note, 100, 100, pageWidth, pageHeight, 22)).toBe(false);

    // AI Box hit
    expect(isAnnotationHitByEraser(aiBox, 100, 100, pageWidth, pageHeight, 22)).toBe(true);
    expect(isAnnotationHitByEraser(aiBox, 400, 400, pageWidth, pageHeight, 22)).toBe(false);

    // Image hit
    expect(isAnnotationHitByEraser(image, 450, 600, pageWidth, pageHeight, 22)).toBe(true);
    expect(isAnnotationHitByEraser(image, 100, 100, pageWidth, pageHeight, 22)).toBe(false);
  });

  test('isAnnotationHitByEraser erases regionless AI responses around their anchor point', () => {
    const regionlessAi: AiExplanationAnnotation = {
      id: 'ai_chat1',
      pageNumber: 1,
      type: 'ai-explanation',
      x: 0.5, // 300
      y: 0.5, // 400
      width: 0.002,
      height: 0.002,
      prompt: 'Summarize',
      response: 'Response',
      createdAt: 1,
      updatedAt: 1,
    };

    expect(isAnnotationHitByEraser(regionlessAi, 310, 410, pageWidth, pageHeight, 22)).toBe(true);
    expect(isAnnotationHitByEraser(regionlessAi, 400, 500, pageWidth, pageHeight, 22)).toBe(false);
  });

  test('isAnnotationHitByEraser scales eraser tolerance with zoom scale', () => {
    const penAnn: DrawingAnnotation = {
      id: 'penZoom',
      pageNumber: 1,
      type: 'pen',
      points: [{ x: 0.1, y: 0.1 }], // (60, 80)
      color: '#ff0000',
      strokeWidth: 10,
      opacity: 1,
      createdAt: 1,
    };

    // At scale 1: threshold is 10 + 10 = 20. Point at dist 25 is missed.
    expect(isAnnotationHitByEraser(penAnn, 60, 105, pageWidth, pageHeight, 10, 1)).toBe(false);
    // At scale 2: threshold is 10 + 10*2 = 30. Point at dist 25 is hit.
    expect(isAnnotationHitByEraser(penAnn, 60, 105, pageWidth, pageHeight, 10, 2)).toBe(true);
  });
});
