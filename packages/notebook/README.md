# Cinnabar Notebook

Private TypeScript workspace package for structured typed notebooks. The host application supplies persistence and native file access. Paper/chrome styles live in the application's `src/index.css`.

## Public entry points

- `@cinnabar/notebook`: document types, stable block IDs, independent notebook files, validation/serialization, and session history.
- `@cinnabar/notebook/editor`: React typed editor. Supply the document, change/history callbacks, a formatting-controls host, and layout callback.
- `@cinnabar/notebook/layout`: paper metrics and visual pagination. Automatic gaps are decorations and never become saved content.
- `@cinnabar/notebook/extensions`: shared editor schema for validation and rendering.

Create a file with `createNotebook`, open its editing history with `openNotebookSession`, and apply document/title changes with `editNotebook`. Typing groups share an undo step; separate formatting actions create their own step. Undo and redo issue fresh revisions. Block IDs are retained across ordinary edits and reflow.

Portable files identify themselves as `cinnabar-notebook` version 1 and contain their own ID, title, revision, update time, structured document, appearance, and embedded image assets. `parseNotebookFile` validates before opening. A linked PDF is not required. The host currently autosaves to a separate IndexedDB database and offers portable `.cinnabar.json` save/open.

The legacy modules in `src/lib/notebook` retain annotation-format compatibility. They are not the persistence format for new independent notebooks. Existing PDF-linked notes remain untouched by opening a new notebook.

Notebook discovery lives in the host: the library has a Notebooks section, and the PDF reader has a notebook button beside Search. Both show recent notebooks and a full existing-notebook list. Selecting one in the reader keeps the PDF visible and opens the editor in the right panel. Opening a saved notebook updates its local recency metadata without changing its accepted content or revision.

The notebook workspace has no top header, bottom bar, or formatting panel. Typing autosaves; Escape returns to notebook discovery, and Cmd/Ctrl+S retains portable file saving. Settings and visible formatting controls are deferred. Ask the user before adding any UI element.

AI proposal review, source references, legacy-to-independent migration, and PDF/print export are later work. The package currently provides snapshot-based document edits and grouped history; a full anchored-operation interface is not implemented yet.

Run the repository's Bun tests and frontend checks from the root. `tests/notebookSession.test.ts` exercises independent identity, portable round-trips, validation, and history behavior.
