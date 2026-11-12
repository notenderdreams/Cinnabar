import { Extension } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export const PAPER = { width: 595, height: 842, left: 47.6, top: 67.36, contentWidth: 499.8, contentHeight: 707.28, gap: 24 };
export interface NotebookPage { from: number; to: number; ranges?: { from: number; to: number }[] }
export interface NotebookLayout { pages: NotebookPage[]; height: number }
interface Break { pos: number; height: number; header?: HTMLTableRowElement; row?: boolean; columns?: number; cellHeader?: HTMLTableCellElement;
  tailHeaders?: { cell: HTMLTableCellElement; top: number }[] }
interface Unit { from: number; to: number; top: number; bottom: number; force?: boolean; row?: HTMLTableRowElement;
  cells?: { lines: Unit[]; end: number; bottom: number }[] }
const key = new PluginKey<DecorationSet>('notebookPaperLayout');
const requests = new WeakMap<EditorView, () => void>();
export const requestNotebookReflow = (view: EditorView) => requests.get(view)?.();

/** Layout is visual only: widgets never enter the editor JSON or undo history. */
export const PaperLayout = Extension.create<{ onLayout: (layout: NotebookLayout) => void }>({
  name: 'paperLayout',
  addOptions: () => ({ onLayout: () => {} }),
  addProseMirrorPlugins() {
    const onLayout = this.options.onLayout;
    return [new Plugin({ key,
      state: { init: () => DecorationSet.empty, apply: (tr, previous) => tr.getMeta(key) ?? previous.map(tr.mapping, tr.doc) },
      props: { decorations: (state) => key.getState(state) },
      view(view) {
        let frame = 0; let destroyed = false; let measuring = false; let signature: string | null = null;
        let lastEditable = view.editable;
        const schedule = () => { if (!frame && !destroyed) frame = requestAnimationFrame(measure); };
        requests.set(view, () => { signature = null; schedule(); });
        const measure = () => {
          frame = 0;
          if (destroyed || view.composing || !view.dom.isConnected) { if (!destroyed) schedule(); return; }
          measuring = true;
          // Formula scaling is presentation only and is repeated by the export renderer.
          view.dom.querySelectorAll<HTMLElement>('.tiptap-mathematics-render').forEach((formula) => {
            formula.style.removeProperty('font-size');
            const scale = view.dom.getBoundingClientRect().width / PAPER.contentWidth || 1;
            const bounds = formula.querySelector('.katex')?.getBoundingClientRect();
            if (!bounds) return;
            const ratio = Math.min(1, PAPER.contentWidth * scale / bounds.width, PAPER.contentHeight * scale / bounds.height);
            if (ratio < 1) formula.style.fontSize = `${parseFloat(getComputedStyle(formula).fontSize) * ratio}px`;
          });
          const widgets = view.dom.querySelectorAll<HTMLElement>('[data-paper-gap]');
          widgets.forEach((element) => { element.style.display = 'none'; });
          const { breaks, layout } = measureNotebook(view);
          widgets.forEach((element) => { element.style.removeProperty('display'); });
          const nextSignature = breaks.map((item) => `${item.pos}:${item.height.toFixed(2)}:${item.header?.textContent}`).join('|');
          if (signature !== nextSignature) {
            signature = nextSignature;
            const decorations = breaks.map((item, index) => Decoration.widget(item.pos, () => {
              const gap = document.createElement(item.row ? 'tr' : 'span');
              gap.dataset.paperGap = ''; gap.contentEditable = 'false'; gap.setAttribute('aria-hidden', 'true');
              gap.className = 'notebook-paper-gap';
              gap.style.height = `${item.height}px`;
              if (item.row) {
                const cell = document.createElement('td'); cell.colSpan = item.columns ?? 100;
                cell.style.height = `${item.height}px`; cell.style.padding = '0'; cell.style.border = '0';
                if (item.header) {
                  const table = document.createElement('table');
                  table.className = 'notebook-repeated-header'; table.append(item.header.cloneNode(true)); cell.append(table);
                  table.style.font = getComputedStyle(item.header).font;
                }
                gap.append(cell);
              } else if (item.cellHeader) {
                const header = document.createElement('span'); header.className = 'notebook-repeated-cell-header';
                header.style.font = getComputedStyle(item.cellHeader).font;
                header.append(...Array.from(item.cellHeader.childNodes, (child) => child.cloneNode(true))); gap.append(header);
              }
              for (const itemHeader of item.tailHeaders ?? []) {
                const header = document.createElement('span'); header.className = 'notebook-repeated-cell-header';
                header.style.font = getComputedStyle(itemHeader.cell).font;
                header.style.top = `${itemHeader.top}px`; header.style.bottom = 'auto';
                header.append(...Array.from(itemHeader.cell.childNodes, (child) => child.cloneNode(true))); gap.append(header);
              }
              return gap;
            }, { side: -1, key: `paper-${index}-${nextSignature}`, ignoreSelection: true }));
            if (view.editable) view.state.doc.forEach((node, pos) => {
              if (node.type.name === 'sheetBreak') return;
              decorations.push(Decoration.widget(pos, () => {
                const handle = document.createElement('button');
                handle.type = 'button'; handle.draggable = true; handle.contentEditable = 'false';
                handle.className = 'notebook-block-handle'; handle.textContent = '⠿';
                handle.setAttribute('aria-label', `Select or drag ${node.type.name} block`);
                handle.title = 'Drag to reorder; Alt+Shift+arrows moves the selected block';
                handle.onpointerdown = (event) => { event.stopPropagation(); view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos))); };
                handle.ondragstart = (event) => { event.stopPropagation(); event.dataTransfer?.setData('application/x-cinnabar-block', String(pos)); };
                return handle;
              }, { side: 1, key: `handle-${node.attrs.id}-${pos}`, ignoreSelection: true }));
            });
            view.dispatch(view.state.tr.setMeta(key, DecorationSet.create(view.state.doc, decorations)).setMeta('addToHistory', false));
          }
          onLayout(layout); measuring = false;
        };
        const observer = new ResizeObserver(() => { if (!measuring) schedule(); });
        observer.observe(view.dom);
        view.dom.addEventListener('load', schedule, true);
        void document.fonts.ready.then(schedule);
        schedule();
        return { update: (_view, previous) => {
          if (previous.doc !== view.state.doc || lastEditable !== view.editable) {
            signature = null; lastEditable = view.editable; schedule();
          }
        },
          destroy: () => { destroyed = true; requests.delete(view); cancelAnimationFrame(frame); observer.disconnect(); view.dom.removeEventListener('load', schedule, true); } };
      },
    })];
  },
});

/** Measure lines in the existing DOM, keeping the selection and logical blocks intact. */
export function measureNotebook(view: EditorView): { breaks: Break[]; layout: NotebookLayout } {
  const root = view.dom.getBoundingClientRect();
  const scale = root.width / PAPER.contentWidth || 1;
  const units: Unit[] = [];
  const rect = (element: Element) => {
    const box = element.getBoundingClientRect();
    return { top: (box.top - root.top) / scale, bottom: (box.bottom - root.top) / scale };
  };
  const lines = (element: HTMLElement, from: number, to: number, inRow = false) => {
    const grouped = new Map<number, { top: number; bottom: number; positions: number[] }>();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: (node) => {
      const parent = node.parentElement;
      const readOnly = parent?.closest('[contenteditable="false"]');
      return parent?.closest('[data-paper-gap], .katex-mathml') || (readOnly && readOnly !== view.dom)
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    } });
    let text: Node | null;
    while ((text = walker.nextNode())) {
      const range = document.createRange(); range.selectNodeContents(text);
      const boxes = Array.from(range.getClientRects()).filter((box) => box.height > 0);
      for (const box of boxes) {
        let low = 0; let high = text.textContent?.length ?? 0;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          range.setStart(text, mid); range.setEnd(text, Math.min(mid + 1, text.textContent?.length ?? 0));
          if (range.getBoundingClientRect().top < box.top - .5) low = mid + 1; else high = mid;
        }
        const top = (box.top - root.top) / scale;
        const bottom = (box.bottom - root.top) / scale;
        const groupKey = Math.round(top);
        const group = grouped.get(groupKey) ?? { top, bottom, positions: [] };
        group.positions.push(view.posAtDOM(text, low)); group.bottom = Math.max(group.bottom, bottom);
        grouped.set(groupKey, group);
      }
    }
    const rows = [...grouped.values()].sort((a, b) => a.top - b.top);
    const result: Unit[] = [];
    rows.forEach((line, index) => result.push({ from: index === 0 && !inRow ? from : Math.min(...line.positions),
      to: index === rows.length - 1 ? to : Math.min(...rows[index + 1].positions), top: line.top, bottom: line.bottom,
    }));
    if (!rows.length) result.push({ from, to, ...rect(element) });
    return result;
  };
  const collect = (node: ProseMirrorNode, pos: number) => {
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    if (node.type.name === 'sheetBreak') { units.push({ from: pos, to: pos + node.nodeSize, ...rect(dom), force: true }); return; }
    if (node.type.name === 'table') {
      node.forEach((row, offset) => {
        const rowPos = pos + 1 + offset;
        const rowDom = view.nodeDOM(rowPos);
        if (!(rowDom instanceof HTMLTableRowElement)) return;
        const bounds = rect(rowDom);
        if (bounds.bottom - bounds.top > PAPER.contentHeight) {
          const cells: NonNullable<Unit['cells']> = [];
          row.forEach((cell, cellOffset) => {
            const cellPos = rowPos + 1 + cellOffset; const cellDom = view.nodeDOM(cellPos);
            if (cellDom instanceof HTMLElement) cells.push({ lines: lines(cellDom, cellPos + 1, cellPos + cell.nodeSize - 1, true),
              end: cellPos + cell.nodeSize - 1, bottom: rect(cellDom.lastElementChild ?? cellDom).bottom });
          });
          units.push({ from: rowPos, to: rowPos + row.nodeSize, ...bounds, row: rowDom, cells });
        }
        else units.push({ from: rowPos, to: rowPos + row.nodeSize, ...bounds, row: rowDom });
      });
    } else if (['bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'blockquote'].includes(node.type.name)) {
      node.forEach((child, offset) => collect(child, pos + 1 + offset));
    } else {
      const bounds = rect(dom);
      if (bounds.bottom - bounds.top > PAPER.contentHeight && node.isTextblock) units.push(...lines(dom, pos, pos + node.nodeSize));
      else units.push({ from: pos, to: pos + node.nodeSize, ...bounds });
    }
  };
  view.state.doc.forEach(collect);
  const breaks: Break[] = []; const starts = [0]; let shift = 0; let page = 0;
  const ranges = new Map<number, { from: number; to: number }[]>();
  const record = (number: number, unit: { from: number; to: number }) => {
    const items = ranges.get(number) ?? []; items.push({ from: unit.from, to: unit.to }); ranges.set(number, items);
  };
  for (const unit of units) {
    if (unit.cells) {
      const initialPage = page; const initialShift = shift;
      let finalPage = page; let finalShift = shift;
      const candidate = unit.row?.closest('table')?.querySelector('tr:has(th)') as HTMLTableRowElement | null;
      const header = candidate && candidate !== unit.row && candidate.getBoundingClientRect().height / scale < 200 ? candidate : null;
      const headerHeight = header ? header.getBoundingClientRect().height / scale : 0;
      const endings: { page: number; shift: number; column: number }[] = [];
      unit.cells.forEach((cell, column) => {
        let localPage = initialPage; let localShift = initialShift;
        for (const line of cell.lines) {
          const limit = localPage * (PAPER.height + PAPER.gap) + PAPER.contentHeight;
          if (line.bottom + localShift > limit + .5) {
            const height = Math.max(0, (localPage + 1) * (PAPER.height + PAPER.gap) - line.top - localShift) + headerHeight;
            breaks.push({ pos: line.from, height, cellHeader: header?.cells[column] });
            localShift += height; localPage++;
          }
          record(localPage, line);
        }
        finalPage = Math.max(finalPage, localPage); finalShift = Math.max(finalShift, localShift);
        endings.push({ page: localPage, shift: localShift, column });
      });
      // Short cells remain blank during row continuation, but retain their column headers.
      for (const ending of endings) {
        const cell = unit.cells[ending.column]; const headerCell = header?.cells[ending.column];
        if (!headerCell || ending.page === finalPage) continue;
        const top = cell.bottom + ending.shift;
        const tailHeaders = Array.from({ length: finalPage - ending.page }, (_, index) => ({
          cell: headerCell, top: (ending.page + index + 1) * (PAPER.height + PAPER.gap) - top,
        }));
        breaks.push({ pos: cell.end, height: Math.max(0, tailHeaders.at(-1)!.top + headerHeight), tailHeaders });
      }
      for (let next = initialPage + 1; next <= finalPage; next++) starts[next] ??= ranges.get(next)?.[0]?.from ?? unit.from;
      page = finalPage; shift = finalShift; continue;
    }
    const limit = page * (PAPER.height + PAPER.gap) + PAPER.contentHeight;
    if (unit.force || unit.bottom + shift > limit + .5) {
      // A zero-height break explicitly preserves legacy sheet boundaries.
      const nextTop = (page + 1) * (PAPER.height + PAPER.gap);
      const header = unit.row?.closest('table')?.querySelector('tr:has(th)') as HTMLTableRowElement | null;
      const repeated = header && header !== unit.row ? header : undefined;
      const headerHeight = repeated ? repeated.getBoundingClientRect().height / scale : 0;
      const height = Math.max(0, nextTop - (unit.top + shift)) + headerHeight;
      breaks.push({ pos: unit.from, height, row: !!unit.row, header: repeated, columns: unit.row?.cells.length });
      if (unit.force) record(page, unit);
      shift += height; page++;
      starts.push(unit.force ? unit.to : unit.from);
    }
    if (!unit.force) record(page, unit);
  }
  return { breaks, layout: { height: (page + 1) * (PAPER.height + PAPER.gap) - PAPER.gap,
    pages: starts.map((from, index) => {
      const ordered = (ranges.get(index) ?? []).sort((a, b) => a.from - b.from);
      const merged: { from: number; to: number }[] = [];
      for (const range of ordered) {
        const last = merged.at(-1);
        if (last && last.to >= range.from) last.to = Math.max(last.to, range.to); else merged.push({ ...range });
      }
      return { from, to: starts[index + 1] ?? view.state.doc.content.size, ranges: merged };
    }) } };
}
