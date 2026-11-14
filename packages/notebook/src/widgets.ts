import { Node, mergeAttributes } from '@tiptap/core';

const container = (name: string, tag: string, content: string) =>
  Node.create({
    name,
    group: 'block',
    content,
    defining: true,
    isolating: true,
    parseHTML: () => [{ tag: `${tag}[data-notebook-${name}]` }],
    renderHTML: ({ HTMLAttributes }) => [
      tag,
      mergeAttributes(HTMLAttributes, { [`data-notebook-${name}`]: '' }),
      0,
    ],
  });

const Callout = container('callout', 'aside', 'block+');
const Columns = container('columns', 'div', 'column{2,3}');
const Column = container('column', 'div', 'block+');
const ToggleTitle = Node.create({
  name: 'toggleTitle',
  content: 'inline*',
  defining: true,
  parseHTML: () => [{ tag: 'summary' }],
  renderHTML: ({ HTMLAttributes }) => ['summary', HTMLAttributes, 0],
});
const ToggleBody = container('toggleBody', 'div', 'block+');
const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'toggleTitle toggleBody',
  defining: true,
  addAttributes: () => ({ open: { default: true, parseHTML: (el) => el.hasAttribute('open') } }),
  parseHTML: () => [{ tag: 'details[data-notebook-toggle]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'details',
    mergeAttributes(HTMLAttributes, {
      'data-notebook-toggle': '',
      open: node.attrs.open ? '' : null,
    }),
    0,
  ],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('details');
      dom.dataset.notebookToggle = '';
      dom.open = Boolean(node.attrs.open);
      let current = node;
      const toggle = () => {
        const pos = getPos();
        if (editor.isEditable && pos !== undefined && dom.open !== current.attrs.open)
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, open: dom.open }),
          );
      };
      dom.addEventListener('toggle', toggle);
      return {
        dom,
        contentDOM: dom,
        update(next) {
          if (next.type !== current.type) return false;
          current = next;
          dom.open = Boolean(next.attrs.open);
          return true;
        },
        ignoreMutation: (mutation) => mutation.type === 'attributes' && mutation.target === dom,
        destroy: () => dom.removeEventListener('toggle', toggle),
      };
    };
  },
});

export interface NotebookReference {
  kind: 'pdf' | 'notebook';
  target: string;
  label: string;
  page: number;
}

const Reference = Node.create({
  name: 'reference',
  group: 'block',
  atom: true,
  addAttributes: () => ({
    kind: { default: 'pdf' },
    target: { default: '' },
    label: { default: '' },
    page: { default: 1 },
  }),
  parseHTML: () => [{ tag: 'div[data-notebook-reference]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-notebook-reference': '' }),
    `${node.attrs.label}${node.attrs.kind === 'pdf' ? ` · p. ${node.attrs.page}` : ''}`,
  ],
  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('div');
      dom.dataset.notebookReference = '';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${node.attrs.label}${node.attrs.kind === 'pdf' ? ` · p. ${node.attrs.page}` : ''} ↗`;
      button.onclick = () =>
        editor.view.dom.dispatchEvent(
          new CustomEvent('notebook-reference', { bubbles: true, detail: node.attrs }),
        );
      dom.append(button);
      return {
        dom,
        stopEvent: () => true,
        ignoreMutation: () => true,
        destroy: () => {
          button.onclick = null;
        },
      };
    };
  },
});

const Contents = Node.create({
  name: 'contents',
  group: 'block',
  atom: true,
  parseHTML: () => [{ tag: 'nav[data-notebook-contents]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'nav',
    mergeAttributes(HTMLAttributes, { 'data-notebook-contents': '' }),
    'Table of contents',
  ],
  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement('nav');
      dom.dataset.notebookContents = '';
      dom.setAttribute('aria-label', 'Table of contents');
      const render = () => {
        dom.replaceChildren();
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name !== 'heading') return;
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = node.textContent || 'Untitled heading';
          button.style.paddingLeft = `${(Number(node.attrs.level) - 1) * 12}px`;
          button.onclick = () => {
            editor.commands.setTextSelection(pos + 1);
            const element = editor.view.nodeDOM(pos);
            if (element instanceof HTMLElement) element.scrollIntoView({ block: 'center' });
          };
          dom.append(button);
        });
        if (!dom.childNodes.length)
          dom.textContent = 'Add headings to build your table of contents';
      };
      render();
      editor.on('update', render);
      return {
        dom,
        stopEvent: () => true,
        ignoreMutation: () => true,
        destroy: () => {
          editor.off('update', render);
        },
      };
    };
  },
});

export const notebookWidgets = [
  Callout,
  Columns,
  Column,
  Toggle,
  ToggleTitle,
  ToggleBody,
  Reference,
  Contents,
];
