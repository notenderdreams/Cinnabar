import { verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ClientRect } from '@dnd-kit/core';
import { Extension } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as DocumentNode } from '@tiptap/pm/model';
import { chooseDropSlot, type BlockDropCandidate } from './blockDragGeometry';

interface DragSession {
  selection: NodeSelection;
  document: DocumentNode;
  x: number;
  y: number;
  pointerId: number;
  startY: number;
  active: boolean;
  rows: { pos: number; node: DocumentNode; rect: ClientRect }[];
  activeIndex: number;
  startX: number;
  scrollTop: number;
  destination: number | null;
}
const sortingKey = new PluginKey<DecorationSet>('notebookSortingPreview');

/**
 * Pointer sorting moves the actual blocks, without a native drag image or floating copy.
 */
export const BlockDragging = Extension.create<{
  renderHandle: () => HTMLButtonElement;
}>({
  name: 'notebookBlockDragging',
  priority: 1100,
  addOptions: () => ({
    renderHandle: () => document.createElement('button'),
  }),
  addProseMirrorPlugins() {
    const renderHandle = this.options.renderHandle;
    return [
      new Plugin({
        key: sortingKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, previous) => {
            const positions: unknown = tr.getMeta(sortingKey);
            return positions instanceof DecorationSet
              ? positions
              : previous.map(tr.mapping, tr.doc);
          },
        },
        props: { decorations: (state) => sortingKey.getState(state) },
        view(view) {
          let session: DragSession | null = null;
          let frame = 0;
          const root = view.dom.ownerDocument;
          let settleFrame = 0;
          const animations = new Set<Animation>();
          const stopAnimations = () => {
            cancelAnimationFrame(settleFrame);
            settleFrame = 0;
            animations.forEach((animation) => animation.cancel());
            animations.clear();
          };
          const capturePositions = () => {
            const positions = new Map<string, DOMRect>();
            for (const element of view.dom.querySelectorAll<HTMLElement>('[data-id]')) {
              const id = element.getAttribute('data-id');
              const rect = element.getBoundingClientRect();
              if (id && rect.bottom >= 0 && rect.top <= window.innerHeight) positions.set(id, rect);
            }
            return positions;
          };
          const settle = (before: Map<string, DOMRect>) => {
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            settleFrame = requestAnimationFrame(() => {
              settleFrame = 0;
              const scale =
                view.dom.getBoundingClientRect().width /
                parseFloat(getComputedStyle(view.dom).width);
              for (const element of view.dom.querySelectorAll<HTMLElement>('[data-id]')) {
                const old = before.get(element.getAttribute('data-id') ?? '');
                if (!old) continue;
                const rect = element.getBoundingClientRect();
                const dx = (old.left - rect.left) / scale;
                const dy = (old.top - rect.top) / scale;
                if (Math.abs(dx) + Math.abs(dy) < 1) continue;
                // Animate the outermost moved block so nested text is not translated twice.
                let ancestor = element.parentElement;
                let movingAncestor = false;
                while (ancestor && ancestor !== view.dom) {
                  if (ancestor.getAnimations().length) {
                    movingAncestor = true;
                    break;
                  }
                  ancestor = ancestor.parentElement;
                }
                if (movingAncestor) continue;
                const animation = element.animate(
                  [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
                  { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' },
                );
                animations.add(animation);
                void animation.finished.then(
                  () => animations.delete(animation),
                  () => animations.delete(animation),
                );
              }
            });
          };
          const handle = renderHandle();
          handle.draggable = false;
          handle.hidden = true;
          handle.classList.add('notebook-block-handle-overlay');
          root.body.append(handle);
          let hovered: { pos: number; dom: HTMLElement } | null = null;
          const positionHandle = () => {
            if (session?.active) {
              handle.style.top = `${session.y - 11}px`;
              return;
            }
            if (!hovered || !hovered.dom.isConnected) {
              handle.hidden = true;
              return;
            }
            const rect = hovered.dom.getBoundingClientRect();
            let top = rect.top;
            const textElement = hovered.dom.matches('p,h1,h2,h3,summary')
              ? hovered.dom
              : hovered.dom.querySelector('p,h1,h2,h3,summary');
            if (textElement) {
              const range = root.createRange();
              range.selectNodeContents(textElement);
              const line = Array.from(range.getClientRects()).find((box) => box.height > 0);
              if (line) top = line.top + line.height / 2 - 11;
            }
            handle.hidden = false;
            Object.assign(handle.style, {
              left: `${view.dom.getBoundingClientRect().left - 26}px`,
              top: `${top}px`,
            });
          };
          const hover = (event: MouseEvent) => {
            if (
              session ||
              (event.target instanceof globalThis.Node && handle.contains(event.target))
            )
              return;
            if (!view.editable) {
              handle.hidden = true;
              return;
            }
            const bounds = view.dom.getBoundingClientRect();
            if (event.clientX < bounds.left - 40 || event.clientX > bounds.right + 16) {
              handle.hidden = true;
              return;
            }
            if (hovered) {
              const rect = hovered.dom.getBoundingClientRect();
              if (
                event.clientX < rect.left &&
                event.clientY >= rect.top - 5 &&
                event.clientY <= rect.bottom + 5
              ) {
                positionHandle();
                return;
              }
            }
            let element =
              event.target instanceof Element && view.dom.contains(event.target)
                ? event.target.closest<HTMLElement>('[data-id]')
                : null;
            const item = element?.closest<HTMLElement>('li[data-checked]');
            if (item) element = item;
            if (!element && event.clientX < bounds.left) {
              view.state.doc.forEach((_node, pos) => {
                const dom = view.nodeDOM(pos);
                if (!(dom instanceof HTMLElement)) return;
                const rect = dom.getBoundingClientRect();
                if (event.clientY >= rect.top && event.clientY <= rect.bottom) element = dom;
              });
            }
            if (!element) {
              handle.hidden = true;
              return;
            }
            const id = element.getAttribute('data-id');
            let position: number | null = null;
            const match = (node: DocumentNode, pos: number) => {
              if (
                node.attrs.id === id &&
                id &&
                node.isBlock &&
                ![
                  'column',
                  'toggleTitle',
                  'toggleBody',
                  'tableCell',
                  'tableRow',
                  'tableHeader',
                ].includes(node.type.name)
              )
                position = pos;
            };
            const domPosition = view.posAtDOM(element, 0);
            const resolved = view.state.doc.resolve(domPosition);
            const direct = view.state.doc.nodeAt(domPosition);
            if (direct) match(direct, domPosition);
            for (let depth = resolved.depth; position === null && depth > 0; depth--)
              match(resolved.node(depth), resolved.before(depth));
            if (position === null) {
              handle.hidden = true;
              return;
            }
            const dom = view.nodeDOM(position);
            if (!(dom instanceof HTMLElement)) return;
            hovered = { pos: position, dom };
            positionHandle();
          };
          const clean = (removeDecorations = true) => {
            session = null;
            if (removeDecorations)
              view.dispatch(
                view.state.tr
                  .setMeta(sortingKey, DecorationSet.empty)
                  .setMeta('addToHistory', false),
              );
            cancelAnimationFrame(frame);
            frame = 0;
            view.dom.removeAttribute('data-block-dragging');
            view.dragging = null;
            positionHandle();
          };
          const scrollParent = () => {
            let element = view.dom.parentElement;
            while (element && !/(auto|scroll)/.test(getComputedStyle(element).overflowY))
              element = element.parentElement;
            return element;
          };
          const scopeAtPointer = (drag: DragSession) => {
            let parent = drag.selection.$from.parent;
            let start = drag.selection.$from.start();
            // Explicit horizontal movement into a column opts into that column. Gutter movement
            // always sorts siblings, without requiring the pointer to enter the text area.
            for (const element of view.dom.querySelectorAll<HTMLElement>(
              '[data-notebook-column]',
            )) {
              const rect = element.getBoundingClientRect();
              if (
                drag.x < rect.left ||
                drag.x > rect.right ||
                drag.y < rect.top ||
                drag.y > rect.bottom
              )
                continue;
              const pos = view.posAtDOM(element, 0);
              if (pos > drag.selection.from && pos < drag.selection.to) continue;
              const resolved = view.state.doc.resolve(pos);
              if (
                resolved.parent.type.name === 'column' &&
                resolved.parent.canReplaceWith(0, 0, drag.selection.node.type)
              ) {
                parent = resolved.parent;
                start = resolved.start();
                break;
              }
            }
            return { parent, start };
          };
          const candidates = (drag: DragSession) => {
            const { parent, start } = scopeAtPointer(drag);
            const result: BlockDropCandidate[] = [];
            parent.forEach((node, offset, index) => {
              const from = start + offset;
              const to = from + node.nodeSize;
              if (from >= drag.selection.from && to <= drag.selection.to) return;
              const dom = view.nodeDOM(from);
              if (!(dom instanceof HTMLElement)) return;
              const rect = dom.getBoundingClientRect();
              if (!rect.height) return;
              result.push({
                from,
                to,
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width,
                before: parent.canReplaceWith(index, index, drag.selection.node.type),
                after: parent.canReplaceWith(index + 1, index + 1, drag.selection.node.type),
              });
            });
            return result;
          };
          let visualPositions: Decoration[] = [];
          const translate = (
            row: DragSession['rows'][number],
            x: number,
            y: number,
            active = false,
          ) => {
            visualPositions.push(
              Decoration.node(row.pos, row.pos + row.node.nodeSize, {
                class: active ? 'notebook-sort-active' : 'notebook-sort-neighbor',
                style: `translate: ${x}px ${y}px;`,
              }),
            );
          };
          const updateTarget = () => {
            const drag = session;
            if (!drag?.active) return;
            const scale =
              view.dom.getBoundingClientRect().width / parseFloat(getComputedStyle(view.dom).width);
            const scrollDelta = (scrollParent()?.scrollTop ?? 0) - drag.scrollTop;
            const deltaY = drag.y - drag.startY + scrollDelta;
            const active = drag.rows[drag.activeIndex];
            if (!active) return;
            visualPositions = [];
            const scope = scopeAtPointer(drag);
            drag.destination = null;
            if (scope.parent === drag.selection.$from.parent) {
              const center = (active.rect.top + active.rect.bottom) / 2 + deltaY;
              let overIndex = drag.activeIndex;
              let distance = Infinity;
              drag.rows.forEach((row, index) => {
                const next = Math.abs((row.rect.top + row.rect.bottom) / 2 - center);
                if (next < distance) {
                  distance = next;
                  overIndex = index;
                }
              });
              const over = drag.rows[overIndex];
              if (overIndex !== drag.activeIndex && over)
                drag.destination =
                  overIndex > drag.activeIndex ? over.pos + over.node.nodeSize : over.pos;
              const rects = drag.rows.map((item) => item.rect);
              drag.rows.forEach((row, index) => {
                if (index === drag.activeIndex) return;
                const offset = verticalListSortingStrategy({
                  activeIndex: drag.activeIndex,
                  activeNodeRect: active.rect,
                  overIndex,
                  index,
                  rects,
                });
                translate(row, 0, (offset?.y ?? 0) / scale);
              });
            } else {
              drag.rows.forEach((row, index) => {
                if (index !== drag.activeIndex) translate(row, 0, 0);
              });
              const slot = chooseDropSlot(
                candidates(drag),
                drag.y,
                drag.selection.from,
                drag.selection.to,
              );
              drag.destination = slot?.pos ?? null;
            }
            // Only the existing DOM block moves. It keeps its original size and stacking order.
            translate(active, (drag.x - drag.startX) / scale, deltaY / scale, true);
            view.dispatch(
              view.state.tr
                .setMeta(sortingKey, DecorationSet.create(view.state.doc, visualPositions))
                .setMeta('addToHistory', false),
            );
          };
          let lastFrame = 0;
          const tick = (time: number) => {
            frame = 0;
            if (!session?.active) return;
            const elapsed = Math.min(32, time - lastFrame || 16);
            lastFrame = time;
            const viewport = scrollParent();
            if (viewport) {
              const rect = viewport.getBoundingClientRect();
              const distance =
                session.y < rect.top + 48
                  ? session.y - rect.top - 48
                  : session.y > rect.bottom - 48
                    ? session.y - rect.bottom + 48
                    : 0;
              if (distance)
                viewport.scrollTop +=
                  (Math.max(-600, Math.min(600, distance * 12)) * elapsed) / 1000;
            }
            updateTarget();
            positionHandle();
            frame = requestAnimationFrame(tick);
          };
          const start = (event: PointerEvent) => {
            if (!hovered || event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            stopAnimations();
            const selection = NodeSelection.create(view.state.doc, hovered.pos);
            view.dispatch(view.state.tr.setSelection(selection));
            session = {
              selection,
              document: view.state.doc,
              x: event.clientX,
              y: event.clientY,
              pointerId: event.pointerId,
              startY: event.clientY,
              active: false,
              rows: [],
              activeIndex: -1,
              startX: event.clientX,
              scrollTop: scrollParent()?.scrollTop ?? 0,
              destination: null,
            };
            selection.$from.parent.forEach((node, offset) => {
              const pos = selection.$from.start() + offset;
              const dom = view.nodeDOM(pos);
              if (dom instanceof HTMLElement)
                session?.rows.push({ pos, node, rect: dom.getBoundingClientRect() });
            });
            session.activeIndex = session.rows.findIndex((row) => row.pos === selection.from);
            handle.setPointerCapture(event.pointerId);
          };
          const over = (event: PointerEvent) => {
            if (!session || event.pointerId !== session.pointerId) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            session.x = event.clientX;
            session.y = event.clientY;
            if (!session.active && Math.abs(session.y - session.startY) >= 4) {
              session.active = true;
              view.dom.setAttribute('data-block-dragging', '');
              lastFrame = performance.now();
            }
            if (session.active && !frame) frame = requestAnimationFrame(tick);
          };
          const drop = (event: PointerEvent) => {
            const drag = session;
            if (!drag || event.pointerId !== drag.pointerId) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            drag.x = event.clientX;
            drag.y = event.clientY;
            updateTarget();
            const positions = capturePositions();
            const destination = drag.destination;
            clean();
            if (destination !== null && view.state.doc.eq(drag.document)) {
              const target = view.state.doc.resolve(destination);
              const tr = view.state.tr;
              let selectedPos: number;
              if (
                target.parent === drag.selection.$from.parent &&
                target.start() === drag.selection.$from.start()
              ) {
                const children: DocumentNode[] = [];
                target.parent.forEach((node) => children.push(node));
                const fromIndex = drag.selection.$from.index();
                const toIndex = target.index() - (target.index() > fromIndex ? 1 : 0);
                children.splice(fromIndex, 1);
                children.splice(toIndex, 0, drag.selection.node);
                selectedPos =
                  target.start() +
                  children.slice(0, toIndex).reduce((sum, node) => sum + node.nodeSize, 0);
                tr.replaceWith(target.start(), target.end(), children);
              } else {
                tr.delete(drag.selection.from, drag.selection.to);
                selectedPos = tr.mapping.map(destination);
                tr.insert(selectedPos, drag.selection.node);
              }
              tr.setSelection(NodeSelection.create(tr.doc, selectedPos));
              view.dispatch(tr);
            }
            settle(positions);
            view.focus();
          };
          const cancel = () => {
            if (!session) return;
            const positions = capturePositions();
            clean();
            settle(positions);
            view.focus();
          };
          const key = (event: KeyboardEvent) => {
            if (!session || event.key !== 'Escape') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            cancel();
          };
          handle.addEventListener('pointerdown', start);
          handle.ondragstart = (event) => event.preventDefault();
          handle.addEventListener('click', () => {
            if (!hovered || session) return;
            view.dispatch(
              view.state.tr.setSelection(NodeSelection.create(view.state.doc, hovered.pos)),
            );
            view.focus();
          });
          root.addEventListener('mousemove', hover);
          root.addEventListener('scroll', positionHandle, true);
          window.addEventListener('resize', positionHandle);
          root.addEventListener('pointermove', over, { capture: true, passive: false });
          root.addEventListener('pointerup', drop, true);
          root.addEventListener('pointercancel', cancel, true);
          root.addEventListener('keydown', key, true);
          window.addEventListener('blur', cancel);
          return {
            update(updatedView: EditorView) {
              if (session && !updatedView.state.doc.eq(session.document)) clean();
              if (!session && hovered && !hovered.dom.isConnected) {
                hovered = null;
                handle.hidden = true;
              }
            },
            destroy() {
              stopAnimations();
              clean(false);
              handle.remove();
              root.removeEventListener('mousemove', hover);
              root.removeEventListener('scroll', positionHandle, true);
              window.removeEventListener('resize', positionHandle);
              root.removeEventListener('pointermove', over, true);
              root.removeEventListener('pointerup', drop, true);
              root.removeEventListener('pointercancel', cancel, true);
              root.removeEventListener('keydown', key, true);
              window.removeEventListener('blur', cancel);
            },
          };
        },
      }),
    ];
  },
});
