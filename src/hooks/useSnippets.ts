import { useState, useCallback, useEffect, useRef } from 'react';
import type { SnippetDividerEntry, SnippetEntry, SnippetImageEntry } from '../utils/types';

const STORAGE_PREFIX = 'pdfuck_snippets_';

function loadSnippetsSync(docKey: string, fallbackKeys: string[] = []): SnippetEntry[] {
  if (!docKey) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${docKey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  for (const key of fallbackKeys) {
    if (!key || key === docKey) continue;
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
  }
  return [];
}

export function useSnippets(docKey: string, fallbackKeys: string[] = []) {
  const [activeDocKey, setActiveDocKey] = useState<string>(docKey);
  const storageIdentity = [docKey, ...fallbackKeys].join('\u0000');
  const [snippets, setSnippets] = useState<SnippetEntry[]>(() => loadSnippetsSync(docKey, fallbackKeys));
  const [history, setHistory] = useState<SnippetEntry[][]>(() => [loadSnippetsSync(docKey, fallbackKeys)]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const isLoadedRef = useRef(Boolean(docKey));
  const snippetsRef = useRef<SnippetEntry[]>(snippets);
  snippetsRef.current = snippets;
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(() => (docKey ? storageIdentity : null));

  // Synchronously switch document snippets during render to prevent stale leaks
  if (docKey !== activeDocKey) {
    setActiveDocKey(docKey);
    const initial = loadSnippetsSync(docKey, fallbackKeys);
    setSnippets(initial);
    snippetsRef.current = initial;
    setHistory([initial]);
    setHistoryIndex(0);
    isLoadedRef.current = Boolean(docKey);
    setLoadedIdentity(storageIdentity);
  }

  // Load saved snippets for the current document
  useEffect(() => {
    if (!docKey) {
      setLoadedIdentity(null);
      return;
    }
    const loaded = loadSnippetsSync(docKey, fallbackKeys);
    setSnippets(loaded);
    snippetsRef.current = loaded;
    setHistory([loaded]);
    setHistoryIndex(0);
    isLoadedRef.current = true;
    setLoadedIdentity(storageIdentity);

    if (loaded.length > 0) {
      const direct = loadSnippetsSync(docKey, []);
      if (direct.length === 0) {
        try {
          localStorage.setItem(`${STORAGE_PREFIX}${docKey}`, JSON.stringify(loaded));
        } catch {}
      }
    }
  }, [docKey, storageIdentity]);

  // Persist snippets whenever they change
  useEffect(() => {
    if (!isLoadedRef.current || !docKey || loadedIdentity !== storageIdentity) return;

    try {
      localStorage.setItem(`${STORAGE_PREFIX}${docKey}`, JSON.stringify(snippets));
    } catch (e) {
      console.warn('Failed to save snippets to storage:', e);
    }
  }, [snippets, docKey, loadedIdentity, storageIdentity]);

  const pushState = useCallback(
    (newEntries: SnippetEntry[]) => {
      setHistory((prevHistory) => {
        const upToCurrent = prevHistory.slice(0, historyIndex + 1);
        const updated = [...upToCurrent, newEntries];
        if (updated.length > 25) {
          updated.shift();
        }
        return updated;
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 24));
      setSnippets(newEntries);
      snippetsRef.current = newEntries;
    },
    [historyIndex]
  );

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      const nextState = history[nextIndex];
      setSnippets(nextState);
      snippetsRef.current = nextState;
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      const nextState = history[nextIndex];
      setSnippets(nextState);
      snippetsRef.current = nextState;
    }
  }, [history, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const addSnippet = useCallback(
    (snippet: SnippetImageEntry) => {
      if (snippetsRef.current.some((s) => s.id === snippet.id)) {
        return;
      }
      const updated = [...snippetsRef.current, snippet];
      pushState(updated);
    },
    [pushState]
  );

  const addDivider = useCallback(
    (afterId?: string, label: string = '') => {
      const newDivider: SnippetDividerEntry = {
        id: `div_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'divider',
        label,
        style: 'solid',
        createdAt: Date.now(),
      };

      const current = snippetsRef.current;
      let updated: SnippetEntry[];
      if (!afterId) {
        updated = [...current, newDivider];
      } else {
        const index = current.findIndex((item) => item.id === afterId);
        if (index === -1) {
          updated = [...current, newDivider];
        } else {
          updated = [...current];
          updated.splice(index + 1, 0, newDivider);
        }
      }
      pushState(updated);
    },
    [pushState]
  );

  const removeEntry = useCallback(
    (id: string) => {
      const updated = snippetsRef.current.filter((item) => item.id !== id);
      pushState(updated);
    },
    [pushState]
  );

  const moveEntry = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const current = snippetsRef.current;
      const index = current.findIndex((item) => item.id === id);
      if (index === -1) return;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return;

      const updated = [...current];
      const [item] = updated.splice(index, 1);
      updated.splice(targetIndex, 0, item);
      pushState(updated);
    },
    [pushState]
  );

  const updateDivider = useCallback(
    (id: string, updates: Partial<SnippetDividerEntry>) => {
      const updated = snippetsRef.current.map((item) => {
        if (item.id === id && item.type === 'divider') {
          return { ...item, ...updates };
        }
        return item;
      });
      pushState(updated);
    },
    [pushState]
  );

  const updateSnippetLabel = useCallback(
    (id: string, label: string) => {
      const updated = snippetsRef.current.map((item) => {
        if (item.id === id && item.type === 'image') {
          return { ...item, label };
        }
        return item;
      });
      pushState(updated);
    },
    [pushState]
  );

  const clearAll = useCallback(() => {
    if (snippetsRef.current.length === 0) return;
    pushState([]);
  }, [pushState]);

  const replaceSnippets = useCallback((nextEntries: SnippetEntry[]) => {
    setSnippets(nextEntries);
    snippetsRef.current = nextEntries;
    setHistory([nextEntries]);
    setHistoryIndex(0);
  }, []);

  return {
    snippets,
    addSnippet,
    addDivider,
    removeEntry,
    moveEntry,
    updateDivider,
    updateSnippetLabel,
    clearAll,
    undo,
    redo,
    canUndo,
    canRedo,
    setSnippets,
    replaceSnippets,
  };
}
