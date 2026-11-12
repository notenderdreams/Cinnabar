import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Plus, FolderOpen } from 'lucide-react';
import { parseNotebookFile } from '@cinnabar/notebook';
import { listLocalNotebooks, saveNotebookLocally, type NotebookSummary } from '../../lib/notebook/storage';
import type { NotebookTarget } from '../../lib/notebook/navigation';
import { openNotebookFile } from '../../utils/tauriBridge';

/** Shared notebook discovery for the home section and the reader's right panel. */
export function NotebookLibrary({ onSelect, search = '' }: { onSelect: (target: NotebookTarget) => void; search?: string }) {
  const [items, setItems] = useState<NotebookSummary[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(false);

  useEffect(() => {
    alive.current = true;
    void listLocalNotebooks().then(values => { if (alive.current) setItems(values); })
      .catch(failure => { if (alive.current) setError(String(failure)); })
      .finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
  }, []);

  async function importFile(content: string) {
    try {
      const file = parseNotebookFile(content);
      await saveNotebookLocally(file);
      if (alive.current) onSelect({ kind: 'existing', id: file.id });
    } catch (failure) { if (alive.current) setError(`Could not open the notebook. ${String(failure)}`); }
  }
  async function chooseFile() {
    try { const content = await openNotebookFile(); if (content !== null && alive.current) await importFile(content); }
    catch (failure) { if (alive.current) setError(String(failure)); }
  }
  const query = search.trim().toLocaleLowerCase();
  const filtered = items.filter(item => (item.title || 'Untitled notebook').toLocaleLowerCase().includes(query));
  const visible = showAll || query ? filtered : filtered.slice(0, 5);

  return <section className="notebook-library" aria-label={showAll ? 'All notebooks' : 'Recent notebooks'}>
    <div className="notebook-library-heading">
      {showAll && <button type="button" className="btn-icon" aria-label="Back to recent notebooks" onClick={() => setShowAll(false)}><ArrowLeft size={15} /></button>}
      <h2>{showAll ? 'All notebooks' : 'Recent notebooks'}</h2>
    </div>
    {error && <p role="alert" className="notebook-library-message">{error}</p>}
    {loading ? <p role="status" className="notebook-library-message">Loading notebooks…</p> : <>
      {visible.length ? <ul className="notebook-library-list">
        {visible.map(item => <li key={item.id}><button type="button" onClick={() => onSelect({ kind: 'existing', id: item.id })}>
          <BookOpen size={16} aria-hidden="true" />
          <span>{item.title || 'Untitled notebook'}</span>
          <time dateTime={new Date(item.updatedAt).toISOString()}>{new Date(item.updatedAt).toLocaleDateString()}</time>
        </button></li>)}
      </ul> : <p className="notebook-library-message">{query ? 'No matching notebooks.' : 'No notebooks yet.'}</p>}
      {!showAll ? <div className="notebook-library-actions">
        <button type="button" onClick={() => onSelect({ kind: 'new' })}><Plus size={16} aria-hidden="true" />Create new notebook</button>
        <button type="button" onClick={() => setShowAll(true)}><FolderOpen size={16} aria-hidden="true" />Open existing notebook</button>
      </div> : <button type="button" className="notebook-library-import" onClick={() => void chooseFile()}>Import notebook file…</button>}
    </>}
  </section>;
}
