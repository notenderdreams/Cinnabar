import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor, JSONContent } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { BookOpen, FileText, Scissors } from 'lucide-react';
import { blockCommands } from './blockCommandItems';
import { slashTrigger } from './slashTrigger';

export interface BlockChoice {
  id: string;
  label: string;
  content: JSONContent[];
  maxPage?: number;
}
export type BlockChoiceKind = 'pdf' | 'snippet' | 'notebook';
const key = new PluginKey('notebookSlash');

export function BlockCommands({
  editor,
  onInsert,
  loadChoices,
}: {
  editor: Editor | null;
  onInsert: (type: string, range: { from: number; to: number }) => void;
  loadChoices?: (kind: BlockChoiceKind) => Promise<BlockChoice[]>;
}) {
  const [trigger, setTrigger] = useState<{
    from: number;
    to: number;
    query: string;
  } | null>(null);
  const [picker, setPicker] = useState<{
    kind: BlockChoiceKind;
    items: BlockChoice[];
    loading: boolean;
    error?: string;
  } | null>(null);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState(1);
  const generation = useRef(0);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const actions = useRef({ keydown: (_event: KeyboardEvent): boolean => false });
  const dismissed = useRef<number | null>(null);
  const activeQuery = picker ? query : (trigger?.query ?? '');
  const commands = blockCommands.filter((item) =>
    `${item.label} ${item.keywords}`.toLowerCase().includes(activeQuery.toLowerCase()),
  );
  const choices =
    picker?.items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())) ?? [];
  const count = picker ? choices.length : commands.length;
  const ChoiceIcon =
    picker?.kind === 'notebook' ? BookOpen : picker?.kind === 'snippet' ? Scissors : FileText;
  const close = (restoreFocus = false) => {
    dismissed.current = trigger?.from ?? null;
    generation.current++;
    setTrigger(null);
    setPicker(null);
    setQuery('');
    setIndex(0);
    setPage(1);
    if (restoreFocus && editor && !editor.isDestroyed) editor.view.focus();
  };
  async function choose(selected: number) {
    if (!editor || !trigger) return;
    if (picker) {
      const choice = choices[selected];
      if (!choice) return;
      const content = choice.content.map((node) =>
        node.type === 'reference' && picker.kind === 'pdf'
          ? {
              ...node,
              attrs: { ...node.attrs, page: Math.max(1, Math.min(choice.maxPage ?? 100000, page)) },
            }
          : node,
      );
      editor
        .chain()
        .focus()
        .deleteRange({ from: trigger.from, to: trigger.to })
        .insertContent(content)
        .run();
      close();
      return;
    }
    const command = commands[selected];
    if (!command) return;
    if (['pdf', 'snippet', 'notebook'].includes(command.type)) {
      const kind = command.type as BlockChoiceKind;
      const run = ++generation.current;
      setPicker({ kind, items: [], loading: true });
      setIndex(0);
      setQuery('');
      try {
        const items = (await loadChoices?.(kind)) ?? [];
        if (generation.current === run) setPicker({ kind, items, loading: false });
      } catch {
        if (generation.current === run)
          setPicker({
            kind,
            items: [],
            loading: false,
            error: 'Could not load items. Close and try again.',
          });
      }
      return;
    }
    close();
    onInsert(command.type, { from: trigger.from, to: trigger.to });
  }
  actions.current.keydown = (event) => {
    if (!trigger || event.isComposing) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return true;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((value) =>
        count ? (value + (event.key === 'ArrowDown' ? 1 : count - 1)) % count : 0,
      );
      return true;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void choose(index);
      return true;
    }
    return false;
  };
  useEffect(() => {
    if (!editor) return;
    const requests = generation;
    const sync = (event?: unknown) => {
      if (
        event instanceof Event &&
        event.target instanceof globalThis.Node &&
        menu.current?.contains(event.target)
      )
        return;
      if (editor.isDestroyed) return;
      const { $from, empty } = editor.state.selection;
      const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\ufffc');
      const match = slashTrigger(before, $from.pos);
      if (!editor.isEditable || !empty || $from.parent.type.name !== 'paragraph' || !match) {
        setTrigger(null);
        setPicker(null);
        generation.current++;
        dismissed.current = null;
        return;
      }
      const from = match.from;
      if (dismissed.current === from) return;
      setTrigger({
        from,
        to: $from.pos,
        query: match.query,
      });
    };
    const plugin = new Plugin({
      key,
      props: { handleKeyDown: (_view, event) => actions.current.keydown(event) },
    });
    editor.registerPlugin(plugin, (newPlugin, plugins) => [newPlugin, ...plugins]);
    editor.on('selectionUpdate', sync);
    editor.on('update', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    const outside = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as globalThis.Node)) {
        const { $from } = editor.state.selection;
        const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\ufffc');
        dismissed.current = slashTrigger(before, $from.pos)?.from ?? $from.start();
        generation.current++;
        setTrigger(null);
        setPicker(null);
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      requests.current++;
      editor.unregisterPlugin(key);
      editor.off('selectionUpdate', sync);
      editor.off('update', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, [editor]);
  useEffect(() => {
    if (picker?.kind) search.current?.focus();
  }, [picker?.kind]);
  useEffect(() => {
    setIndex(0);
  }, [activeQuery]);
  useEffect(() => {
    const selected = menu.current?.querySelector<HTMLElement>('[data-active="true"]');
    const list = selected?.parentElement;
    if (!selected || !list) return;
    const top =
      selected.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + selected.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = top + selected.offsetHeight - list.clientHeight;
  }, [index]);
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element || !editor || editor.isDestroyed || !trigger) return;
    // Anchor to the slash, so filtering never moves the menu horizontally.
    const anchor = editor.view.coordsAtPos(trigger.from);
    const bounds = element.getBoundingClientRect();
    const below = anchor.bottom + 5;
    const above = anchor.top - bounds.height - 5;
    const top = below + bounds.height <= window.innerHeight - 8 ? below : above;
    element.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(top, window.innerHeight - bounds.height - 8))}px`;
    element.style.visibility =
      anchor.bottom < 0 || anchor.top > window.innerHeight ? 'hidden' : 'visible';
  });
  if (!trigger) return null;
  return createPortal(
    <div
      ref={menu}
      role="dialog"
      aria-label="Block commands"
      tabIndex={-1}
      className="notebook-slash-menu"
    >
      {picker && (
        <div className="notebook-slash-search">
          <input
            ref={search}
            onKeyDown={(event) => {
              if (actions.current.keydown(event.nativeEvent)) event.stopPropagation();
            }}
            aria-label={`Search ${picker.kind}`}
            placeholder={`Search ${picker.kind}…`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {picker.kind === 'pdf' && (
            <label>
              Page{' '}
              <input
                onKeyDown={(event) => {
                  if (
                    ['Escape', 'Enter'].includes(event.key) &&
                    actions.current.keydown(event.nativeEvent)
                  )
                    event.stopPropagation();
                }}
                aria-label="PDF page"
                type="number"
                min="1"
                value={page}
                onChange={(event) => setPage(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
          )}
        </div>
      )}
      <div
        role="menu"
        aria-label={picker ? `Insert ${picker.kind}` : 'Insert block'}
        className="notebook-slash-items"
      >
        {picker
          ? choices.map((choice, i) => (
              <button
                key={choice.id}
                type="button"
                role="menuitem"
                data-active={i === index}
                onFocus={() => setIndex(i)}
                onMouseMove={() => setIndex(i)}
                onKeyDown={(event) => {
                  if (actions.current.keydown(event.nativeEvent)) event.stopPropagation();
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void choose(i)}
                title={choice.label}
              >
                <ChoiceIcon size={14} aria-hidden="true" />
                <span>{choice.label}</span>
              </button>
            ))
          : commands.map((command, i) => (
              <button
                key={command.type}
                type="button"
                role="menuitem"
                data-active={i === index}
                onFocus={() => setIndex(i)}
                onMouseMove={() => setIndex(i)}
                onKeyDown={(event) => {
                  if (actions.current.keydown(event.nativeEvent)) event.stopPropagation();
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void choose(i)}
              >
                <command.icon size={14} aria-hidden="true" />
                <span>{command.label}</span>
              </button>
            ))}
        {count === 0 && (
          <div className="notebook-slash-empty" role="status">
            {picker?.loading
              ? 'Loading…'
              : (picker?.error ?? (picker ? 'No saved items found.' : 'No matching blocks.'))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
