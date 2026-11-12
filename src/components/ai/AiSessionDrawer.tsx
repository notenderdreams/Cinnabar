import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, MessageSquare, Clock } from 'lucide-react';
import type { AiChatSession } from '../../lib/types/index';

interface AiSessionDrawerProps {
  isOpen: boolean;
  sessions: AiChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onClose: () => void;
}

export const AiSessionDrawer: React.FC<AiSessionDrawerProps> = ({
  isOpen,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onClose,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');

  if (!isOpen) return null;

  const startRename = (session: AiChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditingTitle(session.title);
  };

  const saveRename = (id: string, e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation();
    onRenameSession(id, editingTitle);
    setEditingId(null);
  };

  return (
    <div className="animate-fade-in absolute inset-0 z-30 flex flex-col bg-[var(--background)]/95 backdrop-blur-md select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] p-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-blue-500" />
          <span className="text-xs font-semibold text-[var(--foreground)]">Chat Sessions</span>
          <span className="rounded-full bg-zinc-500/10 px-1.5 py-0.5 text-[10px] text-zinc-400">
            {sessions.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              onNewSession();
              onClose();
            }}
            className="flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500"
            title="Start new chat session"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Chat</span>
          </button>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
            title="Close sessions view"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sessions List */}
      <div className="custom-scrollbar flex-1 space-y-1.5 overflow-y-auto p-2">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          const isEditing = editingId === session.id;
          const formattedDate = new Date(session.updatedAt).toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
          });

          return (
            <div
              key={session.id}
              onClick={() => {
                onSelectSession(session.id);
                onClose();
              }}
              className={`group flex cursor-pointer items-center justify-between rounded-xl border p-2.5 text-xs transition-all ${
                isActive
                  ? 'border-blue-500/30 bg-blue-500/10 text-blue-500 dark:text-blue-400'
                  : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-zinc-500/40'
              }`}
            >
              <div className="min-w-0 flex-1 pr-2">
                {isEditing ? (
                  <form
                    onSubmit={(e) => saveRename(session.id, e)}
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      autoFocus
                      className="w-full rounded border border-blue-500 bg-[var(--background)] px-2 py-0.5 text-xs text-[var(--foreground)] focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="p-1 text-emerald-400 hover:text-emerald-300"
                      title="Save"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(null);
                      }}
                      className="p-1 text-zinc-400 hover:text-zinc-300"
                      title="Cancel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="truncate font-medium">{session.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                      <span>{session.messages.length} messages</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {formattedDate}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {!isEditing && (
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => startRename(session, e)}
                    className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                    title="Rename session"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="rounded p-1 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                    title="Delete session"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
