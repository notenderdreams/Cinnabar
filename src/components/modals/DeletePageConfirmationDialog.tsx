import React, { useEffect, useRef } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';

interface DeletePageConfirmationDialogProps {
  pageNumber: number | null;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeletePageConfirmationDialog: React.FC<DeletePageConfirmationDialogProps> = ({
  pageNumber,
  isDeleting,
  onCancel,
  onConfirm,
}) => {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (pageNumber === null) return;

    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeleting, onCancel, pageNumber]);

  if (pageNumber === null) return null;

  return (
    <div
      className="delete-page-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isDeleting) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-page-dialog-title"
        aria-describedby="delete-page-dialog-description"
        className="delete-page-dialog"
      >
        <div className="delete-page-dialog__icon" aria-hidden="true">
          <Trash2 />
        </div>

        <div className="min-w-0 flex-1">
          <h2 id="delete-page-dialog-title" className="delete-page-dialog__title">
            Delete Page {pageNumber}?
          </h2>
          <p id="delete-page-dialog-description" className="delete-page-dialog__description">
            This removes the page and its annotations and snippets from the current document.
          </p>

          <div className="delete-page-dialog__actions">
            <button
              ref={cancelButtonRef}
              type="button"
              className="btn-secondary"
              disabled={isDeleting}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="delete-page-dialog__confirm"
              disabled={isDeleting}
              onClick={onConfirm}
            >
              {isDeleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
              {isDeleting ? 'Deleting…' : 'Delete Page'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
