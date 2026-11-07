import { toPng } from 'html-to-image';

let cachedEmbeddedStyles: string | null = null;

/**
 * Extracts KaTeX and markdown styling rules from loaded stylesheets to ensure
 * mathematical notation and typography render identically inside SVG foreignObject snapshots.
 */
function getEmbeddedStyles(): string {
  if (cachedEmbeddedStyles !== null) {
    return cachedEmbeddedStyles;
  }

  let css = `
    .katex-mathml { display: none !important; }
    .katex-html { display: inline-block !important; }
    .katex { font-size: 1.05em; line-height: 1.2; text-indent: 0; text-rendering: auto; }
    .katex-display { margin: 0.75rem 0; padding: 0.45rem 0; overflow-x: visible; }
    .ai-response-markdown { font-size: 12px; line-height: 1.6; }
    .ai-response-markdown p { margin: 0.55rem 0; }
    .ai-response-markdown ul { list-style: disc; padding-left: 1.25rem; margin: 0.5rem 0; }
    .ai-response-markdown ol { list-style: decimal; padding-left: 1.25rem; margin: 0.5rem 0; }
    .ai-response-markdown li { margin: 0.25rem 0; }
    .ai-response-markdown strong { font-weight: 650; }
    .ai-response-markdown h1 { font-size: 1rem; font-weight: 700; margin: 0.75rem 0 0.4rem; }
    .ai-response-markdown h2 { font-size: 0.925rem; font-weight: 700; margin: 0.65rem 0 0.35rem; }
    .ai-response-markdown h3 { font-size: 0.85rem; font-weight: 650; margin: 0.55rem 0 0.3rem; }
    .ai-response-markdown code:not(pre code) { background: rgba(128,128,128,0.15); padding: 0.15rem 0.3rem; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
    .ai-response-markdown pre { background: rgba(0,0,0,0.15); padding: 0.6rem; border-radius: 6px; overflow-x: auto; margin: 0.6rem 0; font-family: monospace; font-size: 0.85em; }
    .ai-response-markdown blockquote { border-left: 3px solid #3b82f6; padding-left: 0.65rem; margin: 0.6rem 0; font-style: italic; opacity: 0.85; }
    .ai-response-markdown table { display: block; max-width: 100%; margin: 0.65rem 0; overflow-x: auto; border-collapse: collapse; }
    .ai-response-markdown th, .ai-response-markdown td { padding: 0.35rem 0.5rem; border: 1px solid rgba(128,128,128,0.3); text-align: left; }
  `;

  if (typeof document !== 'undefined') {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (rules) {
          for (const rule of Array.from(rules)) {
            if (
              rule.cssText &&
              (rule.cssText.includes('katex') || rule.cssText.includes('ai-response'))
            ) {
              css += '\n' + rule.cssText;
            }
          }
        }
      } catch {
        // Ignore cross-origin access restrictions
      }
    }
  }

  cachedEmbeddedStyles = css;
  return css;
}

/**
 * Trims excess bottom padding from the generated canvas image by detecting non-transparent pixels.
 */
function trimExcessBottomPadding(
  dataUrl: string,
  dpr: number = 2
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve({ dataUrl, width: 800, height: 600 });
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
          return;
        }

        ctx.drawImage(img, 0, 0);
        const { width, height } = canvas;
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        // Scan upwards from bottom to find the last row with non-transparent content
        let bottomContentY = height - 1;

        for (let y = height - 1; y >= 10; y--) {
          let hasContent = false;
          const rowOffset = y * width * 4;
          for (let x = 4; x < width - 4; x += 2) {
            const alpha = data[rowOffset + x * 4 + 3];
            if (alpha > 15) {
              hasContent = true;
              break;
            }
          }
          if (hasContent) {
            bottomContentY = y;
            break;
          }
        }

        // Add 10px breathing room padding at bottom (scaled by dpr)
        const paddingBottomPx = Math.round(10 * dpr);
        const trimmedHeight = Math.min(
          height,
          Math.max(Math.round(50 * dpr), bottomContentY + paddingBottomPx)
        );

        if (trimmedHeight < height - 10) {
          const trimmedCanvas = document.createElement('canvas');
          trimmedCanvas.width = width;
          trimmedCanvas.height = trimmedHeight;
          const tCtx = trimmedCanvas.getContext('2d');
          if (tCtx) {
            tCtx.drawImage(canvas, 0, 0, width, trimmedHeight, 0, 0, width, trimmedHeight);
            resolve({
              dataUrl: trimmedCanvas.toDataURL('image/png'),
              width,
              height: trimmedHeight,
            });
            return;
          }
        }
      } catch (err) {
        console.warn('Trim bottom failed:', err);
      }

      resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => resolve({ dataUrl, width: 800, height: 600 });
    img.src = dataUrl;
  });
}

/**
 * Main rasterizer entrypoint: captures the rendered AI explanation content
 * with a transparent background and no outer card border/stroke.
 */
export async function rasterizeResponseCard(
  cardElement: HTMLElement | null,
  prompt: string,
  response: string,
  isDarkTheme: boolean = false
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (cardElement && typeof document !== 'undefined') {
    try {
      // 1. Temporarily save styles of cardElement
      const prevPosition = cardElement.style.position;
      const prevLeft = cardElement.style.left;
      const prevTop = cardElement.style.top;
      const prevRight = cardElement.style.right;
      const prevBottom = cardElement.style.bottom;
      const prevTransform = cardElement.style.transform;
      const prevMaxHeight = cardElement.style.maxHeight;
      const prevOverflow = cardElement.style.overflow;
      const prevHeight = cardElement.style.height;
      const prevWidth = cardElement.style.width;
      const prevPadding = cardElement.style.padding;
      const prevBorder = cardElement.style.border;
      const prevBackground = cardElement.style.background;
      const prevBackgroundColor = cardElement.style.backgroundColor;
      const prevBoxShadow = cardElement.style.boxShadow;

      // Temporarily hide Question section and Action buttons before measuring height
      const questionEl = cardElement.querySelector('[data-ai-question="true"], .ai-question-section');
      const prevQuestionDisplay = questionEl instanceof HTMLElement ? questionEl.style.display : null;
      if (questionEl instanceof HTMLElement) {
        questionEl.style.display = 'none';
      }

      const buttonBar = cardElement.querySelector('.flex.items-center.justify-end');
      const prevButtonBarDisplay = buttonBar instanceof HTMLElement ? buttonBar.style.display : null;
      if (buttonBar instanceof HTMLElement) {
        buttonBar.style.display = 'none';
      }

      // Hide all buttons
      const buttons = cardElement.querySelectorAll('button, .btn-icon, .btn-ghost, .btn-primary, .btn-secondary');
      const prevDisplayMap = new Map<HTMLElement, string>();
      buttons.forEach((btn) => {
        if (btn instanceof HTMLElement) {
          prevDisplayMap.set(btn, btn.style.display);
          btn.style.display = 'none';
        }
      });

      // Ensure nested math/scroll containers don't clip
      const nestedScrolls = cardElement.querySelectorAll(
        '.katex-display, pre, table, .overflow-auto, .overflow-x-auto'
      );
      const prevScrollStyles = new Map<HTMLElement, { overflow: string; maxWidth: string }>();
      nestedScrolls.forEach((node) => {
        if (node instanceof HTMLElement) {
          prevScrollStyles.set(node, {
            overflow: node.style.overflow,
            maxWidth: node.style.maxWidth,
          });
          node.style.overflow = 'visible';
          node.style.maxWidth = 'none';
        }
      });

      // Remove border stroke and card background for clean transparent placement
      cardElement.style.position = 'relative';
      cardElement.style.left = '0px';
      cardElement.style.top = '0px';
      cardElement.style.right = 'auto';
      cardElement.style.bottom = 'auto';
      cardElement.style.transform = 'none';
      cardElement.style.maxHeight = 'none';
      cardElement.style.overflow = 'visible';
      cardElement.style.height = 'auto';
      cardElement.style.padding = '8px 12px 8px 12px';
      cardElement.style.border = 'none';
      cardElement.style.background = 'transparent';
      cardElement.style.backgroundColor = 'transparent';
      cardElement.style.boxShadow = 'none';

      // Measure actual rendered bounding box
      const targetWidth = Math.max(360, Math.ceil(cardElement.offsetWidth || cardElement.scrollWidth || 440));
      const targetHeight = Math.max(60, Math.ceil(cardElement.scrollHeight || cardElement.offsetHeight || 180));

      const embeddedStyles = getEmbeddedStyles();

      const rawDataUrl = await toPng(cardElement, {
        pixelRatio: 2,
        width: targetWidth,
        height: targetHeight,
        canvasWidth: targetWidth * 2,
        canvasHeight: targetHeight * 2,
        cacheBust: false,
        skipFonts: true,
        fontEmbedCSS: embeddedStyles,
        filter: (node) => {
          if (node instanceof HTMLElement) {
            // Strip out MathML XML to prevent text overlap with KaTeX visual elements
            if (node.classList.contains('katex-mathml')) {
              return false;
            }
            // Strip out Question/prompt section
            if (
              node.getAttribute('data-ai-question') === 'true' ||
              node.classList.contains('ai-question-section') ||
              node.classList.contains('ai-popover-question') ||
              node.classList.contains('ai-popover-prompt')
            ) {
              return false;
            }
            // Strip out action buttons
            if (
              node.tagName === 'BUTTON' ||
              node.classList.contains('btn-icon') ||
              node.classList.contains('btn-ghost') ||
              node.classList.contains('btn-primary') ||
              node.classList.contains('btn-secondary')
            ) {
              return false;
            }
          }
          return true;
        },
        style: {
          position: 'static',
          left: '0px',
          top: '0px',
          margin: '0px',
          transform: 'none',
          maxHeight: 'none',
          height: 'auto',
          padding: '8px 12px 8px 12px',
          border: 'none',
          background: 'transparent',
          backgroundColor: 'transparent',
          overflow: 'visible',
          boxShadow: 'none',
        },
      });

      // Restore all element styles immediately
      if (questionEl instanceof HTMLElement && prevQuestionDisplay !== null) {
        questionEl.style.display = prevQuestionDisplay;
      }
      if (buttonBar instanceof HTMLElement && prevButtonBarDisplay !== null) {
        buttonBar.style.display = prevButtonBarDisplay;
      }

      nestedScrolls.forEach((node) => {
        if (node instanceof HTMLElement) {
          const prev = prevScrollStyles.get(node);
          if (prev) {
            node.style.overflow = prev.overflow;
            node.style.maxWidth = prev.maxWidth;
          }
        }
      });

      buttons.forEach((btn) => {
        if (btn instanceof HTMLElement) {
          btn.style.display = prevDisplayMap.get(btn) || '';
        }
      });

      cardElement.style.position = prevPosition;
      cardElement.style.left = prevLeft;
      cardElement.style.top = prevTop;
      cardElement.style.right = prevRight;
      cardElement.style.bottom = prevBottom;
      cardElement.style.transform = prevTransform;
      cardElement.style.maxHeight = prevMaxHeight;
      cardElement.style.overflow = prevOverflow;
      cardElement.style.height = prevHeight;
      cardElement.style.width = prevWidth;
      cardElement.style.padding = prevPadding;
      cardElement.style.border = prevBorder;
      cardElement.style.background = prevBackground;
      cardElement.style.backgroundColor = prevBackgroundColor;
      cardElement.style.boxShadow = prevBoxShadow;

      if (rawDataUrl && rawDataUrl.length > 200 && rawDataUrl.startsWith('data:image/png;base64,')) {
        return await trimExcessBottomPadding(rawDataUrl, 2);
      }
    } catch (err) {
      console.warn('Direct html-to-image capture failed, using canvas fallback:', err);
    }
  }

  // Fallback direct canvas renderer
  return renderAiExplanationCardToCanvas(prompt, response, isDarkTheme);
}

/**
 * Fallback Canvas Markdown Renderer (pure 2D Canvas with transparent background)
 */
interface TextSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

function parseFormattedSpans(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|[^*`]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    if (raw.startsWith('**') && raw.endsWith('**') && raw.length >= 4) {
      spans.push({ text: raw.slice(2, -2), bold: true });
    } else if (raw.startsWith('*') && raw.endsWith('*') && raw.length >= 2) {
      spans.push({ text: raw.slice(1, -1), italic: true });
    } else if (raw.startsWith('`') && raw.endsWith('`') && raw.length >= 2) {
      spans.push({ text: raw.slice(1, -1), code: true });
    } else {
      spans.push({ text: raw });
    }
  }

  return spans.length > 0 ? spans : [{ text }];
}

interface RenderItem {
  type: 'header' | 'paragraph' | 'bullet' | 'number' | 'code' | 'quote' | 'spacer';
  text?: string;
  level?: number;
  num?: string;
  codeLines?: string[];
}

function parseMarkdownLines(markdown: string): RenderItem[] {
  const rawLines = markdown.split('\n');
  const items: RenderItem[] = [];
  let inCodeBlock = false;
  let currentCode: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        items.push({ type: 'code', codeLines: [...currentCode] });
        currentCode = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        currentCode = [];
      }
      continue;
    }

    if (inCodeBlock) {
      currentCode.push(line);
      continue;
    }

    if (!trimmed) {
      items.push({ type: 'spacer' });
      continue;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      items.push({ type: 'header', level: 3, text: trimmed.slice(4) });
    } else if (trimmed.startsWith('## ')) {
      items.push({ type: 'header', level: 2, text: trimmed.slice(3) });
    } else if (trimmed.startsWith('# ')) {
      items.push({ type: 'header', level: 1, text: trimmed.slice(2) });
    } else if (/^[-*•]\s+/.test(trimmed)) {
      items.push({ type: 'bullet', text: trimmed.replace(/^[-*•]\s+/, '') });
    } else if (/^\d+\.\s+/.test(trimmed)) {
      const numMatch = trimmed.match(/^(\d+\.)\s+(.*)/);
      if (numMatch) {
        items.push({ type: 'number', num: numMatch[1], text: numMatch[2] });
      } else {
        items.push({ type: 'paragraph', text: trimmed });
      }
    } else if (trimmed.startsWith('> ')) {
      items.push({ type: 'quote', text: trimmed.slice(2) });
    } else {
      items.push({ type: 'paragraph', text: trimmed });
    }
  }

  if (inCodeBlock && currentCode.length > 0) {
    items.push({ type: 'code', codeLines: currentCode });
  }

  return items;
}

function wrapText(
  text: string,
  maxWidth: number,
  measureFn: (str: string) => number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (measureFn(testLine) > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

export function renderAiExplanationCardToCanvas(
  _prompt: string,
  response: string,
  isDark: boolean = false
): { dataUrl: string; width: number; height: number } {
  const cardWidth = 520;
  const padding = 16;
  const contentWidth = cardWidth - padding * 2;
  const dpr = 2;

  const textPrimary = isDark ? '#f4f4f7' : '#18181b';
  const textSecondary = isDark ? '#9e9ea8' : '#64748b';
  const accentBlue = isDark ? '#60a5fa' : '#2563eb';
  const codeBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;

  const items = parseMarkdownLines(response);

  let totalHeight = padding;
  totalHeight += 24 + 8;

  for (const item of items) {
    if (item.type === 'spacer') {
      totalHeight += 8;
    } else if (item.type === 'header') {
      const fontSize = item.level === 1 ? 16 : item.level === 2 ? 14 : 13;
      mctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const lines = wrapText(item.text || '', contentWidth, (t) => mctx.measureText(t).width);
      totalHeight += lines.length * (fontSize + 6) + 8;
    } else if (item.type === 'bullet' || item.type === 'number') {
      mctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      const lines = wrapText(item.text || '', contentWidth - 22, (t) => mctx.measureText(t).width);
      totalHeight += lines.length * 18 + 6;
    } else if (item.type === 'quote') {
      mctx.font = 'italic 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      const lines = wrapText(item.text || '', contentWidth - 18, (t) => mctx.measureText(t).width);
      totalHeight += lines.length * 18 + 8;
    } else if (item.type === 'code') {
      const codeH = (item.codeLines?.length || 1) * 16 + 16;
      totalHeight += codeH + 10;
    } else {
      mctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const lines = wrapText(item.text || '', contentWidth, (t) => mctx.measureText(t).width);
      totalHeight += lines.length * 18 + 6;
    }
  }

  totalHeight += padding;
  const cardHeight = Math.max(80, totalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cardWidth * dpr);
  canvas.height = Math.round(cardHeight * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // Clear to transparent background (no stroke, no solid background fill)
  ctx.clearRect(0, 0, cardWidth, cardHeight);

  let y = padding;

  ctx.font = 'bold 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = accentBlue;
  ctx.fillText('✦  Codex AI Explanation', padding, y + 14);

  y += 24 + 8;

  for (const item of items) {
    if (item.type === 'spacer') {
      y += 8;
    } else if (item.type === 'header') {
      const fontSize = item.level === 1 ? 15 : item.level === 2 ? 13.5 : 12.5;
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.fillStyle = textPrimary;
      const lines = wrapText(item.text || '', contentWidth, (t) => ctx.measureText(t).width);
      for (const hl of lines) {
        ctx.fillText(hl, padding, y + fontSize);
        y += fontSize + 5;
      }
      y += 4;
    } else if (item.type === 'bullet') {
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = accentBlue;
      ctx.fillText('•', padding + 2, y + 11);

      ctx.fillStyle = textPrimary;
      const lines = wrapText(item.text || '', contentWidth - 18, (t) => ctx.measureText(t).width);
      for (const bl of lines) {
        drawFormattedLine(ctx, bl, padding + 16, y + 12, textPrimary);
        y += 18;
      }
      y += 4;
    } else if (item.type === 'number') {
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = accentBlue;
      ctx.fillText(item.num || '1.', padding + 2, y + 12);

      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = textPrimary;
      const lines = wrapText(item.text || '', contentWidth - 22, (t) => ctx.measureText(t).width);
      for (const nl of lines) {
        drawFormattedLine(ctx, nl, padding + 20, y + 12, textPrimary);
        y += 18;
      }
      y += 4;
    } else if (item.type === 'quote') {
      ctx.strokeStyle = accentBlue;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(padding + 2, y + 2);
      ctx.lineTo(padding + 2, y + 16);
      ctx.stroke();

      ctx.font = 'italic 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = textSecondary;
      const lines = wrapText(item.text || '', contentWidth - 16, (t) => ctx.measureText(t).width);
      for (const ql of lines) {
        ctx.fillText(ql, padding + 12, y + 12);
        y += 18;
      }
      y += 4;
    } else if (item.type === 'code') {
      const codeLines = item.codeLines || [];
      const codeH = codeLines.length * 16 + 14;

      ctx.fillStyle = codeBg;
      ctx.beginPath();
      ctx.roundRect(padding, y, contentWidth, codeH, 5);
      ctx.fill();

      ctx.font = '11px "SF Mono", Monaco, Menlo, Consolas, monospace';
      ctx.fillStyle = isDark ? '#38bdf8' : '#0369a1';
      let cy = y + 14;
      for (const cl of codeLines) {
        ctx.fillText(cl, padding + 10, cy);
        cy += 16;
      }
      y += codeH + 8;
    } else {
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = textPrimary;
      const lines = wrapText(item.text || '', contentWidth, (t) => ctx.measureText(t).width);
      for (const pl of lines) {
        drawFormattedLine(ctx, pl, padding, y + 12, textPrimary);
        y += 18;
      }
      y += 4;
    }
  }

  const dataUrl = canvas.toDataURL('image/png');
  return {
    dataUrl,
    width: Math.round(cardWidth * dpr),
    height: Math.round(cardHeight * dpr),
  };
}

function drawFormattedLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  startX: number,
  y: number,
  defaultColor: string
) {
  const spans = parseFormattedSpans(line);
  let currentX = startX;

  for (const span of spans) {
    if (span.bold) {
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = defaultColor;
    } else if (span.italic) {
      ctx.font = 'italic 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = defaultColor;
    } else if (span.code) {
      ctx.font = '11px "SF Mono", Monaco, Menlo, Consolas, monospace';
      ctx.fillStyle = '#38bdf8';
    } else {
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = defaultColor;
    }

    ctx.fillText(span.text, currentX, y);
    currentX += ctx.measureText(span.text).width;
  }
}
