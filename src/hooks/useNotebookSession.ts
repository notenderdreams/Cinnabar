import { useCallback, useEffect, useRef, useState } from 'react';
import { createNotebook, editNotebook, openNotebookSession, undoNotebook, redoNotebook,
  type NotebookDocument, type NotebookFile, type NotebookSession } from '@cinnabar/notebook';
import { listLocalNotebooks, loadNotebookLocally, saveNotebookLocally, touchNotebookLocally, type NotebookSummary } from '../lib/notebook/storage';
import type { NotebookTarget } from '../lib/notebook/navigation';

export function useNotebookSession(initialTarget?: NotebookTarget) {
  const [session, setSession] = useState<NotebookSession | null>(null);
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState('Opening…');
  const current = useRef(session); current.current = session;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(false);
  const savedRevision = useRef('');
  const generation = useRef(0);

  const persist = useCallback((file: NotebookFile) => {
    const pending = queue.current.catch(() => {}).then(() => saveNotebookLocally(file));
    queue.current = pending;
    return pending;
  }, []);

  useEffect(() => {
    mounted.current = true;
    const run = ++generation.current;
    void listLocalNotebooks().then(async items => {
      if (run !== generation.current || !mounted.current) return;
      setNotebooks(items);
      const id = initialTarget?.kind === 'existing' ? initialTarget.id : initialTarget?.kind === 'new' ? undefined : items[0]?.id;
      const file = id ? await loadNotebookLocally(id) : createNotebook();
      if (run !== generation.current || !mounted.current) return;
      if (id) await touchNotebookLocally(id).catch(() => {});
      if (run !== generation.current || !mounted.current) return;
      savedRevision.current = id ? file.revision : '';
      setSession(openNotebookSession(file));
    }).catch(failure => {
      if (run !== generation.current || !mounted.current) return;
      setError(String(failure));
      setSaveStatus('Could not open notebook');
      // A failed explicit open must not silently create an unrelated notebook.
      if (initialTarget?.kind !== 'existing') setSession(openNotebookSession(createNotebook()));
    });
    return () => { mounted.current = false; generation.current += 1; };
  }, []);

  useEffect(() => {
    if (!session) return;
    if (session.present.revision === savedRevision.current) { setSaveStatus('Saved on this device'); return; }
    const file = session.present;
    setSaveStatus('Saving…');
    // Queue every snapshot in order; switching or unmounting cannot drop the last edit.
    void persist(file).then(() => {
      if (!mounted.current) return;
      setNotebooks(items => [{ id: file.id, title: file.title, updatedAt: file.updatedAt }, ...items.filter(item => item.id !== file.id)]);
      if (current.current?.present.revision !== file.revision) return;
      savedRevision.current = file.revision;
      setSaveStatus('Saved on this device');
      setStorageError(null);
    }).catch(failure => {
      if (!mounted.current || current.current?.present.id !== file.id) return;
      setSaveStatus('Not saved');
      setStorageError(`Local save failed. Press Cmd/Ctrl+S to save your edits to a file. ${String(failure)}`);
    });
  }, [session, persist]);

  const activate = useCallback((file: NotebookFile) => {
    generation.current += 1;
    setError(null);
    setStorageError(null);
    setSession(openNotebookSession(file));
  }, []);

  const open = useCallback(async (id: string) => {
    const run = ++generation.current;
    try {
      await queue.current;
      const file = await loadNotebookLocally(id);
      if (run !== generation.current || !mounted.current) return;
      await touchNotebookLocally(id).catch(() => {});
      if (run === generation.current && mounted.current) activate(file);
    } catch (failure) { if (mounted.current) setError(String(failure)); }
  }, [activate]);

  const change = useCallback((document: NotebookDocument, group?: string) => {
    setSession(value => value && editNotebook(value, { document }, group));
  }, []);

  const flush = useCallback(async () => {
    const file = current.current?.present;
    if (file) await persist(file);
  }, [persist]);

  return { session, notebooks, saveStatus, error: error ?? storageError,
    setError: (message: string | null) => { setError(message); if (message === null) setStorageError(null); },
    activate, open, flush,
    create: () => activate(createNotebook()),
    change,
    rename: (title: string) => setSession(value => value && editNotebook(value, { title }, 'title')),
    undo: () => setSession(value => value && undoNotebook(value)),
    redo: () => setSession(value => value && redoNotebook(value)),
  };
}
