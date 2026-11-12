import type { JSONContent } from '@tiptap/core';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { RootContent, PhrasingContent } from 'mdast';
import type { Annotation, NotebookImageAsset, TextNoteAnnotation } from '../types';

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
  fontFamily: 'Arial, sans-serif', fontSize: 13, lineHeight: 1.5, paragraphSpacing: 10,
  color: '#222222', background: '#ffffff',
};
export const BLOCK_TYPES = ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList',
  'listItem', 'taskItem', 'blockquote', 'codeBlock', 'horizontalRule', 'image', 'table', 'tableRow', 'tableCell', 'tableHeader', 'blockMath', 'sheetBreak'];

export function identifyBlocks(content: JSONContent, used = new Set<string>()): JSONContent {
  const attrs = { ...content.attrs };
  if (BLOCK_TYPES.includes(content.type ?? '')) {
    if (typeof attrs.id !== 'string' || used.has(attrs.id)) attrs.id = crypto.randomUUID();
    used.add(attrs.id);
  }
  return { ...content, ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(content.content ? { content: content.content.map((node) => identifyBlocks(node, used)) } : {}) };
}

export function emptyNotebook(minimumSheets = 1): NotebookDocument {
  return { version: 1, content: identifyBlocks({ type: 'doc', content: [{ type: 'paragraph' }] }),
    styles: { ...neutralStyles }, assets: {}, minimumSheets };
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
export function markdownBlocks(markdown: string, assets: Record<string, NotebookImageAsset> = {}): JSONContent[] {
  const tree = parser.parse(markdown);
  const definitions = new Map(tree.children.flatMap((node) => node.type === 'definition' ? [[node.identifier, node] as const] : []));
  const inline = (nodes: PhrasingContent[], marks: JSONContent['marks'] = []): JSONContent[] => nodes.flatMap((node): JSONContent[] => {
    switch (node.type) {
      case 'text': return node.value ? [{ type: 'text', text: node.value, ...(marks?.length ? { marks } : {}) }] : [];
      case 'strong': return inline(node.children, [...marks ?? [], { type: 'bold' }]);
      case 'emphasis': return inline(node.children, [...marks ?? [], { type: 'italic' }]);
      case 'delete': return inline(node.children, [...marks ?? [], { type: 'strike' }]);
      case 'inlineCode': return [{ type: 'text', text: node.value || ' ', marks: [...marks ?? [], { type: 'code' }] }];
      case 'inlineMath': return [{ type: 'inlineMath', attrs: { latex: node.value } }];
      case 'break': return [{ type: 'hardBreak' }];
      case 'link': return inline(node.children, [...marks ?? [], { type: 'link', attrs: { href: node.url } }]);
      case 'linkReference': {
        const definition = definitions.get(node.identifier);
        if (!definition) throw new Error(`Missing link definition: ${node.identifier}`);
        return inline(node.children, [...marks ?? [], { type: 'link', attrs: { href: definition.url } }]);
      }
      case 'imageReference': {
        const definition = definitions.get(node.identifier);
        if (!definition) throw new Error(`Missing image definition: ${node.identifier}`);
        return [image(definition.url, node.alt ?? '')];
      }
      case 'image': return [image(node.url, node.alt ?? '')];
      default: throw new Error(`Unsupported Markdown content: ${node.type}`);
    }
  });
  const image = (url: string, caption: string): JSONContent => {
    const id = url.startsWith('notebook-image/') ? url.slice(15) : null;
    const asset = id ? assets[id] : undefined;
    if (id && !asset) throw new Error(`Missing notebook image: ${id}`);
    if (!asset && !/^data:image\/(png|jpeg|webp|gif);base64,/.test(url)) throw new Error('Notebook images must be local image assets.');
    return { type: 'image', attrs: { src: asset?.dataUrl ?? url, assetId: id, alt: caption,
      caption, width: Math.min(asset?.width ?? 400, 499), height: null } };
  };
  const block = (node: RootContent): JSONContent[] => {
    switch (node.type) {
      case 'definition': return [];
      case 'heading': return [{ type: 'heading', attrs: { level: node.depth }, content: inline(node.children) }];
      case 'paragraph': {
        const result: JSONContent[] = []; let run: JSONContent[] = [];
        for (const child of inline(node.children)) {
          if (child.type === 'image') {
            if (run.length) result.push({ type: 'paragraph', content: run });
            result.push(child); run = [];
          } else run.push(child);
        }
        if (run.length || !result.length) result.push({ type: 'paragraph', content: run });
        return result;
      }
      case 'blockquote': return [{ type: 'blockquote', content: node.children.flatMap(block) }];
      case 'list': {
        const tasks = node.children.some((item) => typeof item.checked === 'boolean');
        return [{ type: tasks ? 'taskList' : node.ordered ? 'orderedList' : 'bulletList', attrs: { start: node.start ?? 1 },
          content: node.children.map((item) => ({ type: tasks ? 'taskItem' : 'listItem', attrs: { checked: item.checked ?? false }, content: item.children.flatMap(block) })) }];
      }
      case 'code': return [{ type: 'codeBlock', attrs: { language: node.lang }, ...(node.value ? { content: [{ type: 'text', text: node.value }] } : {}) }];
      case 'math': return [{ type: 'blockMath', attrs: { latex: node.value } }];
      case 'thematicBreak': return [{ type: 'horizontalRule' }];
      case 'table': return [{ type: 'table', content: node.children.map((row, index) => ({ type: 'tableRow', content: row.children.map((cell, column) => ({
        type: index === 0 ? 'tableHeader' : 'tableCell', attrs: { textAlign: node.align?.[column] ?? null }, content: [{ type: 'paragraph', content: inline(cell.children) }],
      })) })) }];
      default: throw new Error(`Unsupported Markdown block: ${node.type}`);
    }
  };
  return tree.children.flatMap(block).map((node) => identifyBlocks(node));
}

export function notebookText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'inlineMath' || node.type === 'blockMath') return String(node.attrs?.latex ?? '');
  if (node.type === 'image') return `[Image: ${node.attrs?.caption || node.attrs?.alt || 'Notebook image'}]`;
  return (node.content ?? []).map(notebookText).join(['paragraph', 'heading'].includes(node.type ?? '') ? '' : '\n');
}
export function notebookCarrier(annotations: Annotation[]): TextNoteAnnotation | undefined {
  return annotations.find((item): item is TextNoteAnnotation => item.type === 'text-note' && !!item.notebookDocument);
}
export function withNotebook(annotations: Annotation[], document: NotebookDocument): Annotation[] {
  const existing = notebookCarrier(annotations);
  const carrier: TextNoteAnnotation = { id: existing?.id ?? crypto.randomUUID(), type: 'text-note', kind: 'plain',
    pageNumber: 1, x: .08, y: .08, width: .84, fontSize: 13, color: '#222222', createdAt: existing?.createdAt ?? Date.now(),
    text: notebookText(document.content), notebookDocument: document };
  return [...annotations.filter((item) => item.id !== existing?.id), carrier];
}

/** Pure, repeatable conversion. Callers must persist a recovery copy before committing it. */
export function migrateNotebook(annotations: Annotation[], pageCount: number): Annotation[] {
  if (notebookCarrier(annotations)) return annotations;
  const document = emptyNotebook(pageCount);
  document.content.content = [];
  const formatted = annotations.filter((item): item is TextNoteAnnotation => item.type === 'text-note' && item.format === 'markdown')
    .sort((a, b) => a.pageNumber - b.pageNumber || a.createdAt - b.createdAt);
  let page = 1;
  for (const item of formatted) {
    while (page < item.pageNumber) { document.content.content.push(identifyBlocks({ type: 'sheetBreak' })); page++; }
    Object.assign(document.assets, item.inlineImages);
    const blocks = markdownBlocks(item.text, item.inlineImages);
    document.content.content.push(...blocks);
  }
  if (!document.content.content.length) document.content.content.push(identifyBlocks({ type: 'paragraph' }));
  return withNotebook(annotations.filter((item) => !formatted.some((note) => note.id === item.id)), document);
}
