# AGENTS.md

## Project

Cinnabar is a desktop PDF reader and annotation studio built with React 19, TypeScript, Vite, PDF.js, Tailwind CSS 4, and Tauri 2. It supports macOS, Windows, and Linux. The web build is a useful fallback and development target, but mobile is not supported.

Use Bun for all JavaScript dependency and script commands. Keep the existing Vite and Tauri setup unless the task explicitly requires an architectural change.

Keep repository automation and AI-agent configuration universal. Shared instructions and scripts must work for any agent that can read this repository and run the documented commands; keep agent-specific hooks or settings out of the project unless the user explicitly requests them.

## Commands

```sh
bun install
bun run dev                  # Tauri desktop app
bun run dev:web              # Browser build with generated bindings
bun test
bunx tsc --noEmit
bun run build:web
bun run build

cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

`bun run generate:bindings` regenerates the ignored `src/lib/bindings.ts` file. `dev:web` and `build:web` already run it.

See `DEVELOPMENT.md` when setup, build prerequisites, or release output details are needed.

## Code map

- `src/App.tsx`: application orchestration and top-level reader state.
- `src/components/`: reader, dashboard, annotation, toolbar, sidebar, settings, and AI UI.
- `src/hooks/`: stateful PDF, annotation, snippet, keyboard, theme, and AI behavior.
- `src/utils/`: PDF operations, persistence, rendering helpers, shared types, and the Tauri bridge.
- `tests/`: Bun tests for PDF behavior, persistence, rendering helpers, and state transitions.
- `src-tauri/src/app.rs`: Tauri setup and Specta export.
- `src-tauri/src/commands/`: native commands grouped by domain.
- `src-tauri/src/commands/mod.rs`: the complete native command inventory.
- `src-tauri/capabilities/`: desktop permissions.

Use `src/index.css` as the source of truth when changing UI styles. Preserve accessibility, keyboard focus, and equivalent light/dark behavior; avoid duplicating a second styling system in components.

## Native boundary

UI code accesses native behavior through `src/utils/tauriBridge.ts`. Keep browser fallbacks there and check `isTauri()` before native-only work. Avoid scattering Tauri imports or arbitrary local-path access through components.

When adding or changing a Rust command:

1. Put it in the matching `src-tauri/src/commands/` module.
2. Derive Specta types for command inputs and outputs.
3. Register it once in `commands::specta_builder()`.
4. Regenerate bindings; never hand-edit `src/lib/bindings.ts`.
5. Adapt the generated command in `tauriBridge.ts` if the UI needs normalization or a browser fallback.

Use `anyhow` with context for internal Rust failures. Keep Tauri boundary errors serializable. Treat expected outcomes such as a closed dialog, missing optional tool, or user cancellation as normal domain results rather than unexpected errors.

Keep package, Cargo, and Tauri versions aligned when changing the application version.

## Cross-platform desktop behavior

Preserve macOS, Windows, and Linux support in native changes. Prefer Tauri APIs and Rust standard-library abstractions over platform-specific shell commands. When platform-specific behavior is unavoidable, isolate it behind `cfg` branches, retain a supported path for each desktop platform, and test the affected platform when available.

## PDF and persistence invariants

- Reuse the configured PDF.js worker from `src/utils/pdfWorker.ts`.
- Keep expensive PDF loading and rendering lazy and cancelable. Clean up PDF.js loading tasks, render tasks, observers, timers, object URLs, and event listeners.
- Avoid eagerly rendering every page or every library cover. Library and thumbnail work must remain bounded for large documents and directories.
- Keep app chrome styling separate from rendered PDF content and preserve existing PDF page filter behavior.
- Route native reads, writes, dialogs, directory scans, and clipboard operations through the bridge.
- Preserve localStorage keys, IndexedDB records, annotation JSON, recent-document data, and saved-directory formats. Include an explicit migration when a stored shape must change.
- Page mutations must keep annotations, snippets, current-page state, and the saved PDF synchronized.

## AI integration

AI explanations currently use a locally installed Codex CLI from the desktop app; this is a preview boundary, not the final provider architecture.

Preserve the current safety properties when changing it: prompts go through stdin, temporary files are cleaned up, requests can be cancelled, execution has a timeout, structured output is validated, and Codex runs with the restricted non-interactive arguments defined in `src-tauri/src/commands/ai.rs`.

## Verification

Run checks proportional to the change:

- TypeScript or React: `bunx tsc --noEmit`, relevant `bun test` coverage, `bun run build:web`.
- Rust or native commands: Cargo tests, formatting, Clippy, plus the frontend checks because bindings may change.
- Desktop workflows: `bun run dev` or `bun run build -- --no-bundle` when practical.
- Every change: `git diff --check`.

For file workflows, verify both the desktop path and browser fallback. For PDF rendering or annotations, exercise a multi-page document and confirm cancellation/cleanup paths, persistence, page changes, and export behavior affected by the change.

## Repository hygiene

Preserve unrelated working-tree changes. Keep edits scoped, use `apply_patch` for source changes, and avoid destructive Git commands. Do not commit generated bindings, build output, or user-owned files unless explicitly requested.

## Graphify

Graphify is an optional, agent-neutral codebase navigation tool. Any AI agent can use its CLI when `graphify-out/graph.json` exists.

For a codebase or architecture question, start with one of these commands from the repository root:

```sh
graphify query "<question>"    # focused subgraph
graphify path "<A>" "<B>"     # relationship path
graphify explain "<concept>"   # focused node context
```

Use Graphify to orient before opening many source files. Then read and modify the specific files needed for the task. If Graphify is unavailable or its graph is stale, use normal repository inspection and say so.

After code changes, refresh the local graph with `graphify update .`. Graphify output is local and ignored by Git, so agents must not treat its absence as a repository error.
