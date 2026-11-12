import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Undo2, Redo2 } from 'lucide-react';
import { NotebookEditor } from '@cinnabar/notebook/editor';
import { PAPER, type NotebookLayout } from '@cinnabar/notebook/layout';
import { parseNotebookFile, serializeNotebook } from '@cinnabar/notebook';
import { useNotebookSession } from '../../hooks/useNotebookSession';
import { handleTitlebarMouseDown, isTauri, openNotebookFile, saveNotebookFile } from '../../utils/tauriBridge';

export function NotebookWorkspace({ onBack }: { onBack: () => void }) {
  const notebook = useNotebookSession();
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<NotebookLayout>({ pages: [], height: PAPER.height });
  const [zoom, setZoom] = useState(1);
  const [savingFile, setSavingFile] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const format = useRef<HTMLDetailsElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const latest = useRef(notebook); latest.current = notebook;
  const saving = useRef(false);
  const file = notebook.session?.present;
  const exportedRevision = useRef('');

  const save = useCallback(async () => {
    const snapshot = latest.current.session?.present;
    if (!snapshot || saving.current) return;
    saving.current = true;
    setSavingFile(true);
    try {
      if (await saveNotebookFile(serializeNotebook(snapshot), snapshot.title)) exportedRevision.current = snapshot.revision;
    }
    catch (failure) { latest.current.setError(`Could not save the file. ${String(failure)}`); }
    finally { saving.current = false; setSavingFile(false); }
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

  const acceptFile = async (content: string) => {
    try {
      const parsed = parseNotebookFile(content);
      await keepCurrent();
      notebook.activate(parsed);
      if (menu.current) menu.current.open = false;
    }
    catch (failure) { notebook.setError(`Could not open the notebook. ${String(failure)}`); }
  };
  async function keepCurrent() {
    if (notebook.session?.present.revision === exportedRevision.current) return;
    await notebook.flush();
  }
  async function leave() {
    try { await keepCurrent(); onBack(); }
    catch (failure) { notebook.setError(`Save your notebook file before leaving. ${String(failure)}`); }
  }
  const openFile = async () => {
    if (!isTauri()) { input.current?.click(); return; }
    try { const content = await openNotebookFile(); if (content !== null) await acceptFile(content); }
    catch (failure) { notebook.setError(String(failure)); }
  };
  const pageCount = Math.max(1, layout.pages.length, file?.document.minimumSheets ?? 1);

  return <section className="standalone-notebook" aria-label="Notebook workspace"
    onKeyDown={event => {
      // Notebook editing shortcuts belong to this workspace, not the PDF reader.
      if (event.metaKey || event.ctrlKey) {
        if (event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
        event.stopPropagation();
      }
    }}>
    <header className="macos-titlebar notebook-titlebar" onMouseDown={handleTitlebarMouseDown}>
      <div className="notebook-header-group app-no-drag">
        {isTauri() && <div className="macos-window-controls-spacer" aria-hidden="true" />}
        <button type="button" className="btn-icon" aria-label="Back to library" onClick={() => void leave()}><ArrowLeft size={16} /></button>
        <details className="notebook-menu" ref={menu}><summary>Notebook</summary><div>
          <button type="button" onClick={() => {
            void keepCurrent().then(() => { notebook.create(); setLayout({ pages: [], height: PAPER.height }); if (menu.current) menu.current.open = false; })
              .catch(failure => notebook.setError(`Save your notebook file before creating another. ${String(failure)}`));
          }}>New notebook</button>
          <button type="button" onClick={() => void openFile()}>Open notebook file…</button>
          {notebook.notebooks.length > 0 && <label>On this device<select aria-label="Open saved notebook" value={file?.id ?? ''}
            onChange={event => {
              const id = event.target.value;
              void keepCurrent().then(() => notebook.open(id)).then(() => { if (menu.current) menu.current.open = false; })
                .catch(failure => notebook.setError(String(failure)));
            }}>
            {!notebook.notebooks.some(item => item.id === file?.id) && <option value={file?.id ?? ''}>{file?.title || 'Untitled notebook'}</option>}
            {notebook.notebooks.map(item => <option key={item.id} value={item.id}>{item.title || 'Untitled notebook'}</option>)}
          </select></label>}
        </div></details>
      </div>
      <input className="notebook-title app-no-drag" aria-label="Notebook title" maxLength={200}
        value={file?.title ?? ''} placeholder="Untitled notebook" disabled={!file}
        onChange={event => notebook.rename(event.target.value)} />
      <div className="notebook-header-group app-no-drag">
        <button type="button" className="btn-icon" aria-label="Undo notebook edit" disabled={!notebook.session?.past.length} onClick={notebook.undo}><Undo2 size={15} /></button>
        <button type="button" className="btn-icon" aria-label="Redo notebook edit" disabled={!notebook.session?.future.length} onClick={notebook.redo}><Redo2 size={15} /></button>
        <details className="notebook-menu notebook-format" ref={format}><summary>Format</summary><div ref={setControlsHost} /></details>
        <button type="button" className="btn-secondary" disabled={!file || savingFile} onClick={() => void save()}>{savingFile ? 'Saving…' : 'Save file'}</button>
      </div>
    </header>
    {notebook.error && <div role="alert" className="notebook-error">{notebook.error}<button type="button" onClick={() => notebook.setError(null)}>Dismiss</button></div>}
    <main className="notebook-paper-viewport" aria-label="Notebook paper">
      {file && <div className="independent-paper-stack" style={{ width: PAPER.width * zoom, height: (pageCount * PAPER.height + (pageCount - 1) * PAPER.gap) * zoom }}>
        {Array.from({ length: pageCount }, (_, index) => <div key={index} className="independent-paper-sheet" aria-hidden="true"
          style={{ top: index * (PAPER.height + PAPER.gap) * zoom, width: PAPER.width * zoom, height: PAPER.height * zoom, background: file.document.styles.background }} />)}
        <NotebookEditor key={file.id} document={file.document} zoom={zoom} editable
          onChange={notebook.change} onLayout={setLayout} controlsHost={controlsHost}
          onRequestControls={() => { if (format.current) format.current.open = true; }}
          undo={notebook.undo} redo={notebook.redo} canUndo={Boolean(notebook.session?.past.length)} canRedo={Boolean(notebook.session?.future.length)} />
      </div>}
    </main>
    <footer className="notebook-statusbar">
      <span role="status">{notebook.saveStatus}</span>
      <span>{pageCount} {pageCount === 1 ? 'page' : 'pages'}</span>
      <label>Zoom <select aria-label="Notebook zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))}>
        {[.6, .8, 1, 1.2, 1.5].map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
      </select></label>
    </footer>
    <input ref={input} type="file" accept="application/json,.json" hidden aria-label="Open notebook file"
      onChange={event => {
        const selected = event.target.files?.[0]; event.target.value = '';
        if (!selected) return;
        if (selected.size > 50_000_000) { notebook.setError('Notebook exceeds the 50 MB file limit.'); return; }
        void selected.text().then(acceptFile).catch(failure => notebook.setError(String(failure)));
      }} />
  </section>;
}
