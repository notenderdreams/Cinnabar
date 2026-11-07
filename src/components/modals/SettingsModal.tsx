import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Sliders,
  Palette,
  Keyboard,
  Info,
} from 'lucide-react';
import type { ReadingTheme, ThemeSettings, ViewMode } from '../../lib/types/index';
import {
  getAiProviderStatus,
  setAiProviderPreference,
  type AiProviderStatus,
} from '../../utils/tauriBridge';

import { SparkleIcon } from '../icons/SparkleIcon';
import { GeneralTab } from '../settings/GeneralTab';
import { AppearanceTab } from '../settings/AppearanceTab';
import { AiTab } from '../settings/AiTab';
import { ShortcutsTab } from '../settings/ShortcutsTab';
import { AboutTab } from '../settings/AboutTab';

export type SettingsTab = 'general' | 'appearance' | 'ai' | 'shortcuts' | 'about';

// Supported view modes for reader layout:
// { id: 'spread' as ViewMode, label: 'Side by Side' }
// Mouse & Gesture shortcuts documented in settings:
// 'Double Click': 'Highlight / Remove Word Highlight'
// 'Triple Click': 'Highlight / Remove Line Highlight'

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Theme & Appearance
  themeSettings?: ThemeSettings;
  onSelectTheme?: (theme: ReadingTheme) => void;
  onUpdateThemeSetting?: <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => void;
  onResetThemeFilters?: () => void;
  // View mode
  viewMode?: ViewMode;
  onChangeViewMode?: (mode: ViewMode) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  themeSettings,
  onSelectTheme,
  onUpdateThemeSetting,
  onResetThemeFilters,
  viewMode,
  onChangeViewMode,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // AI Provider status state
  const [aiStatus, setAiStatus] = useState<AiProviderStatus | null>(null);
  const [isLoadingAiStatus, setIsLoadingAiStatus] = useState(false);
  const [, setIsUpdatingProvider] = useState(false);

  const fetchAiStatus = useCallback(async () => {
    setIsLoadingAiStatus(true);
    try {
      const res = await getAiProviderStatus();
      setAiStatus(res);
    } catch (err) {
      console.warn('Failed to fetch AI provider status:', err);
    } finally {
      setIsLoadingAiStatus(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'ai') {
      void fetchAiStatus();
    }
  }, [isOpen, activeTab, fetchAiStatus]);

  const handleSelectProvider = async (providerId: string, executablePath?: string | null) => {
    setIsUpdatingProvider(true);
    try {
      const res = await setAiProviderPreference(providerId, executablePath ?? null);
      setAiStatus(res);
    } catch (err) {
      console.warn('Failed to set AI provider preference:', err);
    } finally {
      setIsUpdatingProvider(false);
    }
  };

  // Handle ESC key for closing modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const NAV_ITEMS: { id: SettingsTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'general', label: 'General', icon: Sliders },
    { id: 'appearance', label: 'Reading & Theme', icon: Palette },
    { id: 'ai', label: 'AI Assistant', icon: SparkleIcon },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
    { id: 'about', label: 'About', icon: Info },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
    >
      <div
        className="w-full max-w-2xl h-[500px] max-h-[90vh] bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex p-1.5 gap-2 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Segmented Navigation Sidebar (Cutout Inset Panel) */}
        <aside className="w-44 flex flex-col shrink-0 select-none macos-sidebar bg-[var(--workspace)] border border-[var(--border)] rounded-xl p-1.5 shadow-xs overflow-hidden">
          {/* Sidebar Title Header */}
          <div className="h-8 px-2 flex items-center shrink-0">
            <h2 id="settings-dialog-title" className="text-xs font-semibold text-[var(--foreground)] tracking-tight">
              Settings
            </h2>
          </div>

          {/* Navigation Items */}
          <div className="flex flex-col gap-0.5 flex-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isSelected = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white font-semibold shadow-xs'
                      : 'text-zinc-400 hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-zinc-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Main Option View */}
        <div className="flex-1 relative flex flex-col min-w-0 min-h-0 bg-transparent overflow-hidden">
          {/* Close Button at top-right */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-2.5 right-2.5 z-10 w-6.5 h-6.5 rounded-md flex items-center justify-center text-zinc-400 hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
            title="Close Settings (Esc)"
            aria-label="Close Settings"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          <main className={`flex-1 overflow-y-auto flex flex-col text-xs text-[var(--foreground)] ${activeTab === 'about' ? 'p-0' : 'p-3.5 pr-8 gap-4'}`}>
            {activeTab === 'general' && (
              <GeneralTab viewMode={viewMode} onChangeViewMode={onChangeViewMode} />
            )}

            {activeTab === 'appearance' && (
              <AppearanceTab
                themeSettings={themeSettings}
                onSelectTheme={onSelectTheme}
                onUpdateThemeSetting={onUpdateThemeSetting}
                onResetThemeFilters={onResetThemeFilters}
              />
            )}

            {activeTab === 'ai' && (
              <AiTab
                aiStatus={aiStatus}
                isLoadingAiStatus={isLoadingAiStatus}
                onRefreshAiStatus={fetchAiStatus}
                onSelectProvider={handleSelectProvider}
              />
            )}

            {activeTab === 'shortcuts' && <ShortcutsTab />}

            {activeTab === 'about' && <AboutTab />}
          </main>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
