import { useState } from 'react';
import { X } from 'lucide-react';
import type { NotebookTarget } from '../../lib/notebook/navigation';
import { NotebookLibrary } from './NotebookLibrary';
import { NotebookWorkspace } from './NotebookWorkspace';
import { SplitDivider } from '../ui/SplitDivider';

export function NotebookPanel({ isOpen, onClose, zoom, onZoomChange, onActivate, onDocumentChange, pageRequest, fitRequest }: {
  isOpen: boolean; onClose: () => void; zoom: number; onZoomChange: (zoom: number) => void;
  onActivate: () => void; onDocumentChange: (document: { title: string; pages: number; page: number } | null) => void;
  pageRequest: { page: number; id: number } | null; fitRequest: number;
}) {
  const [target, setTarget] = useState<NotebookTarget | null>(null);
  const [split, setSplit] = useState<number | null>(null);
  return <>
  {isOpen && <SplitDivider value={split ?? .5} onChange={setSplit} label="Resize PDF and notebook panes" minRight={320} />}
  <aside id="reader-notebooks-panel" style={split === null ? undefined : { flexBasis: `calc(${(1 - split) * 100}% - ${(1 - split) * 6}px)` }} className={`reader-notebooks-panel ${target ? 'has-notebook' : ''} ${isOpen ? '' : 'is-closed'}`} aria-label="Notebooks panel" aria-hidden={!isOpen}>
    {target ? <NotebookWorkspace key={target.kind === 'existing' ? target.id : 'new'} initialTarget={target} embedded
      zoom={zoom} onZoomChange={onZoomChange} onActivate={onActivate} onDocumentChange={onDocumentChange} pageRequest={pageRequest} fitRequest={fitRequest}
      onBack={() => setTarget(null)} /> : isOpen && <>
      <header className="reader-notebooks-heading"><h2>Notebooks</h2><button type="button" className="btn-icon" aria-label="Close notebooks panel" onClick={onClose}><X size={16} /></button></header>
      <NotebookLibrary onSelect={setTarget} />
    </>}
  </aside></>;
}
