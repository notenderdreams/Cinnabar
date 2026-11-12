import { useState } from 'react';
import { X } from 'lucide-react';
import type { NotebookTarget } from '../../lib/notebook/navigation';
import { NotebookLibrary } from './NotebookLibrary';
import { NotebookWorkspace } from './NotebookWorkspace';

export function NotebookPanel({ isOpen, onClose, zoom, onZoomChange, onActivate, onDocumentChange, pageRequest, fitRequest }: {
  isOpen: boolean; onClose: () => void; zoom: number; onZoomChange: (zoom: number) => void;
  onActivate: () => void; onDocumentChange: (document: { title: string; pages: number; page: number } | null) => void;
  pageRequest: { page: number; id: number } | null; fitRequest: number;
}) {
  const [target, setTarget] = useState<NotebookTarget | null>(null);
  return <aside id="reader-notebooks-panel" className={`reader-notebooks-panel ${target ? 'has-notebook' : ''} ${isOpen ? '' : 'is-closed'}`} aria-label="Notebooks panel" aria-hidden={!isOpen}>
    {target ? <NotebookWorkspace key={target.kind === 'existing' ? target.id : 'new'} initialTarget={target} embedded
      zoom={zoom} onZoomChange={onZoomChange} onActivate={onActivate} onDocumentChange={onDocumentChange} pageRequest={pageRequest} fitRequest={fitRequest}
      onBack={() => setTarget(null)} /> : isOpen && <>
      <header className="reader-notebooks-heading"><h2>Notebooks</h2><button type="button" className="btn-icon" aria-label="Close notebooks panel" onClick={onClose}><X size={16} /></button></header>
      <NotebookLibrary onSelect={setTarget} />
    </>}
  </aside>;
}
