import type { JSONContent } from '@tiptap/core';

export interface NotebookImageAsset {
  dataUrl: string;
  width: number;
  height: number;
}

export interface NotebookStyles {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  color: string;
  background: string;
}
export interface NotebookDocument {
  version: 1;
  content: JSONContent;
  styles: NotebookStyles;
  assets: Record<string, NotebookImageAsset>;
  /** Explicit sheets, including blank or occupied sheets, survive content shrinkage. */
  minimumSheets: number;
}
export const neutralStyles: NotebookStyles = {
  fontFamily: 'Arial, sans-serif',
  fontSize: 13,
  lineHeight: 1.5,
  paragraphSpacing: 10,
  color: '#222222',
  background: '#ffffff',
};
export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'taskList',
  'listItem',
  'taskItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'image',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'blockMath',
  'sheetBreak',
];

export function identifyBlocks(content: JSONContent, used = new Set<string>()): JSONContent {
  const attrs = { ...content.attrs };
  if (BLOCK_TYPES.includes(content.type ?? '')) {
    if (typeof attrs.id !== 'string' || used.has(attrs.id)) attrs.id = crypto.randomUUID();
    used.add(attrs.id);
  }
  return {
    ...content,
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(content.content
      ? { content: content.content.map((node) => identifyBlocks(node, used)) }
      : {}),
  };
}

export function emptyNotebook(minimumSheets = 1): NotebookDocument {
  return {
    version: 1,
    content: identifyBlocks({ type: 'doc', content: [{ type: 'paragraph' }] }),
    styles: { ...neutralStyles },
    assets: {},
    minimumSheets,
  };
}

export function notebookText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'inlineMath' || node.type === 'blockMath')
    return String(node.attrs?.latex ?? '');
  if (node.type === 'image')
    return `[Image: ${node.attrs?.caption || node.attrs?.alt || 'Notebook image'}]`;
  return (node.content ?? [])
    .map(notebookText)
    .join(['paragraph', 'heading'].includes(node.type ?? '') ? '' : '\n');
}
