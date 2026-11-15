import { Node, mergeAttributes, getRenderedAttributes } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { requestNotebookReflow } from './layout';

function widths(node: PMNode): number[] {
  const saved: unknown = node.attrs.widths;
  if (
    Array.isArray(saved) &&
    saved.length === node.childCount &&
    saved.every((n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0)
  ) {
    const total = saved.reduce((sum: number, n: number) => sum + n, 0);
    return saved.map((n: number) => n / total);
  }
  return Array.from({ length: node.childCount }, () => 1 / node.childCount);
}

export const SplitBlock = Node.create({
  name: 'split',
  group: 'block',
  content: 'column{2,}',
  defining: true,
  isolating: true,
  addAttributes: () => ({
    widths: {
      default: [],
      parseHTML: (el) => {
        try {
          return JSON.parse(el.getAttribute('data-split-widths') ?? '[]') as unknown;
        } catch {
          return [];
        }
      },
      renderHTML: () => ({}),
    },
  }),
  parseHTML: () => [{ tag: 'div[data-notebook-split]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, {
      'data-notebook-split': '',
      'data-split-widths': JSON.stringify(widths(node)),
    }),
    [
      'div',
      {
        'data-notebook-split-content': '',
        style: `grid-template-columns:${widths(node)
          .map((n) => `minmax(0, ${n}fr)`)
          .join(' ')}`,
      },
      0,
    ],
  ],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.dataset.notebookSplit = '';
      const contentDOM = document.createElement('div');
      contentDOM.dataset.notebookSplitContent = '';
      const controls = document.createElement('div');
      controls.className = 'notebook-split-controls';
      controls.contentEditable = 'false';
      dom.append(contentDOM, controls);
      let current = node;
      let values = widths(node);
      let drag: {
        pointer: number;
        x: number;
        width: number;
        index: number;
        start: number[];
        handle: HTMLElement;
        moved: boolean;
      } | null = null;
      let count = -1;
      let renderedKeys: string[] = [];
      let keyResize: { start: number[]; index: number } | null = null;
      const display = () => {
        contentDOM.style.gridTemplateColumns = values.map((n) => `minmax(0, ${n}fr)`).join(' ');
        let left = 0;
        controls.querySelectorAll<HTMLElement>('[role="separator"]').forEach((handle, index) => {
          left += values[index];
          handle.style.left = `${left * 100}%`;
          handle.setAttribute(
            'aria-valuenow',
            String(Math.round((values[index] / (values[index] + values[index + 1])) * 100)),
          );
        });
      };
      const commit = () => {
        const pos = getPos();
        if (pos === undefined || !editor.isEditable || editor.isDestroyed) return;
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, widths: values }),
        );
        requestNotebookReflow(editor.view);
      };
      const adjust = (start: number[], index: number, delta: number) => {
        const pair = start[index] + start[index + 1];
        const min = Math.min(0.08, pair / 4);
        const left = Math.max(min, Math.min(pair - min, start[index] + delta));
        if (left === start[index]) return;
        values = [...start];
        values[index] = left;
        values[index + 1] = pair - left;
        if (drag) drag.moved = true;
        display();
      };
      const cancel = () => {
        const active = drag;
        drag = null;
        if (keyResize) {
          values = keyResize.start;
          keyResize = null;
          display();
          delete dom.dataset.resizing;
        }
        if (!active) return;
        values = active.start;
        display();
        delete dom.dataset.resizing;
        if (active.handle.hasPointerCapture(active.pointer))
          active.handle.releasePointerCapture(active.pointer);
        requestNotebookReflow(editor.view);
      };
      const sync = () => {
        const attrs = getRenderedAttributes(current, editor.extensionManager.attributes);
        for (const key of renderedKeys) if (!(key in attrs)) dom.removeAttribute(key);
        for (const [key, value] of Object.entries(attrs)) dom.setAttribute(key, String(value));
        renderedKeys = Object.keys(attrs);
        controls.hidden = !editor.isEditable;
        if (count !== current.childCount) {
          count = current.childCount;
          controls.replaceChildren();
          for (let index = 0; index < count - 1; index++) {
            const handle = document.createElement('div');
            handle.className = 'notebook-split-handle';
            handle.tabIndex = 0;
            handle.setAttribute('role', 'separator');
            handle.setAttribute('aria-orientation', 'vertical');
            handle.setAttribute('aria-label', `Resize split panes ${index + 1} and ${index + 2}`);
            handle.setAttribute('aria-valuemin', '0');
            handle.setAttribute('aria-valuemax', '100');
            handle.onpointerdown = (event) => {
              if (event.button !== 0 || !editor.isEditable) return;
              event.preventDefault();
              event.stopPropagation();
              handle.focus({ preventScroll: true });
              drag = {
                pointer: event.pointerId,
                x: event.clientX,
                width: contentDOM.getBoundingClientRect().width,
                index,
                start: [...values],
                handle,
                moved: false,
              };
              dom.dataset.resizing = 'true';
              handle.setPointerCapture(event.pointerId);
            };
            handle.onpointermove = (event) => {
              if (!drag || drag.pointer !== event.pointerId || drag.width <= 0) return;
              adjust(drag.start, drag.index, (event.clientX - drag.x) / drag.width);
            };
            handle.onpointerup = (event) => {
              if (!drag || drag.pointer !== event.pointerId) return;
              const { moved } = drag;
              drag = null;
              delete dom.dataset.resizing;
              handle.releasePointerCapture(event.pointerId);
              // A plain click on the divider should not create an undo entry.
              if (moved) commit();
            };
            handle.onpointercancel = cancel;
            handle.onlostpointercapture = cancel;
            handle.onkeydown = (event) => {
              if (event.key === 'Escape' && (drag || keyResize)) {
                event.preventDefault();
                event.stopPropagation();
                cancel();
                return;
              }
              if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
              event.preventDefault();
              event.stopPropagation();
              if (!event.repeat) {
                // Keep repeated key presses out of history; commit once on release.
                keyResize = { start: [...values], index };
                dom.dataset.resizing = 'true';
              }
              const delta =
                event.key === 'Home'
                  ? (values[index + 1] - values[index]) / 2
                  : event.key === 'ArrowLeft'
                    ? -0.025
                    : 0.025;
              adjust(values, index, delta);
            };
            handle.onkeyup = (event) => {
              if (!keyResize || !['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
              const moved = !values.every((value, i) => value === keyResize!.start[i]);
              keyResize = null;
              delete dom.dataset.resizing;
              if (moved) commit();
            };
            handle.onblur = () => {
              if (!keyResize) return;
              keyResize = null;
              delete dom.dataset.resizing;
              commit();
            };
            controls.append(handle);
          }
        }
        display();
      };
      sync();
      return {
        dom,
        contentDOM,
        update(next) {
          if (next.type !== current.type) return false;
          if ((drag || keyResize) && !next.eq(current)) cancel();
          current = next;
          if (!drag && !keyResize) values = widths(next);
          sync();
          return true;
        },
        stopEvent: (event) =>
          event.target instanceof globalThis.Node && controls.contains(event.target),
        ignoreMutation: (mutation) =>
          mutation.type !== 'selection' &&
          (controls.contains(mutation.target) ||
            (mutation.type === 'attributes' &&
              (mutation.target === dom || mutation.target === contentDOM))),
        destroy: cancel,
      };
    };
  },
});
