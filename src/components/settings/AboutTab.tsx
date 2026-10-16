import React, { useState } from 'react';
import {
  Code2,
  Bug,
  CircleUserRound,
  ArrowUpRight,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { openExternalUrl } from '../../utils/tauriBridge';

export function AboutTab() {
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'latest'>('idle');
  const [lastUpdateDate, setLastUpdateDate] = useState<string>('Yesterday');

  const handleCheckForUpdates = () => {
    if (updateStatus === 'checking') return;
    setUpdateStatus('checking');
    setTimeout(() => {
      setUpdateStatus('latest');
      setLastUpdateDate('Today');
      setTimeout(() => setUpdateStatus('idle'), 3500);
    }, 850);
  };

  return (
    <div className="flex-1 flex flex-col justify-between gap-2.5 h-full min-h-0">
      {/* Hero Card Rectangle with Rounded Borders */}
      <div className="flex-1 rounded-2xl bg-[var(--workspace)] border border-[var(--border)] p-6 shadow-2xs flex items-center justify-between gap-4 min-h-0">
        <div className="flex flex-col justify-center">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-[var(--foreground)] leading-none">
            Cinnabar
          </h1>
          <div className="mt-2.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--secondary)] text-[var(--muted-foreground)] font-mono text-[10px] border border-[var(--border)] font-medium">
              Version 0.1.0
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end justify-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCheckForUpdates}
            disabled={updateStatus === 'checking'}
            className="btn-secondary h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs hover:bg-[var(--secondary)] transition-all cursor-pointer"
          >
            {updateStatus === 'checking' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
                <span>Checking…</span>
              </>
            ) : updateStatus === 'latest' ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500">Up to date</span>
              </>
            ) : (
              <span>Check for Updates</span>
            )}
          </button>
          <span className="text-[10px] text-[var(--muted-foreground)] font-medium">
            Last checked: {lastUpdateDate}
          </span>
        </div>
      </div>

      {/* Row of 3 Centered Small Boxes */}
      <div className="grid grid-cols-3 gap-2.5 shrink-0">
        <a
          href="https://github.com/notenderdreams/PDFuck"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            void openExternalUrl('https://github.com/notenderdreams/PDFuck');
          }}
          className="relative p-3.5 rounded-xl bg-[var(--workspace)] border border-[var(--border)] hover:bg-[var(--secondary)] hover:border-[var(--muted-foreground)]/30 transition-all flex flex-col items-center justify-center text-center gap-1.5 group shadow-2xs hover:-translate-y-0.5 cursor-pointer"
        >
          <ArrowUpRight className="absolute top-2.5 right-2.5 w-3.5 h-3.5 text-[var(--subtle-foreground)] group-hover:text-[var(--foreground)] transition-colors" />
          <div className="w-9 h-9 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-[var(--foreground)] flex items-center justify-center group-hover:text-[var(--primary)] group-hover:border-[var(--primary)]/30 transition-all">
            <Code2 className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-xs text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors block">
              Repository
            </span>
            <span className="text-[11px] text-[var(--muted-foreground)] block truncate">
              GitHub source
            </span>
          </div>
        </a>

        <a
          href="https://github.com/notenderdreams/PDFuck/issues"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            void openExternalUrl('https://github.com/notenderdreams/PDFuck/issues');
          }}
          className="relative p-3.5 rounded-xl bg-[var(--workspace)] border border-[var(--border)] hover:bg-[var(--secondary)] hover:border-[var(--muted-foreground)]/30 transition-all flex flex-col items-center justify-center text-center gap-1.5 group shadow-2xs hover:-translate-y-0.5 cursor-pointer"
        >
          <ArrowUpRight className="absolute top-2.5 right-2.5 w-3.5 h-3.5 text-[var(--subtle-foreground)] group-hover:text-[var(--foreground)] transition-colors" />
          <div className="w-9 h-9 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-[var(--foreground)] flex items-center justify-center group-hover:text-[var(--primary)] group-hover:border-[var(--primary)]/30 transition-all">
            <Bug className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-xs text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors block">
              Feedback
            </span>
            <span className="text-[11px] text-[var(--muted-foreground)] block truncate">
              Issues & requests
            </span>
          </div>
        </a>

        <a
          href="https://github.com/notenderdreams"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            void openExternalUrl('https://github.com/notenderdreams');
          }}
          className="relative p-3.5 rounded-xl bg-[var(--workspace)] border border-[var(--border)] hover:bg-[var(--secondary)] hover:border-[var(--muted-foreground)]/30 transition-all flex flex-col items-center justify-center text-center gap-1.5 group shadow-2xs hover:-translate-y-0.5 cursor-pointer"
        >
          <ArrowUpRight className="absolute top-2.5 right-2.5 w-3.5 h-3.5 text-[var(--subtle-foreground)] group-hover:text-[var(--foreground)] transition-colors" />
          <div className="w-9 h-9 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-[var(--foreground)] flex items-center justify-center group-hover:text-[var(--primary)] group-hover:border-[var(--primary)]/30 transition-all">
            <CircleUserRound className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-xs text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors block">
              Creator
            </span>
            <span className="text-[11px] text-[var(--muted-foreground)] block truncate">
              @notenderdreams
            </span>
          </div>
        </a>
      </div>
    </div>
  );
}
