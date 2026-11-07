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
    <div className="absolute inset-0 z-30 flex flex-col bg-[var(--background)]/95 backdrop-blur-md animate-fade-in select-none">
      {/* Header */}
      <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-semibold text-[var(--foreground)]">Chat Sessions</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400">
            {sessions.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              onNewSession();
              onClose();
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition-colors"
            title="Start new chat session"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-white/10 text-zinc-400 hover:text-zinc-200"
            title="Close sessions view"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
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
              className={`group flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                isActive
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-500 dark:text-blue-400'
                  : 'bg-[var(--card)] border-[var(--border)] hover:border-zinc-500/40 text-[var(--foreground)]'
              }`}
            >
              <div className="flex-1 min-w-0 pr-2">
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
                      className="w-full bg-[var(--background)] px-2 py-0.5 text-xs rounded border border-blue-500 text-[var(--foreground)] focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="p-1 text-emerald-400 hover:text-emerald-300"
                      title="Save"
                    >
                      <Check className="w-3.5 h-3.5" />
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
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="font-medium truncate">{session.title}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
                      <span>{session.messages.length} messages</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {formattedDate}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {!isEditing && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => startRename(session, e)}
                    className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200"
                    title="Rename session"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="p-1 rounded hover:bg-red-500/10 text-zinc-400 hover:text-red-400"
                    title="Delete session"
                  >
                    <Trash2 className="w-3 h-3" />
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
