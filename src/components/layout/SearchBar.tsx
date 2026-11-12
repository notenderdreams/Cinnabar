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
  const [isPending, setIsPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
    setQuery('');
    setIsPending(false);
    onSearch('');
  }, [isOpen, onSearch]);

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
    onSearch('');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (!val.trim()) {
      debounceTimerRef.current = null;
      setIsPending(false);
      return;
    }
    setIsPending(true);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      setIsPending(false);
      onSearch(val);
    }, 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        setIsPending(false);
        onSearch(query);
        return;
      }
      if (isSearching) return;
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
    <div
      role="search"
      aria-label="Search document"
      className="pdf-search-bar animate-slide-down fixed top-13 right-4 z-40 rounded-2xl border border-[var(--border)] bg-[var(--popover)] p-1.5 text-xs shadow-2xl"
    >
      <div className="pdf-search-field control-field flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-2.5 py-1">
        <Search className="h-3.5 w-3.5 text-zinc-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Find in document..."
          aria-label="Find in document"
          className="min-w-0 flex-1 border-0 bg-transparent font-sans text-xs text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none"
        />
        <span className="pdf-search-spinner" aria-hidden="true">
          {(isSearching || isPending) && <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />}
        </span>
      </div>

      <span
        role="status"
        aria-live="polite"
        className="pdf-search-status px-1 font-mono text-[11px] font-medium text-[var(--muted-foreground)]"
      >
        {isSearching || isPending
          ? 'Searching…'
          : searchResults.length > 0
            ? `${currentMatchIndex + 1}/${searchResults.length}`
            : query.trim()
              ? 'No matches'
              : null}
      </span>

      <div className="flex items-center gap-0.5">
        <button
          onClick={onPrev}
          disabled={isSearching || isPending || searchResults.length === 0}
          aria-label="Previous match"
          className="btn-icon h-6.5 w-6.5 disabled:cursor-not-allowed disabled:opacity-30"
          title="Previous match (Shift+Enter)"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onNext}
          disabled={isSearching || isPending || searchResults.length === 0}
          aria-label="Next match"
          className="btn-icon h-6.5 w-6.5 disabled:cursor-not-allowed disabled:opacity-30"
          title="Next match (Enter)"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onClose}
          className="btn-icon ml-0.5 h-6.5 w-6.5"
          title="Close search (Esc)"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
