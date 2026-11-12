import { useState } from 'react';
import { Code2, Bug, CircleUserRound, ArrowUpRight, RefreshCw, CheckCircle2 } from 'lucide-react';
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
    <div className="flex h-full min-h-0 flex-1 flex-col justify-between gap-2.5">
      {/* Hero Card Rectangle with Rounded Borders */}
      <div className="flex min-h-0 flex-1 items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--workspace)] p-6 shadow-2xs">
        <div className="flex flex-col justify-center">
          <h1 className="text-4xl leading-none font-black tracking-tight text-[var(--foreground)] sm:text-5xl">
            Cinnabar
          </h1>
          <div className="mt-2.5">
            <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--muted-foreground)]">
              Version 0.1.0
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end justify-center gap-1.5">
          <button
            type="button"
            onClick={handleCheckForUpdates}
            disabled={updateStatus === 'checking'}
            className="btn-secondary flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-2xs transition-all hover:bg-[var(--secondary)]"
          >
            {updateStatus === 'checking' ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />
                <span>Checking…</span>
              </>
            ) : updateStatus === 'latest' ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-emerald-500">Up to date</span>
              </>
            ) : (
              <span>Check for Updates</span>
            )}
          </button>
          <span className="text-[10px] font-medium text-[var(--muted-foreground)]">
            Last checked: {lastUpdateDate}
          </span>
        </div>
      </div>

      {/* Row of 3 Centered Small Boxes */}
      <div className="grid shrink-0 grid-cols-3 gap-2.5">
        <a
          href="https://github.com/notenderdreams/PDFuck"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            void openExternalUrl('https://github.com/notenderdreams/PDFuck');
          }}
          className="group relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--workspace)] p-3.5 text-center shadow-2xs transition-all hover:-translate-y-0.5 hover:border-[var(--muted-foreground)]/30 hover:bg-[var(--secondary)]"
        >
          <ArrowUpRight className="absolute top-2.5 right-2.5 h-3.5 w-3.5 text-[var(--subtle-foreground)] transition-colors group-hover:text-[var(--foreground)]" />
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)] transition-all group-hover:border-[var(--primary)]/30 group-hover:text-[var(--primary)]">
            <Code2 className="h-4 w-4" />
          </div>
          <div>
            <span className="block text-xs font-semibold text-[var(--foreground)] transition-colors group-hover:text-[var(--primary)]">
              Repository
            </span>
            <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
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
          className="group relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--workspace)] p-3.5 text-center shadow-2xs transition-all hover:-translate-y-0.5 hover:border-[var(--muted-foreground)]/30 hover:bg-[var(--secondary)]"
        >
          <ArrowUpRight className="absolute top-2.5 right-2.5 h-3.5 w-3.5 text-[var(--subtle-foreground)] transition-colors group-hover:text-[var(--foreground)]" />
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)] transition-all group-hover:border-[var(--primary)]/30 group-hover:text-[var(--primary)]">
            <Bug className="h-4 w-4" />
          </div>
          <div>
            <span className="block text-xs font-semibold text-[var(--foreground)] transition-colors group-hover:text-[var(--primary)]">
              Feedback
            </span>
            <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
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
          className="group relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--workspace)] p-3.5 text-center shadow-2xs transition-all hover:-translate-y-0.5 hover:border-[var(--muted-foreground)]/30 hover:bg-[var(--secondary)]"
        >
          <ArrowUpRight className="absolute top-2.5 right-2.5 h-3.5 w-3.5 text-[var(--subtle-foreground)] transition-colors group-hover:text-[var(--foreground)]" />
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)] transition-all group-hover:border-[var(--primary)]/30 group-hover:text-[var(--primary)]">
            <CircleUserRound className="h-4 w-4" />
          </div>
          <div>
            <span className="block text-xs font-semibold text-[var(--foreground)] transition-colors group-hover:text-[var(--primary)]">
              Creator
            </span>
            <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
              @notenderdreams
            </span>
          </div>
        </a>
      </div>
    </div>
  );
}
