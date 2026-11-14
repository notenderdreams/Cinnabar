import { useState } from 'react';
import { ChevronRight, Folder, Trash2 } from 'lucide-react';
import type { LibraryFolderNode } from '../../lib/library/folderTree';

interface Props {
  node: LibraryFolderNode;
  activeFilter: string;
  onSelect: (id: string) => void;
  onRemove: (id: string, event: React.MouseEvent) => void;
}

export function LibraryFolderBranch({ node, activeFilter, onSelect, onRemove }: Props) {
  const [expanded, setExpanded] = useState(false);
  const selected = activeFilter === node.id;
  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-lg px-1 py-1 text-xs ${selected ? 'bg-blue-500/15 font-semibold text-blue-400' : 'text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5'}`}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 rounded p-1"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <button
          type="button"
          aria-current={selected ? 'page' : undefined}
          title={node.path}
          onClick={() => onSelect(node.id)}
          className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
        >
          <Folder className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-medium">{node.name}</span>
          <span className="library-folder-count font-mono text-[10px] text-zinc-500">
            {node.count}
          </span>
        </button>
        {node.id === node.rootId ? (
          <button
            type="button"
            onClick={(event) => onRemove(node.id, event)}
            className="library-folder-action rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400 focus:opacity-100"
            title="Remove folder from library"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        ) : (
          <span className="library-folder-action" aria-hidden="true" />
        )}
      </div>
      {expanded && node.children.length > 0 && (
        <ul className="ml-3 flex flex-col gap-1">
          {node.children.map((child) => (
            <LibraryFolderBranch
              key={child.id}
              node={child}
              activeFilter={activeFilter}
              onSelect={onSelect}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
