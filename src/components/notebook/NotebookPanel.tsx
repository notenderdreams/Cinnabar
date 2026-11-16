import { useState } from 'react';
import type { NotebookTarget } from '../../lib/notebook/navigation';
import { NotebookLibrary } from './NotebookLibrary';
import { NotebookWorkspace } from './NotebookWorkspace';
import type { ZoomStepRequest } from '../../hooks/useViewportZoom';
import type { AiNotebookBinding } from '../../lib/ai/notebookBinding';

export function NotebookPanel({
  zoom,
  onZoomChange,
  onActivate,
  onDocumentChange,
  pageRequest,
  fitRequest,
  zoomStepRequest,
  onOpenPdfReference,
  onAiNotebookChange,
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onActivate: () => void;
  onDocumentChange: (document: { title: string; pages: number; page: number } | null) => void;
  pageRequest: { page: number; id: number } | null;
  fitRequest: number;
  zoomStepRequest?: ZoomStepRequest | null;
  onAiNotebookChange?: (binding: AiNotebookBinding | null) => void;
  onOpenPdfReference: (
    data: Uint8Array,
    name: string,
    path: string,
    page: number,
  ) => Promise<boolean>;
}) {
  const [target, setTarget] = useState<NotebookTarget | null>(null);
  return (
    <section
      id="reader-notebooks-panel"
      className="reader-notebooks-panel"
      aria-label="Notebooks pane"
    >
      {target ? (
        <NotebookWorkspace
          key={target.kind === 'existing' ? target.id : 'new'}
          initialTarget={target}
          embedded
          onAiNotebookChange={onAiNotebookChange}
          onOpenPdfReference={onOpenPdfReference}
          zoom={zoom}
          onZoomChange={onZoomChange}
          onActivate={onActivate}
          onDocumentChange={onDocumentChange}
          pageRequest={pageRequest}
          fitRequest={fitRequest}
          zoomStepRequest={zoomStepRequest}
          onBack={() => setTarget(null)}
        />
      ) : (
        <NotebookLibrary
          onSelect={(next) => {
            setTarget(next);
            onActivate();
          }}
        />
      )}
    </section>
  );
}
