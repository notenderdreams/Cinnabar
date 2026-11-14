import { Extension, Node, mergeAttributes, isValidCSSStyleValue } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import Mathematics from '@tiptap/extension-mathematics';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TextStyle, TextStyleKit } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import UniqueID from '@tiptap/extension-unique-id';
import { BLOCK_TYPES } from './document';
import { notebookWidgets } from './widgets';

// Keep original colors in the document; CSS adapts only their on-screen appearance.
function themeColors(ink: unknown, fill: unknown) {
  const attributes: Record<string, string> = {};
  const declarations: string[] = [];
  for (const [role, value] of [
    ['ink', ink],
    ['fill', fill],
  ] as const) {
    if (typeof value !== 'string' || !isValidCSSStyleValue(value)) continue;
    attributes[`data-notebook-${role}`] = '';
    declarations.push(`--notebook-saved-${role}: ${value}`);
  }
  if (declarations.length) attributes.style = declarations.join(';');
  return attributes;
}

function themeTableColor(attribute: string, value: unknown) {
  if (
    !['headerColor', 'borderColor'].includes(attribute) ||
    typeof value !== 'string' ||
    !isValidCSSStyleValue(value)
  )
    return {};
  const role = attribute === 'headerColor' ? 'header' : 'border';
  return { [`data-notebook-${role}`]: '', style: `--notebook-saved-${role}: ${value}` };
}

const ThemeTextStyle = TextStyle.extend({
  renderHTML({ mark, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, themeColors(mark.attrs.color, mark.attrs.backgroundColor)),
      0,
    ];
  },
});
const ThemeHighlight = Highlight.extend({
  renderHTML({ mark, HTMLAttributes }) {
    return [
      'mark',
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        themeColors(null, mark.attrs.color),
      ),
      0,
    ];
  },
});

const SheetBreak = Node.create({
  name: 'sheetBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-sheet-break]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-sheet-break': '', 'aria-label': 'Page break' }),
  ],
});
const BlockAppearance = Extension.create({
  name: 'blockAppearance',
  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: Object.fromEntries(
          [
            ['fontFamily', 'font-family', ''],
            ['fontSize', 'font-size', 'px'],
            ['spacing', 'margin-bottom', 'px'],
            ['lineHeight', 'line-height', ''],
            ['color', 'color', ''],
            ['background', 'background-color', ''],
            ['borderColor', '--notebook-table-border', ''],
            ['headerColor', '--notebook-table-header', ''],
            ['borderWidth', '--notebook-table-width', 'px'],
          ].map(([attribute, property, unit]) => [
            attribute,
            {
              default: null,
              parseHTML: (element: HTMLElement) =>
                element.style.getPropertyValue(property).replace(unit ? /px$/ : /$^/, '') || null,
              renderHTML: (attrs: Record<string, unknown>) =>
                attrs[attribute] === null || attrs[attribute] === undefined
                  ? {}
                  : mergeAttributes(
                      { style: `${property}: ${attrs[attribute]}${unit}` },
                      themeColors(
                        attribute === 'color' ? attrs[attribute] : null,
                        attribute === 'background' ? attrs[attribute] : null,
                      ),
                      themeTableColor(attribute, attrs[attribute]),
                    ),
            },
          ]),
        ),
      },
    ];
  },
});

// Captions are stored with the image node and shared by live views and exports.
const CaptionImage = Image.extend({
  parseHTML() {
    return [{ tag: 'img[src^="data:image/"]' }];
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-caption') ?? '',
        renderHTML: (attrs) => ({ 'data-caption': attrs.caption }),
      },
      assetId: { default: null },
    };
  },
  addNodeView() {
    const parent = this.parent?.();
    return (props) => {
      const inner = parent?.(props);
      const figure = document.createElement('figure');
      figure.className = 'notebook-figure';
      const caption = document.createElement('figcaption');
      const image = document.createElement('img');
      figure.append(inner?.dom ?? image, caption);
      const sync = (node: typeof props.node) => {
        caption.textContent = node.attrs.caption ?? '';
        caption.hidden = !caption.textContent;
        if (!inner) {
          image.src = node.attrs.src;
          image.alt = node.attrs.alt ?? '';
          image.style.width = node.attrs.width ? `${node.attrs.width}px` : '';
          image.style.height = node.attrs.height ? `${node.attrs.height}px` : '';
        }
      };
      sync(props.node);
      return {
        dom: figure,
        update: (node, decorations, innerDecorations) => {
          if (
            node.type !== props.node.type ||
            (inner?.update && !inner.update(node, decorations, innerDecorations))
          )
            return false;
          sync(node);
          return true;
        },
        selectNode: () => {
          figure.classList.add('ProseMirror-selectednode');
          inner?.selectNode?.();
        },
        deselectNode: () => {
          figure.classList.remove('ProseMirror-selectednode');
          inner?.deselectNode?.();
        },
        stopEvent: (event) => inner?.stopEvent?.(event) ?? false,
        ignoreMutation: (mutation) => inner?.ignoreMutation?.(mutation) ?? true,
        destroy: () => inner?.destroy?.(),
      };
    };
  },
});

export function notebookExtensions(editable = true) {
  return [
    StarterKit.configure({ undoRedo: false, link: { openOnClick: false } }),
    TableKit.configure({ table: { resizable: editable, lastColumnResizable: true } }),
    CaptionImage.configure({
      allowBase64: true,
      resize: editable
        ? {
            enabled: true,
            directions: ['bottom-right'],
            alwaysPreserveAspectRatio: true,
            minWidth: 40,
            minHeight: 20,
          }
        : false,
    }),
    Mathematics.configure({ katexOptions: { throwOnError: false, strict: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TextStyleKit.configure({ textStyle: false }),
    ThemeTextStyle,
    ThemeHighlight.configure({ multicolor: true }),
    TextAlign.configure({ types: BLOCK_TYPES }),
    UniqueID.configure({ types: BLOCK_TYPES, updateDocument: editable }),
    BlockAppearance,
    SheetBreak,
    ...notebookWidgets,
  ];
}
