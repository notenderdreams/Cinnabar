import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { toCanvas } from 'html-to-image';
import { NotebookContent } from '../../components/annotations/NotebookContent';
import { paginateNotebookMarkdown } from '../ai/notebookMarkdown';
import type { TextNoteAnnotation, NotebookImageAsset } from '../types';
import { canvasToPngBytes } from './textNoteRasterizer';

function createNotebookSurface(width: number, fontSize: number, color = '#243247', fontFamily = 'sans') {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.dataset.notebookSurface = 'true';
  Object.assign(host.style, { position: 'fixed', left: '-100000px', top: '0', width: `${width}px`,
    fontSize: `${fontSize}px`, color, pointerEvents: 'none',
    fontFamily: fontFamily === 'serif' ? 'Georgia, Cambria, serif' : fontFamily === 'mono' ? 'monospace' : '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' });
  document.body.append(host);
  const root = createRoot(host);
  return { host, render: (text: string, images?: Record<string, NotebookImageAsset>) => flushSync(() => root.render(<NotebookContent text={text} images={images} />)),
    destroy: () => { root.unmount(); host.remove(); } };
}

export async function layoutNotebookMarkdown(text: string, images?: Record<string, NotebookImageAsset>): Promise<string[]> {
  const surface = createNotebookSurface(595 * .84, 13);
  try {
    surface.render(text, images);
    await document.fonts.ready;
    return paginateNotebookMarkdown(text, (markdown) => {
      surface.render(markdown, images);
      return surface.host.getBoundingClientRect().height;
    });
  } finally { surface.destroy(); }
}

export async function rasterizeNotebookNote(annotation: TextNoteAnnotation, pageWidth: number) {
  const width = (annotation.width ?? .84) * pageWidth;
  const fontSize = (annotation.fontSize ?? 13) * pageWidth / 595;
  const surface = createNotebookSurface(width, fontSize, annotation.color, annotation.fontFamily);
  surface.host.style.textAlign = annotation.align ?? 'left';
  try {
    surface.render(annotation.text, annotation.inlineImages);
    await document.fonts.ready;
    const height = Math.ceil(surface.host.getBoundingClientRect().height);
    const canvas = await toCanvas(surface.host.firstElementChild as HTMLElement, {
      pixelRatio: 2, width, height, backgroundColor: '#ffffff',
      filter: (node) => !(node instanceof HTMLElement && node.classList.contains('katex-mathml')),
    });
    const pngBytes = await canvasToPngBytes(canvas);
    return pngBytes ? { pngBytes, width, height } : null;
  } finally { surface.destroy(); }
}
