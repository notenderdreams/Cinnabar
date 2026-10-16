import React from 'react';
import { RefreshCw, Check, Cpu } from 'lucide-react';
import type { AiProviderStatus } from '../../utils/tauriBridge';

// Crisp Brand SVG Logos for AI Engines
export const AntigravityLogo: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 434 400" fill="currentColor" className={className} aria-label="Antigravity Logo">
    <path d="M392.7093,390.1367c24.1675,18.1303,60.4188,6.0436,27.1881-27.1951C320.2076,266.2475,341.3537.3393,217.4969.3393S114.7857,266.2475,15.0959,362.9416c-36.2508,36.2602,3.0207,45.3254,27.1881,27.1952,93.6484-63.4553,87.6064-175.2575,175.2129-175.2575s81.5645,111.8022,175.2124,175.2575h0Z" />
  </svg>
);

export const CodexLogo: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Codex Logo">
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829l2.02-1.1638a.0804.0804 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4022-.686zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.6069 1.4997-2.602-1.4997z" />
  </svg>
);

interface AiTabProps {
  aiStatus: AiProviderStatus | null;
  isLoadingAiStatus: boolean;
  onRefreshAiStatus: () => void;
  onSelectProvider: (providerId: string, executablePath?: string | null) => void;
}

export function AiTab({
  aiStatus,
  isLoadingAiStatus,
  onRefreshAiStatus,
  onSelectProvider,
}: AiTabProps) {
  const agyFound = aiStatus?.availableProviders?.find((p) => p.id === 'antigravity');
  const isAgySelected = aiStatus?.provider === 'antigravity';

  const codexFound = aiStatus?.availableProviders?.find((p) => p.id === 'codex');
  const isCodexSelected = aiStatus?.provider === 'codex';

  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">AI Assistant & CLI Engine</h3>
          <p className="text-zinc-400 text-[11px] leading-relaxed">
            Select which local CLI powers Cinnabar's AI explanations, math analysis, and text summaries.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefreshAiStatus}
          disabled={isLoadingAiStatus}
          className="btn-secondary flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition-all hover:bg-white/10"
          title="Rescan installed CLIs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAiStatus ? 'animate-spin text-blue-400' : 'text-zinc-400'}`} />
          <span>Rescan</span>
        </button>
      </div>

      {/* Available Provider Selector Cards */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 px-0.5">
          Select AI Engine
        </span>

        {/* 1. Antigravity CLI */}
        <div
          onClick={() => onSelectProvider('antigravity', agyFound?.executable)}
          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
            isAgySelected
              ? 'bg-blue-500/10 border-blue-500/40 shadow-xs'
              : 'bg-[var(--card)] border-[var(--border)] hover:border-zinc-500/50 hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs transition-all ${
                isAgySelected
                  ? 'bg-white text-black border border-black/10'
                  : 'bg-[var(--secondary)] text-zinc-400 border border-[var(--border)]'
              }`}
            >
              <AntigravityLogo className="w-5 h-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-[var(--foreground)]">Antigravity CLI</span>
                <span className="font-mono text-[10px] text-zinc-400">agy</span>
                {agyFound?.version && (
                  <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono text-[9px] border border-zinc-700">
                    v{agyFound.version}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-zinc-400 truncate">
                {agyFound ? agyFound.executable : 'Not detected in standard paths'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {agyFound ? (
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
                Available
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500 text-[10px] border border-zinc-700">
                Not Found
              </span>
            )}
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                isAgySelected ? 'border-blue-500 bg-blue-500 text-white' : 'border-zinc-600'
              }`}
            >
              {isAgySelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
            </div>
          </div>
        </div>

        {/* 2. Codex CLI */}
        <div
          onClick={() => onSelectProvider('codex', codexFound?.executable)}
          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
            isCodexSelected
              ? 'bg-blue-500/10 border-blue-500/40 shadow-xs'
              : 'bg-[var(--card)] border-[var(--border)] hover:border-zinc-500/50 hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs transition-all ${
                isCodexSelected
                  ? 'bg-white text-black border border-black/10'
                  : 'bg-[var(--secondary)] text-zinc-400 border border-[var(--border)]'
              }`}
            >
              <CodexLogo className="w-5 h-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-[var(--foreground)]">Codex CLI</span>
                <span className="font-mono text-[10px] text-zinc-400">codex</span>
                {codexFound?.version && (
                  <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono text-[9px] border border-zinc-700">
                    v{codexFound.version}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-zinc-400 truncate">
                {codexFound ? codexFound.executable : 'Not detected in standard paths'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {codexFound ? (
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
                Available
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500 text-[10px] border border-zinc-700">
                Not Found
              </span>
            )}
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                isCodexSelected ? 'border-blue-500 bg-blue-500 text-white' : 'border-zinc-600'
              }`}
            >
              {isCodexSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
            </div>
          </div>
        </div>
      </div>

      {/* Privacy & Sandboxing Notice */}
      <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-start gap-2 text-[11px] text-zinc-400 leading-relaxed">
        <Cpu className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
        <span>
          Cinnabar executes the selected CLI locally with{' '}
          <code className="text-zinc-300 font-mono text-[10px]">--sandbox</code> restrictions. Your PDF
          documents and prompts remain on your machine and are not indexed or stored remotely.
        </span>
      </div>

      {/* Note Stick to Bottom */}
      <div className="mt-auto pt-2 text-[11px] leading-relaxed text-zinc-400">
        <span className="font-semibold text-[var(--foreground)] mr-1.5">NOTE:</span>
        We will bring proper built-in AI integration with direct provider support and custom API keys soon.
      </div>
    </div>
  );
}
