import type { SearchMatch } from '../types';

/** Follow PDF.js text order: runs may be single letters, with explicit spaces and EOLs. */
export function findPageMatches(
  items: ReadonlyArray<{ str: string } | object>,
  query: string,
  pageNumber: number,
): SearchMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  let text = '';
  const segments: Array<{ itemIndex: number; start: number; end: number }> = [];
  let itemIndex = 0;
  for (const item of items) {
    if (!('str' in item) || typeof item.str !== 'string') continue;
    const index = itemIndex++;
    if (item.str) {
      const start = text.length;
      text += item.str;
      segments.push({ itemIndex: index, start, end: text.length });
    }
    if ('hasEOL' in item && item.hasEOL && text && !/\s$/.test(text)) text += ' ';
  }
  const matches: SearchMatch[] = [];
  const lower = text.toLowerCase();
  for (let position = lower.indexOf(needle); position !== -1; position = lower.indexOf(needle, position + needle.length)) {
    const endPosition = position + needle.length;
    const first = segments.find(segment => segment.end > position);
    const last = segments.find(segment => segment.end >= endPosition);
    if (!first || !last) continue;
    const start = Math.max(0, position - 30);
    const end = Math.min(text.length, endPosition + 30);
    matches.push({
      pageNumber,
      matchIndex: matches.length,
      snippet: `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`,
      start: { itemIndex: first.itemIndex, offset: Math.max(0, position - first.start) },
      end: { itemIndex: last.itemIndex, offset: endPosition - last.start },
    });
  }
  return matches;
}

export function getSearchMatchRange(page: HTMLElement, match: SearchMatch): Range | null {
  const start = page.querySelector(`[data-search-item="${match.start.itemIndex}"]`)?.firstChild;
  const end = page.querySelector(`[data-search-item="${match.end.itemIndex}"]`)?.firstChild;
  if (!start || !end || match.start.offset > (start.textContent?.length ?? 0) || match.end.offset > (end.textContent?.length ?? 0)) return null;
  const range = document.createRange();
  range.setStart(start, match.start.offset);
  range.setEnd(end, match.end.offset);
  return range;
}
