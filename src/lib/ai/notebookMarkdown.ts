import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkStringify, { bullet: '-', fences: true });
type Root = ReturnType<typeof processor.parse>;
type RootContent = Root['children'][number];
type PhrasingContent = Extract<RootContent, { type: 'paragraph' }>['children'][number];

function splitText(value: string): [string, string] | null {
  if (value.length < 2) return null;
  const middle = Math.floor(value.length / 2);
  const space = value.lastIndexOf(' ', middle);
  const at = space > middle / 2 ? space + 1 : middle;
  return [value.slice(0, at), value.slice(at)];
}

function splitInline(node: PhrasingContent): [PhrasingContent, PhrasingContent] | null {
  if ('children' in node && node.children.length) {
    if (node.children.length > 1) {
      const at = Math.ceil(node.children.length / 2);
      return [{ ...node, children: node.children.slice(0, at) }, { ...node, children: node.children.slice(at) }] as [PhrasingContent, PhrasingContent];
    }
    const parts = splitInline(node.children[0]);
    return parts ? [{ ...node, children: [parts[0]] }, { ...node, children: [parts[1]] }] as [PhrasingContent, PhrasingContent] : null;
  }
  if (node.type !== 'text') return null;
  const parts = splitText(node.value);
  return parts ? [{ ...node, value: parts[0] }, { ...node, value: parts[1] }] : null;
}

function splitBlock(node: RootContent): [RootContent, RootContent] | null {
  if (node.type === 'list' && node.children.length > 1) {
    const at = Math.ceil(node.children.length / 2);
    return [{ ...node, children: node.children.slice(0, at) },
      { ...node, start: node.ordered ? (node.start ?? 1) + at : node.start, children: node.children.slice(at) }];
  }
  if (node.type === 'table' && node.children.length > 2) {
    const at = 1 + Math.ceil((node.children.length - 1) / 2);
    return [{ ...node, children: node.children.slice(0, at) }, { ...node, children: [node.children[0], ...node.children.slice(at)] }];
  }
  if (node.type === 'blockquote' || node.type === 'list') {
    if (node.children.length > 1) {
      const at = Math.ceil(node.children.length / 2);
      return [{ ...node, children: node.children.slice(0, at) }, { ...node, children: node.children.slice(at) }] as [RootContent, RootContent];
    }
    const child = node.children[0];
    if (!child) return null;
    if (child.type === 'listItem') {
      if (child.children.length > 1) {
        const at = Math.ceil(child.children.length / 2);
        return [{ ...node, children: [{ ...child, children: child.children.slice(0, at) }] },
          { ...node, children: [{ ...child, children: child.children.slice(at) }] }] as [RootContent, RootContent];
      }
      const parts = splitBlock(child.children[0]);
      return parts ? parts.map((part) => ({ ...node, children: [{ ...child, children: [part] }] })) as [RootContent, RootContent] : null;
    }
    const parts = splitBlock(child);
    return parts ? parts.map((part) => ({ ...node, children: [part] })) as [RootContent, RootContent] : null;
  }
  if (node.type === 'paragraph' || node.type === 'heading') {
    if (node.children.length > 1) {
      const at = Math.ceil(node.children.length / 2);
      return [{ ...node, children: node.children.slice(0, at) }, { ...node, children: node.children.slice(at) }];
    }
    const parts = node.children[0] && splitInline(node.children[0]);
    return parts ? [{ ...node, children: [parts[0]] }, { ...node, children: [parts[1]] }] : null;
  }
  if (node.type === 'code') {
    const parts = splitText(node.value);
    return parts ? [{ ...node, value: parts[0] }, { ...node, value: parts[1] }] : null;
  }
  return null;
}

/** Measure complete Markdown blocks, keeping headings with the following content. */
export function paginateNotebookMarkdown(text: string, measure: (markdown: string) => number, height = 700): string[] {
  const tree = processor.parse(text);
  const definitions = tree.children.filter((node) => node.type === 'definition');
  const blocks = tree.children.filter((node) => node.type !== 'definition');
  const render = (nodes: RootContent[]) => processor.stringify({ type: 'root', children: [...nodes, ...definitions] } satisfies Root).trim();
  const pages: string[] = [];
  let current: RootContent[] = [];
  const add = (node: RootContent, depth = 0) => {
    if (depth > 24) throw new Error('This note contains a block that cannot fit on a page.');
    if (measure(render([...current, node])) <= height) { current.push(node); return; }
    if (current.length) {
      const heading = current.at(-1)?.type === 'heading' ? current.pop() : undefined;
      if (current.length) pages.push(render(current));
      current = heading ? [heading] : [];
      if (measure(render([...current, node])) <= height) { current.push(node); return; }
    }
    const parts = splitBlock(node);
    if (!parts) throw new Error('A formula or table is too tall for one note page. Shorten that block and try again.');
    add(parts[0], depth + 1);
    add(parts[1], depth + 1);
  };
  for (const block of blocks) add(block);
  if (current.length) pages.push(render(current));
  return pages;
}
