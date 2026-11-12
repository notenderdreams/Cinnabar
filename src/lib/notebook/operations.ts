import { getSchema } from '@tiptap/core';
import { Transform } from '@tiptap/pm/transform';
import type { Annotation } from '../types';
import { reindexAfterPageDeletion, reindexAfterPageInsertion } from '../pdf/pageExtractor';
import { identifyBlocks, notebookCarrier, withNotebook, type NotebookDocument } from './document';
import { notebookExtensions } from './extensions';
import type { NotebookLayout } from './layout';

export function validateNotebookDocument(document: NotebookDocument): void {
  if (document.version !== 1 || !Number.isSafeInteger(document.minimumSheets) || document.minimumSheets < 1 || !document.assets ||
    !document.styles || ![document.styles.fontSize, document.styles.lineHeight, document.styles.paragraphSpacing].every(Number.isFinite) ||
    ![document.styles.fontFamily, document.styles.color, document.styles.background].every((value) => typeof value === 'string')) {
    throw new Error('Unsupported or invalid notebook document.');
  }
  const node = getSchema(notebookExtensions(false)).nodeFromJSON(document.content); node.check();
  if (node.type.name !== 'doc') throw new Error('A notebook must contain a block document.');
  node.descendants((child) => {
    if (child.type.name === 'image' && !/^data:image\/(png|jpeg|webp|gif);base64,/.test(child.attrs.src)) throw new Error('Notebook images must be local assets.');
  });
}

/** Combine notebook transfers while preserving local ink coordinates and incoming typography. */
export function mergeNotebookData(existing: Annotation[], incoming: Annotation[], count: number, laidOutPages: number): Annotation[] {
  const current = notebookCarrier(existing)?.notebookDocument;
  const imported = notebookCarrier(incoming)?.notebookDocument;
  if (!current || !imported) throw new Error('Select a block notebook export.');
  validateNotebookDocument(imported);
  const other = incoming.filter((item) => !(item.type === 'text-note' && item.notebookDocument));
  const occupied = existing.some((item) => !(item.type === 'text-note' && item.notebookDocument)) ||
    current.content.content?.some((block) => block.type !== 'paragraph' || block.content?.length);
  const offset = occupied ? count : 0;
  const assets = { ...current.assets };
  const remap = new Map<string, string>();
  for (const [id, asset] of Object.entries(imported.assets)) {
    const next = assets[id] ? crypto.randomUUID() : id; remap.set(id, next); assets[next] = asset;
  }
  const copy = structuredClone(imported.content);
  const visit = (node: typeof copy) => { if (node.attrs?.assetId) node.attrs.assetId = remap.get(node.attrs.assetId) ?? node.attrs.assetId; node.content?.forEach(visit); };
  visit(copy);
  const blocks = (copy.content ?? []).map((block) => ({ ...block, attrs: {
    ...block.attrs, fontFamily: block.attrs?.fontFamily ?? imported.styles.fontFamily,
    fontSize: block.attrs?.fontSize ?? imported.styles.fontSize, lineHeight: block.attrs?.lineHeight ?? imported.styles.lineHeight,
    spacing: block.attrs?.spacing ?? imported.styles.paragraphSpacing, color: block.attrs?.color ?? imported.styles.color,
  } }));
  const breaks = Array.from({ length: occupied ? Math.max(1, count - laidOutPages + 1) : 0 }, () => ({ type: 'sheetBreak' }));
  const next = { ...occupied ? current : imported, assets, minimumSheets: offset + imported.minimumSheets,
    content: identifyBlocks({ type: 'doc', content: [...occupied ? current.content.content ?? [] : [], ...breaks, ...blocks] }) };
  return withNotebook([...existing, ...other.map((item) => ({ ...item, id: crypto.randomUUID(), pageNumber: item.pageNumber + offset }))], next);
}

export function editNotebookSheet(annotations: Annotation[], count: number, page: number, action: 'insert' | 'delete', layout: NotebookLayout) {
  const carrier = notebookCarrier(annotations);
  if (!carrier?.notebookDocument || page < 1 || page > count) throw new Error('Notebook sheet is unavailable.');
  if (!layout.pages.length) throw new Error('Wait for notebook pagination.');
  const document = carrier.notebookDocument;
  const schema = getSchema(notebookExtensions(false));
  const node = schema.nodeFromJSON(document.content);
  const tr = new Transform(node);
  const other = annotations.filter((item) => item.id !== carrier.id);
  if (action === 'delete') {
    const range = layout.pages[page - 1];
    if (range) {
      const parts = range.ranges ?? [range];
      for (const part of [...parts].sort((a, b) => b.from - a.from)) {
        if (part.to > part.from) tr.deleteRange(part.from, part.to);
      }
    }
    const nextCount = Math.max(1, count - 1);
    return { annotations: withNotebook(reindexAfterPageDeletion(other, page), { ...document,
      content: identifyBlocks(tr.doc.toJSON()), minimumSheets: Math.max(1, document.minimumSheets - (page <= document.minimumSheets ? 1 : 0)) }),
      count: nextCount, page: Math.min(page, nextCount) };
  }
  const at = layout.pages[page]?.from ?? node.content.size;
  const breakNode = schema.nodes.sheetBreak.create();
  // A blank sheet between existing writing needs a break on both sides.
  tr.replaceRangeWith(at, at, breakNode);
  if (at === node.content.size) {
    for (let index = layout.pages.length; index < page; index++) tr.insert(tr.doc.content.size, breakNode);
  }
  if (at < node.content.size) {
    const mapped = tr.mapping.map(at, 1);
    tr.insert(mapped, [schema.nodes.paragraph.create(), breakNode]);
  } else tr.insert(tr.doc.content.size, schema.nodes.paragraph.create());
  return { annotations: withNotebook(reindexAfterPageInsertion(other, page), { ...document,
    content: identifyBlocks(tr.doc.toJSON()), minimumSheets: Math.max(page + 1, document.minimumSheets + (page <= document.minimumSheets ? 1 : 0)) }),
    count: count + 1, page: page + 1 };
}
