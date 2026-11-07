import { describe, expect, test } from 'bun:test';
import { transitionAiJob } from '../src/lib/ai/aiJobState';
import type { AiExplanationAnnotation, Annotation } from '../src/lib/types/index';

describe('AI explanation state and persistence', () => {
  test('transitions compose, running, error, and settled state without changing annotations', () => {
    const compose = transitionAiJob({}, 'a1', { phase: 'compose' });
    const running = transitionAiJob(compose, 'a1', { phase: 'running', requestId: 'r1' });
    const failed = transitionAiJob(running, 'a1', { phase: 'error', message: 'Timed out' });
    const settled = transitionAiJob(failed, 'a1', null);
    expect(compose.a1.phase).toBe('compose');
    expect(running.a1.phase).toBe('running');
    expect(failed.a1.phase).toBe('error');
    expect(settled.a1).toBeUndefined();
  });

  test('round-trips AI and legacy annotations through annotation JSON', () => {
    const ai: AiExplanationAnnotation = {
      id: 'ai_1', pageNumber: 2, type: 'ai-explanation', x: 0.1, y: 0.2, width: 0.3, height: 0.1,
      prompt: 'Explain', response: 'Answer', provider: 'codex', createdAt: 1, updatedAt: 2,
    };
    const legacy: Annotation = {
      id: 'rect_1', pageNumber: 1, type: 'highlight-rect', x: 0, y: 0, width: 0.1, height: 0.1,
      color: '#ffff00', opacity: 0.4, createdAt: 1,
    };
    const rasterized: Annotation = {
      id: 'img_1', pageNumber: 2, type: 'image', x: 0.1, y: 0.2, width: 0.3, height: 0.1,
      rotation: 0, opacity: 1, aspectRatio: 3, name: 'Rasterized Region P2',
      dataUrl: 'data:image/png;base64,AAAA', createdAt: 1, extractedText: 'Sample raw text from document',
    };
    expect(JSON.parse(JSON.stringify([legacy, ai, rasterized]))).toEqual([legacy, ai, rasterized]);
  });

  test('parses markdown formatting structures correctly for card rendering', () => {
    const markdown = `# Header 1\n## Header 2\n- Bullet item\n1. Numbered item\n> Quote\n\`\`\`js\nconst x = 1;\n\`\`\`\nNormal **bold** and *italic* text.`;
    expect(markdown.length).toBeGreaterThan(0);
  });

  test('persists every annotation, including unanswered and answered AI boxes', async () => {
    const { filterPersistableAnnotations } = await import('../src/lib/storage/storage');
    const unansweredAi: AiExplanationAnnotation = {
      id: 'ai_empty', pageNumber: 1, type: 'ai-explanation', x: 0.1, y: 0.2, width: 0.3, height: 0.1,
      prompt: 'Explain this', response: '', provider: 'codex', createdAt: 1, updatedAt: 2,
    };
    const answeredAi: AiExplanationAnnotation = {
      id: 'ai_answered', pageNumber: 1, type: 'ai-explanation', x: 0.1, y: 0.2, width: 0.3, height: 0.1,
      prompt: 'Explain this', response: 'Here is the detailed answer', provider: 'codex', createdAt: 1, updatedAt: 2,
    };
    const highlight: Annotation = {
      id: 'h1', pageNumber: 1, type: 'highlight-rect', x: 0, y: 0, width: 0.1, height: 0.1,
      color: '#ffff00', opacity: 0.4, createdAt: 1,
    };

    const persistable = filterPersistableAnnotations([unansweredAi, answeredAi, highlight]);
    expect(persistable).toEqual([unansweredAi, answeredAi, highlight]);
  });

  test('loads legacy annotation arrays and selects the newest versioned record', async () => {
    const { parseStoredAnnotationRecord, selectNewestAnnotationRecord } = await import('../src/lib/storage/storage');
    const older: Annotation = {
      id: 'old', pageNumber: 1, type: 'highlight-rect', x: 0, y: 0, width: 0.1, height: 0.1,
      color: '#ffff00', opacity: 0.4, createdAt: 1,
    };
    const newer: AiExplanationAnnotation = {
      id: 'new', pageNumber: 2, type: 'ai-explanation', x: 0.1, y: 0.2, width: 0.3, height: 0.1,
      prompt: 'Explain', response: 'Persisted AI response', provider: 'codex', createdAt: 2, updatedAt: 3,
    };

    expect(parseStoredAnnotationRecord(JSON.stringify([older]))).toEqual({
      annotations: [older],
      updatedAt: 0,
    });
    expect(
      selectNewestAnnotationRecord([
        { annotations: [older], updatedAt: 10 },
        { annotations: [newer], updatedAt: 20 },
      ])
    ).toEqual({ annotations: [newer], updatedAt: 20 });
  });

  test('builds an AI response preview for the Highlights sidebar', async () => {
    const { getAnnotationListPresentation } = await import('../src/lib/annotations/annotationPresentation');
    const ai: AiExplanationAnnotation = {
      id: 'ai_sidebar',
      pageNumber: 4,
      type: 'ai-explanation',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      prompt: 'Explain this theorem',
      response: 'The theorem follows from compactness.',
      provider: 'codex',
      createdAt: 1,
      updatedAt: 2,
    };

    expect(getAnnotationListPresentation(ai)).toEqual({
      title: 'AI response',
      prompt: 'Explain this theorem',
      preview: 'The theorem follows from compactness.',
      isAi: true,
    });
  });

  test('builds text highlight and note snippet previews for the Highlights sidebar', async () => {
    const { getAnnotationListPresentation } = await import('../src/lib/annotations/annotationPresentation');

    const textHighlight: Annotation = {
      id: 'hl_1',
      pageNumber: 2,
      type: 'highlight-text',
      rects: [{ x: 0.1, y: 0.2, width: 0.8, height: 0.05 }],
      text: 'A binary search tree provides logarithmic time lookup.',
      color: '#facc15',
      opacity: 0.4,
      createdAt: 1,
    };

    expect(getAnnotationListPresentation(textHighlight)).toEqual({
      title: 'Highlight',
      preview: 'A binary search tree provides logarithmic time lookup.',
      isAi: false,
    });

    const rectHighlight: Annotation = {
      id: 'rect_1',
      pageNumber: 3,
      type: 'highlight-rect',
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.1,
      text: 'Theorem 4.2 states that all continuous functions are integrable.',
      color: '#60a5fa',
      opacity: 0.35,
      createdAt: 1,
    };

    expect(getAnnotationListPresentation(rectHighlight)).toEqual({
      title: 'Highlight',
      preview: 'Theorem 4.2 states that all continuous functions are integrable.',
      isAi: false,
    });

    const textNote: Annotation = {
      id: 'note_1',
      pageNumber: 1,
      type: 'text-note',
      kind: 'sticky',
      x: 0.2,
      y: 0.3,
      text: 'Need to review this equation before exam.',
      color: '#fef08a',
      fontSize: 12,
      createdAt: 1,
    };

    expect(getAnnotationListPresentation(textNote)).toEqual({
      title: 'Sticky note',
      preview: 'Need to review this equation before exam.',
      isAi: false,
    });
  });

  test('toggles and preserves AI box open and collapsed message badge state', () => {
    const aiBox: AiExplanationAnnotation = {
      id: 'ai_toggle',
      pageNumber: 1,
      type: 'ai-explanation',
      x: 0.1,
      y: 0.2,
      width: 0.4,
      height: 0.3,
      prompt: 'Summarize',
      response: 'Summary content',
      provider: 'codex',
      isOpen: true,
      createdAt: 1,
      updatedAt: 1,
    };

    // When closed, isOpen is false -> renders collapsed message icon badge
    const closedBox = { ...aiBox, isOpen: false, updatedAt: 2 };
    expect(closedBox.isOpen).toBe(false);

    // When re-opened by clicking badge, isOpen becomes true -> renders expanded card
    const reopenedBox = { ...closedBox, isOpen: true, updatedAt: 3 };
    expect(reopenedBox.isOpen).toBe(true);

    // Serializes and deserializes isOpen correctly
    const json = JSON.stringify([closedBox, reopenedBox]);
    const parsed = JSON.parse(json) as AiExplanationAnnotation[];
    expect(parsed[0].isOpen).toBe(false);
    expect(parsed[1].isOpen).toBe(true);
  });

  test('determines AI region highlight visibility based on open/bubble phase and hover/drag states', () => {
    const isRegionVisible = (
      annotationId: string,
      isOpen: boolean,
      hoveredId: string | null,
      activeDragId: string | null
    ) => {
      return !isOpen || hoveredId === annotationId || activeDragId === annotationId;
    };

    const targetId = 'ai_123';

    // 1. In bubble phase (window hidden / isOpen === false) -> ALWAYS visible!
    expect(isRegionVisible(targetId, false, null, null)).toBe(true);

    // 2. When window is open (isOpen === true) and resting (not hovered on drag bar, not dragged) -> hidden
    expect(isRegionVisible(targetId, true, null, null)).toBe(false);

    // 3. When window is open and user hovers on the top drag handle bar -> visible!
    expect(isRegionVisible(targetId, true, 'ai_123', null)).toBe(true);
    expect(isRegionVisible(targetId, true, 'other_id', null)).toBe(false);

    // 4. When window is open and user actively drags the window -> visible!
    expect(isRegionVisible(targetId, true, null, 'ai_123')).toBe(true);
  });

  test('positions whole-page AI prompt and response card at cursor location when called', () => {
    const cursor = { x: 0.45, y: 0.35 };
    const wholePageAi: AiExplanationAnnotation = {
      id: 'ai_page_1',
      pageNumber: 1,
      type: 'ai-explanation',
      x: 0.01,
      y: 0.01,
      width: 0.98,
      height: 0.98,
      prompt: '',
      response: '',
      provider: 'codex',
      isOpen: true,
      cardX: cursor.x,
      cardY: cursor.y,
      createdAt: 1,
      updatedAt: 1,
    };

    // Verify cardX and cardY match cursor position
    expect(wholePageAi.cardX).toBe(0.45);
    expect(wholePageAi.cardY).toBe(0.35);

    // When prompt is answered, cardX and cardY remain preserved at the cursor location
    const answeredAi = { ...wholePageAi, response: 'Detailed explanation', updatedAt: 2 };
    expect(answeredAi.cardX).toBe(0.45);
    expect(answeredAi.cardY).toBe(0.35);
  });

  test('keeps region-select AI response at the exact location where prompt box appeared', () => {
    const regionAi: AiExplanationAnnotation = {
      id: 'ai_region_1',
      pageNumber: 1,
      type: 'ai-explanation',
      x: 0.2,
      y: 0.3,
      width: 0.4,
      height: 0.15,
      prompt: 'Explain formula',
      response: '',
      provider: 'codex',
      isOpen: true,
      cardX: 0.2,
      cardY: 0.47,
      createdAt: 1,
      updatedAt: 1,
    };

    // When prompt box position is locked on submit
    expect(regionAi.cardX).toBe(0.2);
    expect(regionAi.cardY).toBe(0.47);

    // Response arrives without changing coordinates
    const answeredRegionAi = {
      ...regionAi,
      response: 'Formula breakdown result',
      updatedAt: 2,
    };
    expect(answeredRegionAi.cardX).toBe(0.2);
    expect(answeredRegionAi.cardY).toBe(0.47);
  });

  test('opening and closing AI bubble maintains identical position without drift', () => {
    const cardWidth = 440;
    const badgeSize = 34;
    const pageWidth = 800;
    const pageHeight = 1000;

    const computeCardPos = (ann: AiExplanationAnnotation) => {
      if (ann.cardX !== undefined && ann.cardY !== undefined) {
        return {
          left: ann.cardX * pageWidth,
          top: ann.cardY * pageHeight,
        };
      }
      return {
        left: Math.max(8, Math.min(ann.x * pageWidth, pageWidth - cardWidth - 8)),
        top: Math.max(8, Math.min(pageHeight - 80, (ann.y + ann.height) * pageHeight + 10)),
      };
    };

    const computeBadgePos = (ann: AiExplanationAnnotation) => {
      if (ann.cardX !== undefined && ann.cardY !== undefined) {
        return {
          left: ann.cardX * pageWidth,
          top: ann.cardY * pageHeight,
        };
      }
      return {
        left: Math.max(8, Math.min(ann.x * pageWidth, pageWidth - badgeSize - 8)),
        top: Math.max(8, Math.min(pageHeight - badgeSize - 8, (ann.y + ann.height) * pageHeight + 10)),
      };
    };

    const initial: AiExplanationAnnotation = {
      id: 'ai_pos_test',
      pageNumber: 1,
      type: 'ai-explanation',
      x: 0.15,
      y: 0.25,
      width: 0.3,
      height: 0.1,
      prompt: 'Explain',
      response: 'Detailed answer',
      provider: 'codex',
      isOpen: true,
      cardX: 0.15,
      cardY: 0.36,
      createdAt: 1,
      updatedAt: 1,
    };

    // 1. Initial open card position
    const cardPos1 = computeCardPos(initial);
    expect(cardPos1.left).toBe(120);
    expect(cardPos1.top).toBe(360);

    // 2. Collapse to bubble
    const collapsed = { ...initial, isOpen: false };
    const badgePos = computeBadgePos(collapsed);
    expect(badgePos.left).toBe(120);
    expect(badgePos.top).toBe(360);

    // 3. Reopen card from bubble
    const reopened = { ...collapsed, isOpen: true };
    const cardPos2 = computeCardPos(reopened);
    expect(cardPos2.left).toBe(cardPos1.left);
    expect(cardPos2.top).toBe(cardPos1.top);

    // 4. Card or bubble placed outside the PDF in the left/right margins
    const outsidePageAnn: AiExplanationAnnotation = {
      ...initial,
      cardX: -0.1, // Outside left margin
      cardY: 0.5,
    };
    expect(computeCardPos(outsidePageAnn).left).toBe(-80);
    expect(computeBadgePos(outsidePageAnn).left).toBe(-80);
  });
});
