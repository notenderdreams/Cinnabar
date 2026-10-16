import React, { useEffect, useRef } from 'react';
import { Copy, FilePlus, FileText, Image, Trash2 } from 'lucide-react';
import { SparkleIcon } from './icons/SparkleIcon';
import type { Annotation } from '../utils/types';
import { getAnnotationCoveredText } from '../utils/annotationPresentation';

interface PageContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onAddPageBelow: () => void;
  onDeletePage: () => void;
  onCopyPageText: () => void;
  onCopyPageImage: () => void;
  onAskAi: () => void;
  onCopySelectedText?: () => void;
  onAttachTextToAi?: (text: string) => void;
  hasSelectedText?: boolean;
  hitAnnotation?: Annotation | null;
  onCopyAnnotationText?: (ann: Annotation) => void;
  onCopyAnnotationImage?: (ann: Annotation) => void;
  onDeleteAnnotation?: (id: string) => void;
}

export const PageContextMenu: React.FC<PageContextMenuProps> = ({
  position,
  onClose,
  onAddPageBelow,
  onDeletePage,
  onCopyPageText,
  onCopyPageImage,
  onAskAi,
  onCopySelectedText,
  onAttachTextToAi,
  hasSelectedText = false,
  hitAnnotation = null,
  onCopyAnnotationText,
  onCopyAnnotationImage,
  onDeleteAnnotation,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = () => onClose();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const run = (action: () => void) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClose();
    action();
  };

  const itemClass = 'page-context-menu__item';

  const getCopyAnnotationTextLabel = () => {
    if (!hitAnnotation) return 'Copy highlight text';
    if (hitAnnotation.type === 'ai-explanation') return 'Copy AI response';
    if (hitAnnotation.type === 'text-note') return 'Copy note text';
    if (hitAnnotation.type === 'image') return 'Copy image name/text';
    return 'Copy highlight text';
  };

  const getDeleteAnnotationLabel = () => {
    if (!hitAnnotation) return 'Delete highlight';
    if (hitAnnotation.type === 'ai-explanation') return 'Delete AI box';
    if (hitAnnotation.type === 'text-note') return 'Delete note';
    if (hitAnnotation.type === 'image') return 'Delete image';
    return 'Delete highlight';
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context actions"
      className="page-context-menu"
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* 1. Highlight / Annotation specific actions */}
      {hitAnnotation && (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={run(() => onCopyAnnotationText?.(hitAnnotation))}
          >
            <span className="page-context-menu__icon" aria-hidden="true">
              <Copy />
            </span>
            <span>{getCopyAnnotationTextLabel()}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={run(() => onCopyAnnotationImage?.(hitAnnotation))}
          >
            <span className="page-context-menu__icon" aria-hidden="true">
              <Image />
            </span>
            <span>Copy region as image</span>
          </button>
          {onDeleteAnnotation && (
            <button
              type="button"
              role="menuitem"
              className={`${itemClass} page-context-menu__item--destructive`}
              onClick={run(() => onDeleteAnnotation(hitAnnotation.id))}
            >
              <span className="page-context-menu__icon" aria-hidden="true">
                <Trash2 />
              </span>
              <span>{getDeleteAnnotationLabel()}</span>
            </button>
          )}
          {onAttachTextToAi && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={run(() => {
                const text = getAnnotationCoveredText(hitAnnotation);
                if (text) onAttachTextToAi(text);
              })}
            >
              <span className="page-context-menu__icon" aria-hidden="true">
                <SparkleIcon />
              </span>
              <span>Attach highlight to AI prompt</span>
            </button>
          )}
          <div className="page-context-menu__separator" role="separator" />
        </>
      )}

      {/* 2. Text selection action */}
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        disabled={!hasSelectedText}
        onClick={hasSelectedText && onCopySelectedText ? run(onCopySelectedText) : undefined}
      >
        <span className="page-context-menu__icon" aria-hidden="true">
          <Copy />
        </span>
        <span>Copy text</span>
      </button>
      {hasSelectedText && onAttachTextToAi && (
        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={run(() => {
            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : '';
            if (text) onAttachTextToAi(text);
          })}
        >
          <span className="page-context-menu__icon" aria-hidden="true">
            <SparkleIcon />
          </span>
          <span>Attach selection to AI prompt</span>
        </button>
      )}

      {/* 3. Page level actions */}
      <button type="button" role="menuitem" className={itemClass} onClick={run(onCopyPageText)}>
        <span className="page-context-menu__icon" aria-hidden="true">
          <FileText />
        </span>
        <span>Copy page text</span>
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={run(onCopyPageImage)}>
        <span className="page-context-menu__icon" aria-hidden="true">
          <Image />
        </span>
        <span>Copy page as image</span>
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={run(onAskAi)}>
        <span className="page-context-menu__icon" aria-hidden="true">
          <SparkleIcon />
        </span>
        <span>Ask AI about this page</span>
      </button>
      <div className="page-context-menu__separator" role="separator" />
      <button type="button" role="menuitem" className={itemClass} onClick={run(onAddPageBelow)}>
        <span className="page-context-menu__icon" aria-hidden="true">
          <FilePlus />
        </span>
        <span>Add page below</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className={`${itemClass} page-context-menu__item--destructive`}
        onClick={run(onDeletePage)}
      >
        <span className="page-context-menu__icon" aria-hidden="true">
          <Trash2 />
        </span>
        <span>Delete page</span>
      </button>
    </div>
  );
};
