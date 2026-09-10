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
import type { Annotation } from '../utils/types';
import { exportAnnotatedPDF, savePdfFile } from '../utils/pdfExporter';
import {
  openAnnotationsJsonFile,
  parseAnnotationsJson,
  exportAnnotationsJson,
} from '../utils/annotationTransfer';

interface ExportModalProps {
  isOpen: boolean;
  rawPdfBytes: Uint8Array | null;
  annotations: Annotation[];
  fileName: string;
  currentPage: number;
  onClose: () => void;
  onImportAnnotations?: (imported: Annotation[], mode: 'replace' | 'merge') => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  rawPdfBytes,
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
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to import annotations file.'
      );
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
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to export annotations file.'
      );
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
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to export modified PDF file.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Export Current Page as Image
  const handleExportPagePng = () => {
    if (!hasOpenPdf) return;
    try {
      const pageEl = document.getElementById(`pdf-page-${currentPage}`);
      if (!pageEl) return;

      const canvas = pageEl.querySelector('canvas');
      if (!canvas) return;

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${fileName.replace(/\.pdf$/i, '')}_page_${currentPage}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

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
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in text-xs">
      <div className="w-full max-w-md bg-[var(--popover)] border border-[var(--border)] rounded-2xl p-5 shadow-2xl flex flex-col gap-4 animate-slide-down">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h3 className="text-sm font-semibold text-zinc-100 tracking-tight flex items-center gap-1.5">
              <FileOutput className="w-4 h-4 text-blue-500" />
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
            className="btn-icon w-7 h-7 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Alert */}
        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-2 animate-slide-down">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-medium">{successMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center gap-2 animate-slide-down">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Option Group 1: Import */}
        <div className="flex flex-col gap-2">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400 px-1 pt-1">
            Import
          </div>

          {/* Option: Import Annotations */}
          <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/15 transition-all">
            <div className="flex items-center justify-between">
              <button
                onClick={handleImportJson}
                disabled={isProcessing}
                className="flex items-center gap-3 text-left flex-1 cursor-pointer group"
              >
                <div className="w-8.5 h-8.5 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-blue-500 shadow-xs group-hover:scale-105 transition-transform">
                  <FileInput className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-zinc-100 group-hover:text-white text-xs flex items-center gap-1.5">
                    Import Annotations
                  </span>
                  <span className="text-[10.5px] text-zinc-400 leading-tight">
                    Load shared highlights, notes & drawings
                  </span>
                </div>
              </button>
              {isProcessing ? (
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
              ) : (
                <FileInput className="w-4 h-4 text-blue-400/80 shrink-0" />
              )}
            </div>

            {hasOpenPdf && annotations.length > 0 && (
              <label className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-blue-500/20 text-[10.5px] text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={mergeMode}
                  onChange={(e) => setMergeMode(e.target.checked)}
                  className="rounded border-[var(--border)] text-blue-500 focus:ring-blue-500 focus:ring-offset-0 bg-[var(--card)] cursor-pointer"
                />
                <span>Merge with existing {annotations.length} annotation{annotations.length === 1 ? '' : 's'} (uncheck to replace)</span>
              </label>
            )}
          </div>
        </div>

        {/* Option Group 2: Export Options (Only visible when a PDF is opened) */}
        {hasOpenPdf && (
          <div className="flex flex-col gap-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400 px-1 pt-1">
              Export
            </div>

            {/* Option: Export Annotations */}
            <button
              onClick={handleExportJson}
              disabled={isProcessing}
              className="p-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--card)] text-left flex items-center justify-between group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8.5 h-8.5 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-emerald-500 shadow-xs group-hover:scale-105 transition-transform">
                  <FileOutput className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-zinc-200 group-hover:text-zinc-100 text-xs">
                    Export Annotations
                  </span>
                  <span className="text-[10.5px] text-zinc-400 leading-tight">
                    Save {annotations.length} annotation{annotations.length === 1 ? '' : 's'} to a portable backup file
                  </span>
                </div>
              </div>
              <FileOutput className="w-4 h-4 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
            </button>

            {/* Option: Flattened PDF */}
            <button
              onClick={handleExportBakedPdf}
              disabled={isProcessing || !rawPdfBytes}
              className="p-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--card)] text-left flex items-center justify-between group transition-all disabled:opacity-50 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8.5 h-8.5 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-amber-500 shadow-xs group-hover:scale-105 transition-transform">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-zinc-200 group-hover:text-zinc-100 text-xs">
                    Save Modified PDF
                  </span>
                  <span className="text-[10.5px] text-zinc-400 leading-tight">
                    {(() => {
                      const count = annotations.filter(
                        (a) =>
                          a.type !== 'ai-explanation' &&
                          (a.type !== 'text-note' || (a as { kind?: string }).kind === 'plain')
                      ).length;
                      return count > 0
                        ? `Bakes ${count} annotation${count === 1 ? '' : 's'} (highlights, text & drawings) into a PDF`
                        : 'Bakes highlights, text & drawings permanently into a PDF';
                    })()}
                  </span>
                </div>
              </div>
              <FileDown className="w-4 h-4 text-zinc-400 group-hover:text-amber-400 transition-colors" />
            </button>

            {/* Option: Page Snapshot */}
            <button
              onClick={handleExportPagePng}
              disabled={isProcessing}
              className="p-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--card)] text-left flex items-center justify-between group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8.5 h-8.5 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-purple-500 shadow-xs group-hover:scale-105 transition-transform">
                  <FileImage className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-zinc-200 group-hover:text-zinc-100 text-xs">
                    Export Page Snapshot (Page {currentPage})
                  </span>
                  <span className="text-[10.5px] text-zinc-400 leading-tight">
                    High-res image snapshot of active page
                  </span>
                </div>
              </div>
              <FileDown className="w-4 h-4 text-zinc-400 group-hover:text-purple-400 transition-colors" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExportModal;
