import React, { useState } from 'react';
import { Copy, Camera, Download, Check, FileText } from 'lucide-react';

interface PageQuickActionsProps {
  currentPage: number;
  numPages: number;
  onCopyPageText: () => void;
  onCopyPageJpg: () => void;
  onDownloadPageJpg: () => void;
}

export const PageQuickActions: React.FC<PageQuickActionsProps> = ({
  currentPage,
  numPages,
  onCopyPageText,
  onCopyPageJpg,
  onDownloadPageJpg,
}) => {
  const [copiedType, setCopiedType] = useState<'text' | 'image' | 'download' | null>(null);

  if (numPages <= 0) return null;

  const handleCopyText = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onCopyPageText();
    setCopiedType('text');
    setTimeout(() => setCopiedType(null), 1800);
  };

  const handleCopyImage = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onCopyPageJpg();
    setCopiedType('image');
    setTimeout(() => setCopiedType(null), 1800);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDownloadPageJpg();
    setCopiedType('download');
    setTimeout(() => setCopiedType(null), 1800);
  };

  return (
    <div className="fixed top-14 right-4 z-30 flex items-center gap-1 p-1 rounded-xl bg-[var(--popover)] border border-[var(--border)] shadow-xl select-none animate-slide-down text-xs">
      {/* Page indicator label */}
      <div className="flex items-center gap-1 px-2.5 py-0.5 text-zinc-400 font-mono text-[10.5px] border-r border-[var(--border)] pr-2 font-medium">
        <FileText className="w-3 h-3 text-zinc-400" />
        <span>p.{currentPage}</span>
      </div>

      {/* Button 1: Copy All Page Text */}
      <button
        onClick={handleCopyText}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-zinc-300 hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-all font-medium active:scale-96"
        title={`Extract & Copy all text from Page ${currentPage} (Cmd+Shift+C)`}
      >
        {copiedType === 'text' ? (
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-zinc-400" />
        )}
        <span>{copiedType === 'text' ? 'Copied Text' : 'Copy Text'}</span>
      </button>

      {/* Button 2: Copy Page as Image */}
      <button
        onClick={handleCopyImage}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-zinc-300 hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-all font-medium active:scale-96"
        title={`Copy Page ${currentPage} as PNG/JPG to clipboard (Cmd+Shift+J)`}
      >
        {copiedType === 'image' ? (
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <Camera className="w-3.5 h-3.5 text-zinc-400" />
        )}
        <span>{copiedType === 'image' ? 'Copied Image' : 'Copy Image'}</span>
      </button>

      {/* Button 3: Download Page as JPG */}
      <button
        onClick={handleDownload}
        className="btn-icon w-7 h-7 text-zinc-400 hover:text-white"
        title={`Download Page ${currentPage} as JPG`}
      >
        {copiedType === 'download' ? (
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <Download className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
};
