import { Editor } from '@tiptap/core';
import { toCanvas } from 'html-to-image';
import { notebookExtensions } from './extensions';
import { PAPER, PaperLayout, type NotebookLayout } from './layout';
import type { NotebookDocument } from './document';
import { canvasToPngBytes } from '../annotations/textNoteRasterizer';

let fontCSS: Promise<string> | undefined;
function localMathFonts(): Promise<string> {
  return fontCSS ??= (async () => {
    const fonts: string[] = [];
    const visit = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSFontFaceRule && rule.cssText.includes('KaTeX')) fonts.push(rule.cssText);
        else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try { visit(sheet.cssRules); } catch { /* App chrome may use a cross-origin font; paper uses system fonts. */ }
    }
    return (await Promise.all(fonts.map(async (css) => {
      // KaTeX ships local WOFF2 assets; embed only that format and avoid app-chrome font requests.
      const match = css.match(/url\(["']?([^\s"')]+\.woff2)["']?\)/);
      if (!match) return '';
      const response = await fetch(match[1]);
      if (!response.ok) throw new Error('Could not load a notebook formula font.');
      const blob = await response.blob();
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob);
      });
      return css.replace(/src:\s*[^;]+;/, `src: url("${data}") format("woff2");`);
    }))).join('\n');
  })().catch((error) => { fontCSS = undefined; throw error; });
}

/** The same DOM, typography and visual page breaks as the editor, without its controls. */
export async function rasterizeNotebookPages(documentModel: NotebookDocument, requestedPages?: number[], minimumPages = 1) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.className = 'notebook-export-surface';
  Object.assign(host.style, { position: 'fixed', left: '-100000px', top: '0', width: `${PAPER.width}px`,
    height: `${PAPER.height}px`, overflow: 'hidden', background: documentModel.styles.background, pointerEvents: 'none' });
  const content = document.createElement('div');
  Object.assign(content.style, { position: 'absolute', left: `${PAPER.left}px`, top: `${PAPER.top}px`, width: `${PAPER.contentWidth}px` });
  host.append(content); document.body.append(host);
  let layout: NotebookLayout | null = null;
  const editor = new Editor({ element: content, editable: false, content: documentModel.content,
    extensions: [...notebookExtensions(false), PaperLayout.configure({ onLayout: (next) => { layout = next; } })],
    editorProps: { attributes: { class: 'notebook-block-document' } },
  });
  Object.assign(editor.view.dom.style, { fontFamily: documentModel.styles.fontFamily, fontSize: `${documentModel.styles.fontSize}px`,
    lineHeight: String(documentModel.styles.lineHeight), color: documentModel.styles.color });
  editor.view.dom.style.setProperty('--notebook-spacing', `${documentModel.styles.paragraphSpacing}px`);
  try {
    await document.fonts.ready;
    await Promise.all(Array.from(host.querySelectorAll('img')).map((image) => image.decode().catch(() => { throw new Error('A notebook image could not be rendered.'); })));
    // Wait for the shared layout observer and a paint with the final decorations.
    for (let frames = 0; frames < 12; frames++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (layout && frames >= 3) break;
    }
    if (!layout) throw new Error('Notebook pagination did not finish.');
    const fontEmbedCSS = host.querySelector('.katex') ? await localMathFonts() : '';
    const results: { page: number; pngBytes: Uint8Array }[] = [];
    const pageCount = Math.max((layout as NotebookLayout).pages.length, documentModel.minimumSheets, minimumPages);
    for (const page of requestedPages ?? Array.from({ length: pageCount }, (_, index) => index + 1)) {
      content.style.top = `${PAPER.top - (page - 1) * (PAPER.height + PAPER.gap)}px`;
      const canvas = await toCanvas(host, { pixelRatio: 2, width: PAPER.width, height: PAPER.height,
        fontEmbedCSS,
        backgroundColor: documentModel.styles.background,
        filter: (node) => !(node instanceof HTMLElement && (node.classList.contains('katex-mathml') || node.hasAttribute('data-resize-handle'))),
      });
      const pngBytes = await canvasToPngBytes(canvas);
      if (!pngBytes) throw new Error('Could not render notebook page.');
      results.push({ page, pngBytes });
    }
    return { pages: results, pageCount };
  } finally { editor.destroy(); host.remove(); }
}
