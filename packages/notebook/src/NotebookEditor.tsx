import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { createPortal } from 'react-dom';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor, JSONContent } from '@tiptap/core';
import { notebookExtensions } from './extensions';
import { BlockDragging } from './blockDragging';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GripVertical } from 'lucide-react';
import { BlockCommands, type BlockChoiceKind, type BlockChoice } from './BlockCommands';
import { blockCommands } from './blockCommandItems';
import type { NotebookReference } from './widgets';
export type { BlockChoice, BlockChoiceKind } from './BlockCommands';
export type { NotebookReference } from './widgets';
export interface NotebookSelection {
  blockIds: string[];
  text: string;
}
import { PaperLayout, PAPER, requestNotebookReflow, type NotebookLayout } from './layout';
import {
  identifyBlocks,
  neutralStyles,
  type NotebookDocument,
  type NotebookStyles,
} from './document';
import 'katex/dist/katex.min.css';

interface Props {
  document: NotebookDocument;
  zoom: number;
  editable: boolean;
  onChange: (document: NotebookDocument, group?: string) => void;
  onLayout: (layout: NotebookLayout) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  controlsHost: HTMLElement | null;
  onRequestControls?: () => void;
  onPickImage?: () => Promise<File | null>;
  loadBlockChoices?: (kind: BlockChoiceKind) => Promise<BlockChoice[]>;
  onOpenReference?: (reference: NotebookReference) => void;
  onSelectionChange?: (selection: NotebookSelection) => void;
}
function selectedBlock(editor: Editor) {
  const { $from } = editor.state.selection;
  const pos = $from.depth ? $from.before(1) : $from.pos;
  const node = editor.state.doc.nodeAt(pos);
  return node ? { pos, node } : null;
}
export function NotebookEditor(props: Props) {
  const current = useRef(props);
  current.current = props;
  const applyingExternal = useRef(false);
  const typing = useRef({ time: 0, end: -1, group: '' });
  const [formula, setFormula] = useState('');
  const [link, setLink] = useState('');
  const [caption, setCaption] = useState('');
  const editor = useEditor({
    extensions: [
      ...notebookExtensions(),
      BlockDragging.configure({
        renderHandle: () => {
          const handle = document.createElement('button');
          handle.type = 'button';
          handle.className = 'notebook-drag-handle';
          handle.setAttribute('aria-label', 'Drag block to reorder');
          handle.title = 'Drag to reorder · Alt+Shift+↑/↓ to move selected block';
          handle.innerHTML = renderToStaticMarkup(createElement(GripVertical, { size: 14 }));
          return handle;
        },
      }),
      PaperLayout.configure({ onLayout: (layout) => current.current.onLayout(layout) }),
    ],
    content: props.document.content,
    editable: props.editable,
    onSelectionUpdate: ({ editor: instance }) => {
      const { from, to, $from } = instance.state.selection;
      const blockIds: string[] = [];
      instance.state.doc.forEach((node, offset) => {
        if (offset < to && offset + node.nodeSize > from && typeof node.attrs.id === 'string')
          blockIds.push(node.attrs.id);
      });
      const cursorBlockId: unknown = $from.depth ? $from.node(1).attrs.id : undefined;
      if (!blockIds.length && typeof cursorBlockId === 'string') blockIds.push(cursorBlockId);
      current.current.onSelectionChange?.({
        blockIds: blockIds.slice(0, 30),
        text: instance.state.doc.textBetween(from, to, '\n').slice(0, 4000),
      });
    },
    editorProps: {
      attributes: {
        class: 'notebook-block-document',
        'aria-label': 'Notebook blocks. Type slash to insert a block.',
        spellcheck: 'true',
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          event.shiftKey ? current.current.redo() : current.current.undo();
          return true;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
          event.preventDefault();
          current.current.redo();
          return true;
        }
        if (event.altKey && event.shiftKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          moveBlock(event.key === 'ArrowUp' ? -1 : 1);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
          item.type.startsWith('image/'),
        );
        if (!file) return false;
        event.preventDefault();
        event.stopPropagation();
        insertImageFile(file);
        return true;
      },
    },
    onUpdate: ({ editor: instance, transaction }) => {
      if (applyingExternal.current) return;
      const step = transaction.steps.length === 1 ? transaction.steps[0].toJSON() : undefined;
      const textInput =
        step?.stepType === 'replace' &&
        !transaction.getMeta('uiEvent') &&
        (!step.slice || step.slice.content?.every((node: JSONContent) => node.type === 'text'));
      const now = Date.now();
      const adjacent = step && (step.from === typing.current.end || step.to === typing.current.end);
      const group = textInput
        ? now - typing.current.time < 750 && adjacent
          ? typing.current.group
          : crypto.randomUUID()
        : undefined;
      typing.current = {
        time: textInput ? now : 0,
        end: instance.state.selection.to,
        group: group ?? '',
      };
      current.current.onChange({ ...current.current.document, content: instance.getJSON() }, group);
    },
  });
  useEffect(() => {
    if (!editor) return;
    const open = (event: Event) =>
      current.current.onOpenReference?.((event as CustomEvent<NotebookReference>).detail);
    editor.view.dom.addEventListener('notebook-reference', open);
    return () => editor.view.dom.removeEventListener('notebook-reference', open);
  }, [editor]);
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance
        ? {
            bold: instance.isActive('bold'),
            italic: instance.isActive('italic'),
            underline: instance.isActive('underline'),
            table: instance.isActive('table'),
            image: instance.isActive('image'),
            attrs: selectedBlock(instance)?.node.attrs,
            latex: instance.isActive('blockMath')
              ? instance.getAttributes('blockMath').latex
              : instance.isActive('inlineMath')
                ? instance.getAttributes('inlineMath').latex
                : undefined,
          }
        : null,
  });
  useEffect(() => {
    if (state?.latex !== undefined) setFormula(state.latex);
  }, [state?.latex]);
  useEffect(() => {
    if (state?.image) setCaption(state.attrs?.caption ?? '');
  }, [state?.image, state?.attrs?.caption]);
  useEffect(() => {
    editor?.setEditable(props.editable, false);
  }, [editor, props.editable]);
  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(props.document.content)) {
      // External changes include undo, AI insertion and sheet edits. Preserve the selection when possible.
      const selection = editor.state.selection;
      applyingExternal.current = true;
      editor.commands.setContent(props.document.content, { emitUpdate: false });
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection({
        from: Math.min(selection.from, max),
        to: Math.min(selection.to, max),
      });
      applyingExternal.current = false;
    }
    if (editor) requestNotebookReflow(editor.view);
  }, [editor, props.document]);
  // Style changes can alter every line without a document transaction.
  useEffect(() => {
    if (editor)
      editor.view.dom.style.cssText = Object.entries({
        'font-family': props.document.styles.fontFamily,
        'font-size': `${props.document.styles.fontSize}px`,
        'line-height': String(props.document.styles.lineHeight),
        color: `var(--notebook-paper-foreground, ${props.document.styles.color})`,
        '--notebook-spacing': `${props.document.styles.paragraphSpacing}px`,
      })
        .map(([key, value]) => `${key}:${value}`)
        .join(';');
    if (editor) requestNotebookReflow(editor.view);
  }, [editor, props.document.styles]);

  function moveBlock(direction: -1 | 1, target?: number) {
    if (!editor) return;
    const block = selectedBlock(editor);
    if (!block) return;
    const siblings: { node: typeof block.node; pos: number }[] = [];
    editor.state.doc.forEach((node, pos) => siblings.push({ node, pos }));
    const index = siblings.findIndex((item) => item.pos === (target ?? block.pos));
    const other = siblings[index + direction];
    const self = siblings[index];
    if (!self || !other) return;
    const from = Math.min(self.pos, other.pos);
    const to = Math.max(self.pos + self.node.nodeSize, other.pos + other.node.nodeSize);
    const tr = editor.state.tr.replaceWith(
      from,
      to,
      direction < 0 ? [self.node, other.node] : [other.node, self.node],
    );
    tr.setSelection(
      NodeSelection.create(tr.doc, direction < 0 ? from : from + other.node.nodeSize),
    );
    editor.view.dispatch(tr);
  }
  const blockStyle = (attribute: string, value: unknown) => {
    if (!editor) return;
    const block = selectedBlock(editor);
    if (!block) return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(block.pos, undefined, {
        ...block.node.attrs,
        [attribute]: value,
      }),
    );
  };
  const documentStyle = <K extends keyof NotebookStyles>(attribute: K, value: NotebookStyles[K]) =>
    props.onChange({ ...props.document, styles: { ...props.document.styles, [attribute]: value } });
  const insert = (type: string, range?: { from: number; to: number }) => {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (range) chain.deleteRange(range);
    switch (type) {
      case 'callout':
        chain.insertContent({ type: 'callout', content: [{ type: 'paragraph' }] }).run();
        break;
      case 'toggle':
        chain
          .insertContent({
            type: 'toggle',
            content: [
              { type: 'toggleTitle', content: [{ type: 'text', text: 'Toggle' }] },
              { type: 'toggleBody', content: [{ type: 'paragraph' }] },
            ],
          })
          .run();
        break;
      case 'columns2':
      case 'columns3':
        chain
          .insertContent({
            type: 'columns',
            content: Array.from({ length: type === 'columns2' ? 2 : 3 }, () => ({
              type: 'column',
              content: [{ type: 'paragraph' }],
            })),
          })
          .run();
        break;
      case 'contents':
        chain.insertContent({ type: 'contents' }).run();
        break;
      case 'paragraph':
        chain.setParagraph().run();
        break;
      case 'heading':
        chain.toggleHeading({ level: 2 }).run();
        break;
      case 'title':
        chain.toggleHeading({ level: 1 }).run();
        break;
      case 'subheading':
        chain.toggleHeading({ level: 3 }).run();
        break;
      case 'bulletList':
        chain.toggleBulletList().run();
        break;
      case 'orderedList':
        chain.toggleOrderedList().run();
        break;
      case 'taskList':
        chain.toggleTaskList().run();
        break;
      case 'blockquote':
        chain.toggleBlockquote().run();
        break;
      case 'codeBlock':
        chain.toggleCodeBlock().run();
        break;
      case 'horizontalRule':
        chain.setHorizontalRule().run();
        break;
      case 'table':
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        break;
      case 'blockMath':
        chain.insertBlockMath({ latex: formula || 'x^2' }).run();
        break;
      case 'image':
        {
          const capturedDocument = current.current.document;
          void props.onPickImage?.().then((file) => {
            if (file && !editor.isDestroyed && current.current.document === capturedDocument) {
              chain.run();
              insertImageFile(file);
            }
          });
        }
        break;
      case 'sheetBreak':
        chain.insertContent({ type: 'sheetBreak' }).run();
        break;
    }
  };
  const insertImageFile = (file: File) => {
    if (!editor) return;
    const capturedDocument = current.current.document;
    const reader = new FileReader();
    reader.onload = () => {
      if (
        editor.isDestroyed ||
        current.current.document !== capturedDocument ||
        typeof reader.result !== 'string'
      )
        return;
      const src = reader.result;
      const image = new window.Image();
      image.onload = () => {
        if (editor.isDestroyed || current.current.document !== capturedDocument) return;
        const assetId = crypto.randomUUID();
        const block: JSONContent = {
          type: 'image',
          attrs: {
            src,
            assetId,
            width: Math.min(image.width, PAPER.contentWidth),
            caption: file.name,
          },
        };
        const tr = editor.state.tr.replaceSelectionWith(editor.schema.nodeFromJSON(block));
        current.current.onChange({
          ...capturedDocument,
          content: identifyBlocks(tr.doc.toJSON()),
          assets: {
            ...capturedDocument.assets,
            [assetId]: { dataUrl: src, width: image.width, height: image.height },
          },
        });
      };
      image.src = src;
    };
    reader.readAsDataURL(file);
  };
  return (
    <>
      {props.controlsHost &&
        createPortal(
          <div className="notebook-editor-controls" aria-label="Notebook editing controls">
            <div className="notebook-control-row" role="toolbar" aria-label="Text formatting">
              <button type="button" disabled={!props.canUndo} onClick={props.undo}>
                Undo
              </button>
              <button type="button" disabled={!props.canRedo} onClick={props.redo}>
                Redo
              </button>
              <button
                type="button"
                aria-pressed={state?.bold}
                onClick={() => editor?.chain().focus().toggleBold().run()}
              >
                <b>B</b>
              </button>
              <button
                type="button"
                aria-pressed={state?.italic}
                onClick={() => editor?.chain().focus().toggleItalic().run()}
              >
                <i>I</i>
              </button>
              <button
                type="button"
                aria-pressed={state?.underline}
                onClick={() => editor?.chain().focus().toggleUnderline().run()}
              >
                <u>U</u>
              </button>
              <label>
                Text{' '}
                <input
                  type="color"
                  aria-label="Selection text color"
                  defaultValue="#222222"
                  onChange={(event) => editor?.chain().focus().setColor(event.target.value).run()}
                />
              </label>
              <label>
                Highlight{' '}
                <input
                  type="color"
                  aria-label="Selection background color"
                  defaultValue="#fff2a8"
                  onChange={(event) =>
                    editor?.chain().focus().setHighlight({ color: event.target.value }).run()
                  }
                />
              </label>
              <details>
                <summary>Link</summary>
                <label>
                  URL{' '}
                  <input
                    type="url"
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (/^(https?:|mailto:)/i.test(link))
                      editor?.chain().focus().extendMarkRange('link').setLink({ href: link }).run();
                  }}
                >
                  Apply link
                </button>
                <button type="button" onClick={() => editor?.chain().focus().unsetLink().run()}>
                  Remove link
                </button>
              </details>
              <details>
                <summary>Insert / convert</summary>
                <div
                  className="notebook-insert-menu"
                  role="menu"
                  aria-label="Insert block"
                  onKeyDown={(event) => {
                    const items = Array.from(
                      event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
                    );
                    const index = items.indexOf(event.target as HTMLButtonElement);
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault();
                      items[
                        (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
                      ]?.focus();
                    }
                    if (event.key === 'Escape') {
                      editor?.commands.focus();
                    }
                  }}
                >
                  {blockCommands
                    .filter((item) => !['pdf', 'snippet', 'notebook'].includes(item.type))
                    .map(({ type, label, icon: Icon }) => (
                      <button type="button" role="menuitem" key={type} onClick={() => insert(type)}>
                        <Icon size={16} aria-hidden="true" /> {label}
                      </button>
                    ))}
                </div>
              </details>
            </div>
            <details>
              <summary>Block appearance and actions</summary>
              <div className="notebook-control-row">
                <button type="button" onClick={() => moveBlock(-1)}>
                  Move up
                </button>
                <button type="button" onClick={() => moveBlock(1)}>
                  Move down
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const block = editor && selectedBlock(editor);
                    if (editor && block)
                      editor
                        .chain()
                        .focus()
                        .insertContentAt(
                          block.pos + block.node.nodeSize,
                          identifyBlocks({
                            ...block.node.toJSON(),
                            attrs: { ...block.node.attrs, id: null },
                          }),
                        )
                        .run();
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const block = editor && selectedBlock(editor);
                    if (editor && block)
                      editor
                        .chain()
                        .focus()
                        .deleteRange({ from: block.pos, to: block.pos + block.node.nodeSize })
                        .run();
                  }}
                >
                  Delete block
                </button>
                <label>
                  Align{' '}
                  <select
                    value={state?.attrs?.textAlign ?? 'left'}
                    onChange={(event) => blockStyle('textAlign', event.target.value)}
                  >
                    {['left', 'center', 'right', 'justify'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Font{' '}
                  <select
                    value={state?.attrs?.fontFamily ?? ''}
                    onChange={(event) => blockStyle('fontFamily', event.target.value || null)}
                  >
                    <option value="">Document default</option>
                    <option value="Arial, sans-serif">Sans</option>
                    <option value="Georgia, serif">Serif</option>
                    <option value="monospace">Mono</option>
                  </select>
                </label>
                <label>
                  Size{' '}
                  <input
                    type="number"
                    min="8"
                    max="72"
                    placeholder="Default"
                    value={state?.attrs?.fontSize ?? ''}
                    onChange={(event) =>
                      blockStyle(
                        'fontSize',
                        event.target.value
                          ? Math.max(8, Math.min(72, Number(event.target.value)))
                          : null,
                      )
                    }
                  />
                </label>
                <label>
                  Spacing{' '}
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Default"
                    value={state?.attrs?.spacing ?? ''}
                    onChange={(event) =>
                      blockStyle(
                        'spacing',
                        event.target.value
                          ? Math.max(0, Math.min(100, Number(event.target.value)))
                          : null,
                      )
                    }
                  />
                </label>
                <label>
                  Text{' '}
                  <input
                    type="color"
                    value={state?.attrs?.color ?? props.document.styles.color}
                    onChange={(event) => blockStyle('color', event.target.value)}
                  />
                </label>
                <label>
                  Background{' '}
                  <input
                    type="color"
                    value={state?.attrs?.background ?? props.document.styles.background}
                    onChange={(event) => blockStyle('background', event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const block = editor && selectedBlock(editor);
                    if (!editor || !block) return;
                    const attrs = { ...block.node.attrs };
                    [
                      'fontFamily',
                      'fontSize',
                      'spacing',
                      'lineHeight',
                      'color',
                      'background',
                      'textAlign',
                    ].forEach((attribute) => {
                      attrs[attribute] = null;
                    });
                    editor.view.dispatch(
                      editor.state.tr.setNodeMarkup(block.pos, undefined, attrs),
                    );
                  }}
                >
                  Use document defaults
                </button>
              </div>
              <div className="notebook-control-row">
                <label>
                  LaTeX{' '}
                  <input value={formula} onChange={(event) => setFormula(event.target.value)} />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (!editor) return;
                    if (editor.isActive('blockMath'))
                      editor.chain().focus().updateBlockMath({ latex: formula }).run();
                    else if (editor.isActive('inlineMath'))
                      editor.chain().focus().updateInlineMath({ latex: formula }).run();
                    else
                      editor
                        .chain()
                        .focus()
                        .insertInlineMath({ latex: formula || 'x' })
                        .run();
                  }}
                >
                  Apply formula
                </button>
                {state?.image && (
                  <>
                    <label>
                      Caption{' '}
                      <input value={caption} onChange={(event) => setCaption(event.target.value)} />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        editor
                          ?.chain()
                          .focus()
                          .updateAttributes('image', { caption, alt: caption, title: caption })
                          .run()
                      }
                    >
                      Apply caption
                    </button>
                    <label>
                      Image width{' '}
                      <input
                        type="range"
                        min="40"
                        max={PAPER.contentWidth}
                        value={editor?.getAttributes('image').width ?? 400}
                        onChange={(event) =>
                          editor
                            ?.chain()
                            .focus()
                            .updateAttributes('image', {
                              width: Number(event.target.value),
                              height: null,
                            })
                            .run()
                        }
                      />
                    </label>
                  </>
                )}
              </div>
            </details>
            {state?.table && (
              <details open>
                <summary>Table</summary>
                <div className="notebook-control-row">
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().addRowBefore().run()}
                  >
                    Row above
                  </button>
                  <button type="button" onClick={() => editor?.chain().focus().addRowAfter().run()}>
                    Row below
                  </button>
                  <button type="button" onClick={() => editor?.chain().focus().deleteRow().run()}>
                    Delete row
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().addColumnBefore().run()}
                  >
                    Column before
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().addColumnAfter().run()}
                  >
                    Column after
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().deleteColumn().run()}
                  >
                    Delete column
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().toggleHeaderRow().run()}
                  >
                    Toggle header
                  </button>
                  <label>
                    Border{' '}
                    <input
                      type="color"
                      defaultValue="#cccccc"
                      onChange={(event) =>
                        editor
                          ?.chain()
                          .focus()
                          .updateAttributes('table', { borderColor: event.target.value })
                          .run()
                      }
                    />
                  </label>
                  <label>
                    Border width{' '}
                    <input
                      type="number"
                      min="0"
                      max="4"
                      defaultValue="1"
                      onChange={(event) =>
                        editor
                          ?.chain()
                          .focus()
                          .updateAttributes('table', {
                            borderWidth: Math.max(0, Math.min(4, Number(event.target.value))),
                          })
                          .run()
                      }
                    />
                  </label>
                  <label>
                    Header{' '}
                    <input
                      type="color"
                      defaultValue="#eeeeee"
                      onChange={(event) =>
                        editor
                          ?.chain()
                          .focus()
                          .updateAttributes('table', { headerColor: event.target.value })
                          .run()
                      }
                    />
                  </label>
                </div>
              </details>
            )}
            <details>
              <summary>Document appearance</summary>
              <div className="notebook-control-row">
                <label>
                  Font{' '}
                  <select
                    value={props.document.styles.fontFamily}
                    onChange={(event) => documentStyle('fontFamily', event.target.value)}
                  >
                    <option value="Arial, sans-serif">Sans</option>
                    <option value="Georgia, serif">Serif</option>
                    <option value="monospace">Mono</option>
                  </select>
                </label>
                <label>
                  Size{' '}
                  <input
                    type="number"
                    min="8"
                    max="32"
                    value={props.document.styles.fontSize}
                    onChange={(event) =>
                      documentStyle(
                        'fontSize',
                        Math.max(8, Math.min(32, Number(event.target.value))),
                      )
                    }
                  />
                </label>
                <label>
                  Line spacing{' '}
                  <input
                    type="number"
                    min="1"
                    max="3"
                    step="0.1"
                    value={props.document.styles.lineHeight}
                    onChange={(event) =>
                      documentStyle(
                        'lineHeight',
                        Math.max(1, Math.min(3, Number(event.target.value))),
                      )
                    }
                  />
                </label>
                <label>
                  Paragraph spacing{' '}
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={props.document.styles.paragraphSpacing}
                    onChange={(event) =>
                      documentStyle(
                        'paragraphSpacing',
                        Math.max(0, Math.min(60, Number(event.target.value))),
                      )
                    }
                  />
                </label>
                <label>
                  Text{' '}
                  <input
                    type="color"
                    value={props.document.styles.color}
                    onChange={(event) => documentStyle('color', event.target.value)}
                  />
                </label>
                <label>
                  Paper{' '}
                  <input
                    type="color"
                    value={props.document.styles.background}
                    onChange={(event) => documentStyle('background', event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    props.onChange({ ...props.document, styles: { ...neutralStyles } })
                  }
                >
                  Reset to neutral
                </button>
              </div>
            </details>
          </div>,
          props.controlsHost,
        )}
      <div
        className="notebook-editor-position"
        style={{
          width: PAPER.contentWidth,
          minHeight: PAPER.contentHeight,
          left: PAPER.left * props.zoom,
          top: PAPER.top * props.zoom,
          transform: `scale(${props.zoom})`,
          pointerEvents: props.editable ? 'auto' : 'none',
        }}
      >
        <EditorContent editor={editor} className="notebook-editor-content" />
      </div>
      <BlockCommands editor={editor} onInsert={insert} loadChoices={props.loadBlockChoices} />
    </>
  );
}
