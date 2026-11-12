import { saveImageFile } from '../../utils/tauriBridge';
import React, { useState, useEffect } from 'react';
import {
  X,
  FileInput,
  FileOutput,
  FileText,
  FileImage,
  FileDown,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { Annotation } from '../../lib/types/index';
import { exportAnnotatedPDF, savePdfFile } from '../../lib/pdf/pdfExporter';
import {
  openAnnotationsJsonFile,
  parseAnnotationsJson,
  exportAnnotationsJson,
} from '../../lib/annotations/annotationTransfer';

interface ExportModalProps {
  isOpen: boolean;
  getPdfBytes: () => Uint8Array | null;
  annotations: Annotation[];
  fileName: string;
  currentPage: number;
  onClose: () => void;
  onImportAnnotations?: (imported: Annotation[], mode: 'replace' | 'merge') => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  getPdfBytes,
  annotations,
  fileName,
  currentPage,
  onClose,
  onImportAnnotations,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mergeMode, setMergeMode] = useState<boolean>(false);
  const rawPdfBytes = getPdfBytes();

  const hasOpenPdf = Boolean(rawPdfBytes);

  useEffect(() => {
    if (!isOpen) {
      setSuccessMessage(null);
      setErrorMessage(null);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing, isOpen, onClose]);

  if (!isOpen) return null;

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 50,
        spread: 45,
        origin: { y: 0.7 },
        colors: ['#007aff', '#a1a1aa', '#71717a'],
      });
    } catch {}
  };

  // 1. Import Annotations
  const handleImportJson = async () => {
    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const fileData = await openAnnotationsJsonFile();
      if (!fileData) {
        // User cancelled picker or already in-flight
        setIsProcessing(false);
        return;
      }

      const imported = parseAnnotationsJson(fileData.content);
      if (!onImportAnnotations) {
        throw new Error('Annotation import handler not available.');
      }

      const mode = mergeMode ? 'merge' : 'replace';
      onImportAnnotations(imported, mode);
      triggerConfetti();

      const actionText =
        mode === 'merge'
          ? `Merged ${imported.length} annotations!`
          : `Imported ${imported.length} annotations!`;
      setSuccessMessage(actionText);

      setTimeout(() => {
        onClose();
        setSuccessMessage(null);
      }, 1400);
    } catch (err: unknown) {
      console.error('Import error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to import annotations file.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Export Annotations
  const handleExportJson = async () => {
    if (!hasOpenPdf) return;
    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const baseName = fileName.replace(/\.pdf$/i, '');
      const exportName = `${baseName}_annotations.json`;
      const result = await exportAnnotationsJson(annotations, exportName);
      if (result.success) {
        triggerConfetti();
        setSuccessMessage(`Saved annotations to ${exportName}!`);
        setTimeout(() => {
          onClose();
          setSuccessMessage(null);
        }, 1400);
      }
    } catch (err: unknown) {
      console.error('Export error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to export annotations file.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Save Flattened / Baked PDF
  const handleExportBakedPdf = async () => {
    if (!rawPdfBytes) return;
    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const outputBytes = await exportAnnotatedPDF(rawPdfBytes, annotations);
      const baseName = fileName.replace(/\.pdf$/i, '');
      const exportName = `${baseName}_annotated.pdf`;

      const result = await savePdfFile(outputBytes, exportName);
      if (result.success) {
        triggerConfetti();
        setSuccessMessage(`Saved ${exportName}!`);
        setTimeout(() => {
          onClose();
          setSuccessMessage(null);
        }, 1400);
      }
    } catch (err: unknown) {
      console.error('Export PDF error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to export modified PDF file.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Export Current Page as Image
  const handleExportPagePng = async () => {
    if (!hasOpenPdf) return;
    try {
      const pageEl = document.getElementById(`pdf-page-${currentPage}`);
      if (!pageEl) return;

      const canvas = pageEl.querySelector('canvas');
      if (!canvas) return;

      const dataUrl = canvas.toDataURL('image/png');
      if (
        !(await saveImageFile(
          dataUrl,
          `${fileName.replace(/\.pdf$/i, '')}_page_${currentPage}.png`,
        ))
      )
        return;

      triggerConfetti();
      setSuccessMessage(`Exported Page ${currentPage} snapshot!`);
      setTimeout(() => {
        onClose();
        setSuccessMessage(null);
      }, 1400);
    } catch (e) {
      console.error('Failed to export image:', e);
      setErrorMessage('Failed to export page snapshot.');
    }
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 text-xs backdrop-blur-xs">
      <div className="animate-slide-down flex w-full max-w-md flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--popover)] p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-zinc-100">
              <FileOutput className="h-4 w-4 text-blue-500" />
              <span>Annotation Transfer</span>
            </h3>
            <p className="text-[11px] text-zinc-400">
              {hasOpenPdf
                ? 'Import & export annotations or save document snapshots'
                : 'Import shared annotations into your library'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="btn-icon h-7 w-7 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Feedback Alert */}
        {successMessage && (
          <div className="animate-slide-down flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-3 text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="font-medium">{successMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="animate-slide-down flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/15 p-3 text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Option Group 1: Import */}
        <div className="flex flex-col gap-2">
          <div className="px-1 pt-1 text-[10.5px] font-semibold tracking-wider text-zinc-400 uppercase">
            Import
          </div>

          {/* Option: Import Annotations */}
          <div className="flex flex-col gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 transition-all hover:bg-blue-500/15">
            <div className="flex items-center justify-between">
              <button
                onClick={handleImportJson}
                disabled={isProcessing}
                className="group flex flex-1 cursor-pointer items-center gap-3 text-left"
              >
                <div className="flex h-8.5 w-8.5 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-blue-500 shadow-xs transition-transform group-hover:scale-105">
                  <FileInput className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100 group-hover:text-white">
                    Import Annotations
                  </span>
                  <span className="text-[10.5px] leading-tight text-zinc-400">
                    Load shared highlights, notes & drawings
                  </span>
                </div>
              </button>
              {isProcessing ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-400" />
              ) : (
                <FileInput className="h-4 w-4 shrink-0 text-blue-400/80" />
              )}
            </div>

            {hasOpenPdf && annotations.length > 0 && (
              <label className="mt-1.5 flex cursor-pointer items-center gap-2 border-t border-blue-500/20 pt-1.5 text-[10.5px] text-zinc-300 select-none">
                <input
                  type="checkbox"
                  checked={mergeMode}
                  onChange={(e) => setMergeMode(e.target.checked)}
                  className="cursor-pointer rounded border-[var(--border)] bg-[var(--card)] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span>
                  Merge with existing {annotations.length} annotation
                  {annotations.length === 1 ? '' : 's'} (uncheck to replace)
                </span>
              </label>
            )}
          </div>
        </div>

        {/* Option Group 2: Export Options (Only visible when a PDF is opened) */}
        {hasOpenPdf && (
          <div className="flex flex-col gap-2">
            <div className="px-1 pt-1 text-[10.5px] font-semibold tracking-wider text-zinc-400 uppercase">
              Export
            </div>

            {/* Option: Export Annotations */}
            <button
              onClick={handleExportJson}
              disabled={isProcessing}
              className="group flex cursor-pointer items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--secondary)] p-3 text-left transition-all hover:bg-[var(--card)]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8.5 w-8.5 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-emerald-500 shadow-xs transition-transform group-hover:scale-105">
                  <FileOutput className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-zinc-200 group-hover:text-zinc-100">
                    Export Annotations
                  </span>
                  <span className="text-[10.5px] leading-tight text-zinc-400">
                    Save {annotations.length} annotation{annotations.length === 1 ? '' : 's'} to a
                    portable backup file
                  </span>
                </div>
              </div>
              <FileOutput className="h-4 w-4 text-zinc-400 transition-colors group-hover:text-emerald-400" />
            </button>

            {/* Option: Flattened PDF */}
            <button
              onClick={handleExportBakedPdf}
              disabled={isProcessing || !rawPdfBytes}
              className="group flex cursor-pointer items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--secondary)] p-3 text-left transition-all hover:bg-[var(--card)] disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8.5 w-8.5 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-amber-500 shadow-xs transition-transform group-hover:scale-105">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-zinc-200 group-hover:text-zinc-100">
                    Save Modified PDF
                  </span>
                  <span className="text-[10.5px] leading-tight text-zinc-400">
                    {(() => {
                      const count = annotations.filter(
                        (a) =>
                          a.type !== 'ai-explanation' &&
                          (a.type !== 'text-note' || (a as { kind?: string }).kind === 'plain'),
                      ).length;
                      return count > 0
                        ? `Bakes ${count} annotation${count === 1 ? '' : 's'} (highlights, text & drawings) into a PDF`
                        : 'Bakes highlights, text & drawings permanently into a PDF';
                    })()}
                  </span>
                </div>
              </div>
              <FileDown className="h-4 w-4 text-zinc-400 transition-colors group-hover:text-amber-400" />
            </button>

            {/* Option: Page Snapshot */}
            <button
              onClick={handleExportPagePng}
              disabled={isProcessing}
              className="group flex cursor-pointer items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--secondary)] p-3 text-left transition-all hover:bg-[var(--card)]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8.5 w-8.5 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-purple-500 shadow-xs transition-transform group-hover:scale-105">
                  <FileImage className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-zinc-200 group-hover:text-zinc-100">
                    Export Page Snapshot (Page {currentPage})
                  </span>
                  <span className="text-[10.5px] leading-tight text-zinc-400">
                    High-res image snapshot of active page
                  </span>
                </div>
              </div>
              <FileDown className="h-4 w-4 text-zinc-400 transition-colors group-hover:text-purple-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExportModal;
