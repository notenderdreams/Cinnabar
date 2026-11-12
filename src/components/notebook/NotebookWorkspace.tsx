import { useCallback, useEffect, useRef, useState } from 'react';
import { NotebookEditor } from '@cinnabar/notebook/editor';
import { PAPER, type NotebookLayout } from '@cinnabar/notebook/layout';
import { serializeNotebook } from '@cinnabar/notebook';
import { useNotebookSession } from '../../hooks/useNotebookSession';
import type { NotebookTarget } from '../../lib/notebook/navigation';
import { saveNotebookFile } from '../../utils/tauriBridge';

export function NotebookWorkspace({ onBack, initialTarget, embedded = false }: {
  onBack: () => void; initialTarget?: NotebookTarget; embedded?: boolean;
}) {
  const notebook = useNotebookSession(initialTarget);
  const [layout, setLayout] = useState<NotebookLayout>({ pages: [], height: PAPER.height });
  const zoom = embedded ? .8 : 1;
  const latest = useRef(notebook); latest.current = notebook;
  const saving = useRef(false);
  const file = notebook.session?.present;
  const exportedRevision = useRef('');

  const save = useCallback(async () => {
    const snapshot = latest.current.session?.present;
    if (!snapshot || saving.current) return;
    saving.current = true;
    try {
      if (await saveNotebookFile(serializeNotebook(snapshot), snapshot.title)) exportedRevision.current = snapshot.revision;
    }
    catch (failure) { latest.current.setError(`Could not save the file. ${String(failure)}`); }
    finally { saving.current = false; }
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current.saveStatus === 'Saved on this device') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  async function leave() {
    try {
      if (notebook.session?.present.revision !== exportedRevision.current) await notebook.flush();
      onBack();
    } catch (failure) { notebook.setError(`Save your notebook file before leaving. ${String(failure)}`); }
  }
  const pageCount = Math.max(1, layout.pages.length, file?.document.minimumSheets ?? 1);

  return <section className={`standalone-notebook ${embedded ? 'embedded-notebook' : ''}`} aria-label="Notebook workspace"
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        void leave();
      } else if (event.metaKey || event.ctrlKey) {
        if (event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
        event.stopPropagation();
      }
    }}>
    {notebook.error && <div role="alert" className="notebook-error">{notebook.error}<button type="button" onClick={() => notebook.setError(null)}>Dismiss</button></div>}
    <main className="notebook-paper-viewport" aria-label="Notebook paper">
      {file && <div className="independent-paper-stack" style={{ width: PAPER.width * zoom, height: (pageCount * PAPER.height + (pageCount - 1) * PAPER.gap) * zoom }}>
        {Array.from({ length: pageCount }, (_, index) => <div key={index} className="independent-paper-sheet" aria-hidden="true"
          style={{ top: index * (PAPER.height + PAPER.gap) * zoom, width: PAPER.width * zoom, height: PAPER.height * zoom, background: file.document.styles.background }} />)}
        <NotebookEditor key={file.id} document={file.document} zoom={zoom} editable
          onChange={notebook.change} onLayout={setLayout} controlsHost={null}
          undo={notebook.undo} redo={notebook.redo} canUndo={Boolean(notebook.session?.past.length)} canRedo={Boolean(notebook.session?.future.length)} />
      </div>}
    </main>
  </section>;
}
