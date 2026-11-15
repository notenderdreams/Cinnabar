import type { JSONContent } from '@tiptap/core';
import {
  identifyBlocks,
  notebookText,
  validateDocument,
  type NotebookDocument,
} from '@cinnabar/notebook';
import { markdownBlocks } from '../notebook/document';
import { normalizeAiResponseMarkdown } from './aiResponseMarkdown';
import type { AiChatAttachment } from '../types';

export interface AiBlockContent {
  kind:
    | 'markdown'
    | 'callout'
    | 'toggle'
    | 'columns'
    | 'contents'
    | 'pageBreak'
    | 'image'
    | 'reference';
  text: string | null;
  title: string | null;
  columns: string[] | null;
  attachmentId: string | null;
  referenceId: string | null;
}
interface AiBlockStyle {
  fontSize: number | null;
  color: string | null;
  background: string | null;
  textAlign: 'left' | 'center' | 'right' | 'justify' | null;
}
export interface AiNotebookEdit {
  op:
    | 'append'
    | 'prepend'
    | 'insert_before'
    | 'insert_after'
    | 'replace'
    | 'delete'
    | 'move_before'
    | 'move_after'
    | 'format';
  targetId: string | null;
  anchorId: string | null;
  content: AiBlockContent | null;
  style: AiBlockStyle | null;
}
export interface AiNotebookReferenceOption {
  id: string;
  kind: 'pdf' | 'notebook';
  target: string;
  label: string;
  page: number;
}
const ops = [
  'append',
  'prepend',
  'insert_before',
  'insert_after',
  'replace',
  'delete',
  'move_before',
  'move_after',
  'format',
];
const kinds = [
  'markdown',
  'callout',
  'toggle',
  'columns',
  'contents',
  'pageBreak',
  'image',
  'reference',
];
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const optionalString = (value: unknown) =>
  value === null || (typeof value === 'string' && value.length <= 20_000);
const onlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

/** Runtime validation applies to CLI responses as well as stored/retried responses. */
export function parseNotebookEdits(value: unknown): AiNotebookEdit[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 30 ||
    JSON.stringify(value).length > 60_000
  )
    throw new Error('Invalid notebook edit batch.');
  for (const item of value as unknown[]) {
    if (
      !object(item) ||
      !onlyKeys(item, ['op', 'targetId', 'anchorId', 'content', 'style']) ||
      !ops.includes(String(item.op)) ||
      !optionalString(item.targetId) ||
      !optionalString(item.anchorId)
    )
      throw new Error('Invalid notebook edit.');
    if (item.content !== null) {
      const c = item.content;
      if (
        !object(c) ||
        !onlyKeys(c, ['kind', 'text', 'title', 'columns', 'attachmentId', 'referenceId']) ||
        !kinds.includes(String(c.kind)) ||
        !['text', 'title', 'attachmentId', 'referenceId'].every((key) => optionalString(c[key])) ||
        !(
          c.columns === null ||
          (Array.isArray(c.columns) &&
            c.columns.length >= 2 &&
            c.columns.length <= 3 &&
            c.columns.every((text) => typeof text === 'string' && text.length <= 20_000))
        )
      )
        throw new Error('Invalid notebook block content.');
    }
    if (item.style !== null) {
      const style = item.style;
      if (
        !object(style) ||
        !onlyKeys(style, ['fontSize', 'color', 'background', 'textAlign']) ||
        !(
          style.fontSize === null ||
          (typeof style.fontSize === 'number' && style.fontSize >= 8 && style.fontSize <= 72)
        ) ||
        !['color', 'background'].every(
          (key) =>
            style[key] === null ||
            (typeof style[key] === 'string' && /^#[\da-f]{6}$/i.test(style[key])),
        ) ||
        ![null, 'left', 'center', 'right', 'justify'].includes(style.textAlign as string | null)
      )
        throw new Error('Invalid notebook block formatting.');
    }
    const creates = ['append', 'prepend', 'insert_before', 'insert_after', 'replace'].includes(
      String(item.op),
    );
    if (
      creates !== (item.content !== null) ||
      (item.op === 'format') !== (item.style !== null) ||
      (!['append', 'prepend'].includes(String(item.op)) && !item.targetId) ||
      (String(item.op).startsWith('move_') && !item.anchorId)
    )
      throw new Error('Incomplete notebook edit.');
  }
  return value as AiNotebookEdit[];
}

export function notebookBlockIndex(document: NotebookDocument) {
  const result: {
    id: string;
    type: string;
    text: string;
    parentId: string | null;
    content?: JSONContent;
  }[] = [];
  let budget = 48_000;
  const readable = (node: JSONContent): JSONContent => ({
    ...node,
    ...(node.attrs
      ? { attrs: Object.fromEntries(Object.entries(node.attrs).filter(([key]) => key !== 'src')) }
      : {}),
    ...(node.content ? { content: node.content.map(readable) } : {}),
  });
  const visit = (node: JSONContent, parentId: string | null) => {
    if (result.length >= 160) return;
    const id: unknown = node.attrs?.id;
    if (typeof id === 'string') {
      const content = readable(node);
      const size = JSON.stringify(content).length;
      const includeContent = size <= 6000 && size <= budget;
      if (includeContent) budget -= size;
      result.push({
        id,
        type: node.type ?? '',
        text: notebookText(node).slice(0, 500),
        parentId,
        ...(includeContent ? { content } : {}),
      });
    }
    for (const child of node.content ?? []) visit(child, typeof id === 'string' ? id : parentId);
  };
  visit(document.content, null);
  return result.slice(0, 160);
}

/** Build and validate a detached draft; callers commit it as a single undoable session edit. */
export function applyNotebookEdits(
  document: NotebookDocument,
  edits: AiNotebookEdit[],
  images: AiChatAttachment[] = [],
  references: AiNotebookReferenceOption[] = [],
): NotebookDocument {
  parseNotebookEdits(edits);
  const draft = structuredClone(document);
  const markdown = (text: string | null) =>
    markdownBlocks(normalizeAiResponseMarkdown(text ?? ''), draft.assets);
  const body = (text: string | null) => {
    const blocks = markdown(text);
    return blocks.length ? blocks : [{ type: 'paragraph' }];
  };
  const content = (spec: AiBlockContent): JSONContent[] => {
    switch (spec.kind) {
      case 'markdown':
        if (!spec.text?.trim()) throw new Error('Notebook text cannot be empty.');
        return markdown(spec.text);
      case 'callout':
        return [
          {
            type: 'callout',
            content: body(spec.text),
          },
        ];
      case 'toggle':
        return [
          {
            type: 'toggle',
            attrs: { open: true },
            content: [
              {
                type: 'toggleTitle',
                content: spec.title ? [{ type: 'text', text: spec.title }] : [],
              },
              {
                type: 'toggleBody',
                content: body(spec.text),
              },
            ],
          },
        ];
      case 'columns':
        if (!spec.columns) throw new Error('Columns require two or three text sections.');
        return [
          {
            type: 'columns',
            content: spec.columns.map((text) => ({
              type: 'column',
              content: body(text),
            })),
          },
        ];
      case 'contents':
        return [{ type: 'contents' }];
      case 'pageBreak':
        return [{ type: 'sheetBreak' }];
      case 'reference': {
        const ref = references.find((ref) => ref.id === spec.referenceId);
        if (!ref) throw new Error('The referenced document is unavailable.');
        return [
          {
            type: 'reference',
            attrs: { kind: ref.kind, target: ref.target, label: ref.label, page: ref.page },
          },
        ];
      }
      case 'image': {
        const image = images.find(
          (image) => image.type === 'image' && image.id === spec.attachmentId,
        );
        if (
          !image?.dataUrl ||
          !/^data:image\/(png|jpeg|webp|gif);base64,/.test(image.dataUrl) ||
          !image.width ||
          !image.height
        )
          throw new Error('Attach the image before adding it to the notebook.');
        const id = crypto.randomUUID();
        draft.assets[id] = { dataUrl: image.dataUrl, width: image.width, height: image.height };
        return [
          {
            type: 'image',
            attrs: {
              src: image.dataUrl,
              assetId: id,
              width: Math.min(499, image.width),
              height: null,
              caption: spec.title ?? '',
              alt: spec.title ?? '',
            },
          },
        ];
      }
    }
  };
  const find = (
    id: string | null,
    node = draft.content,
  ): { parent: JSONContent; index: number; node: JSONContent } | null => {
    for (let index = 0; index < (node.content?.length ?? 0); index++) {
      const child = node.content![index];
      if (child.attrs?.id === id) return { parent: node, index, node: child };
      const nested = find(id, child);
      if (nested) return nested;
    }
    return null;
  };
  for (const edit of edits) {
    const target = edit.targetId ? find(edit.targetId) : null;
    if (edit.targetId && !target) throw new Error('The target block no longer exists.');
    if (edit.op === 'append' || edit.op === 'prepend') {
      const parent = target?.node ?? draft.content;
      const blocks = content(edit.content!);
      parent.content ??= [];
      parent.content.splice(edit.op === 'prepend' ? 0 : parent.content.length, 0, ...blocks);
    } else if (edit.op === 'format') {
      target!.node.attrs = {
        ...target!.node.attrs,
        ...Object.fromEntries(Object.entries(edit.style!).filter(([, value]) => value !== null)),
      };
    } else if (edit.op === 'delete') {
      target!.parent.content!.splice(target!.index, 1);
    } else if (edit.op === 'move_before' || edit.op === 'move_after') {
      if (edit.targetId === edit.anchorId || find(edit.anchorId, target!.node))
        throw new Error('Cannot move a block into itself.');
      const moving = target!.parent.content!.splice(target!.index, 1)[0];
      const anchor = find(edit.anchorId);
      if (!anchor) throw new Error('The destination block no longer exists.');
      anchor.parent.content!.splice(anchor.index + (edit.op === 'move_after' ? 1 : 0), 0, moving);
    } else {
      const blocks = content(edit.content!);
      if (edit.op === 'replace' && blocks[0])
        blocks[0].attrs = { ...blocks[0].attrs, id: edit.targetId };
      target!.parent.content!.splice(
        target!.index + (edit.op === 'insert_after' ? 1 : 0),
        edit.op === 'replace' ? 1 : 0,
        ...blocks,
      );
    }
  }
  const repair = (node: JSONContent) => {
    if (
      ['doc', 'column', 'callout', 'toggleBody'].includes(node.type ?? '') &&
      !node.content?.length
    )
      node.content = [{ type: 'paragraph' }];
    node.content?.forEach(repair);
  };
  repair(draft.content);
  draft.content = identifyBlocks(draft.content);
  validateDocument(draft);
  return draft;
}
