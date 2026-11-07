import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronUp, ChevronDown, X, Loader2 } from 'lucide-react';
import type { SearchMatch } from '../../lib/types/index';

interface SearchBarProps {
  isOpen: boolean;
  isSearching: boolean;
  searchResults: SearchMatch[];
  currentMatchIndex: number;
  onSearch: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  isOpen,
  isSearching,
  searchResults,
  currentMatchIndex,
  onSearch,
  onNext,
  onPrev,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (!val.trim()) {
      onSearch('');
      return;
    }
    debounceTimerRef.current = setTimeout(() => {
      onSearch(val);
    }, 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        onSearch(query);
      }
      if (e.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="fixed top-13 right-4 z-40 flex items-center gap-2 p-1.5 rounded-2xl bg-[var(--popover)] border border-[var(--border)] shadow-2xl animate-slide-down text-xs">
      <div className="control-field flex items-center gap-2 px-2.5 py-1 bg-[var(--secondary)] rounded-lg border border-[var(--border)]">
        <Search className="w-3.5 h-3.5 text-zinc-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Find in document..."
          className="bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 border-0 outline-none w-44 font-sans"
        />
        {isSearching && <Loader2 className="w-3 h-3 text-zinc-400 animate-spin" />}
      </div>

      {searchResults.length > 0 ? (
        <span className="text-[11px] font-mono text-zinc-300 px-1 font-medium">
          {currentMatchIndex + 1}/{searchResults.length}
        </span>
      ) : query ? (
        <span className="text-[11px] text-zinc-500 px-1">0 results</span>
      ) : null}

      <div className="flex items-center gap-0.5">
        <button
          onClick={onPrev}
          disabled={searchResults.length === 0}
          className="btn-icon w-6.5 h-6.5 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Previous match (Shift+Enter)"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onNext}
          disabled={searchResults.length === 0}
          className="btn-icon w-6.5 h-6.5 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next match (Enter)"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onClose}
          className="btn-icon w-6.5 h-6.5 ml-0.5"
          title="Close search (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
