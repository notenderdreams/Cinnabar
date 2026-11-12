import { useEffect, useRef, useState } from 'react';
import type { useAnnotations } from './useAnnotations';
import { notebookCarrier } from '../lib/notebook/document';
import { prepareNotebookMigration } from '../lib/notebook/migration';

export function useNotebookMigration(key: string, notes: ReturnType<typeof useAnnotations>, count: number) {
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(notes); latest.current = notes;
  useEffect(() => { setError(null); }, [key]);
  useEffect(() => {
    if (!key || !notes.isLoaded || notebookCarrier(notes.annotations)) return;
    const snapshot = notes.annotations;
    let cancelled = false;
    setError(null);
    void (async () => {
      const converted = await prepareNotebookMigration(key, snapshot, count);
      if (cancelled || latest.current.annotations !== snapshot) return;
      // Conversion and backup have both succeeded before the original can be replaced.
      latest.current.replaceAnnotations(converted);
    })().catch((failure) => {
      if (!cancelled) setError(`Notebook conversion failed. Original notes were retained. ${failure instanceof Error ? failure.message : ''}`);
    });
    return () => { cancelled = true; };
  }, [key, notes.isLoaded, notes.annotations, count]);
  return error;
}
