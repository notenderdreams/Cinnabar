import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFOutlineItem } from '../types';

export interface PdfOverview {
  title?: string;
  author?: string;
  outline: PDFOutlineItem[];
}

export async function withPdfDeadline<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('PDF loading timed out. Please try opening the document again.')), milliseconds);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Optional document information must never keep the reader behind its loading screen. */
export async function readPdfOverview(document: PDFDocumentProxy, milliseconds = 1500): Promise<PdfOverview> {
  let expired = false;
  const work = (async (): Promise<PdfOverview> => {
    const [metadata, items] = await Promise.all([
      document.getMetadata().catch(() => null), document.getOutline().catch(() => null),
    ]);
    if (expired) return { outline: [] };
    const info = (metadata?.info ?? {}) as Record<string, unknown>;
    const outline: PDFOutlineItem[] = [];
    for (const item of items ?? []) {
      if (expired) return { outline: [] };
      let pageNumber = 1;
      try {
        const destination = typeof item.dest === 'string' ? await document.getDestination(item.dest) : item.dest;
        if (expired) return { outline: [] };
        if (Array.isArray(destination) && destination[0]) pageNumber = await document.getPageIndex(destination[0]) + 1;
      } catch { /* Keep the outline title when its optional destination cannot be resolved. */ }
      outline.push({ title: item.title || 'Untitled Section', pageNumber });
    }
    return { title: typeof info.Title === 'string' ? info.Title : undefined,
      author: typeof info.Author === 'string' ? info.Author : undefined, outline };
  })();
  try { return await withPdfDeadline(work, milliseconds); }
  catch { return { outline: [] }; }
  finally { expired = true; }
}
