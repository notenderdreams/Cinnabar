# Development & Contributing Guide

This document covers local setup, tooling, architecture, and contribution guidelines for **Cinnabar**.

---

## Tech Stack

- **Runtime & Package Manager**: [Bun](https://bun.sh)
- **Desktop Framework**: [Tauri v2](https://tauri.app) (Rust)
- **Frontend**: React 19, TypeScript, [Vite](https://vitejs.dev), [Tailwind CSS v4](https://tailwindcss.com)
- **PDF Engine & Rendering**: [PDF.js](https://mozilla.github.io/pdf.js/) & [pdf-lib](https://pdf-lib.js.org/)
- **Math & Markdown Rendering**: [KaTeX](https://katex.org/), `react-markdown`, `remark-math`, `rehype-katex`
- **Icons**: [Lucide React](https://lucide.dev)

---

## Prerequisites

Before getting started, make sure you have installed:

1. **Bun** (v1.1+):
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```
2. **Rust & Cargo** (stable):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
3. **Platform Build Tools**:
   - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
   - **Linux**: Standard Tauri dependencies (`webkit2gtk`, `libssl-dev`, etc.)
   - **Windows**: Microsoft Visual Studio C++ Build Tools & WebView2

---

## Getting Started

### 1. Install Dependencies

Always use Bun for dependency management:

```bash
bun install
```

### 2. Run the Desktop Application

Launches the Tauri v2 desktop application with hot module reloading (HMR):

```bash
bun run dev
```

### 3. Run the Frontend Dev Server for Tauri

Runs the frontend server used by Tauri. This is not a supported standalone browser app:

```bash
bun run dev:frontend
```

---

## Testing & Quality Checks

The maintenance tools are installed by `bun install`, which also activates the shared Husky hook. Use the pinned Bun version in `package.json`. On a fresh checkout, run `bun run generate:bindings` before checks that need native types.

| Command                | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `bun run format`       | Format supported files and sort Tailwind classes using `src/index.css`. |
| `bun run format:check` | Check formatting without modifying files.                               |
| `bun run lint`         | Run typed ESLint, React Hooks, accessibility, and React Refresh checks. |
| `bun run lint:fix`     | Apply safe ESLint fixes.                                                |
| `bun run lint:prune`   | Remove resolved findings from the lint baseline.                        |
| `bun run typecheck`    | Check application and imported notebook TypeScript.                     |
| `bun run knip`         | Find unused files, exports, and dependencies across both workspaces.    |
| `bun run check`        | Run the complete frontend maintenance suite.                            |
| `bun run check:rust`   | Check Rust formatting, run Clippy, and run Rust tests.                  |
| `bun run audit:rust`   | Check Rust dependency advisories, licenses, sources, and bans.          |

Prettier owns formatting; ESLint's conflicting formatting rules are disabled. Generated bindings, build artifacts, and local research output are excluded. Knip discovers Vite entry points and the notebook package's exported entry points, with Bun tests included explicitly.

`eslint-suppressions.json` records existing findings by file and rule. New files and increases in those counts fail linting. This allows gradual cleanup without disabling correctness rules across the project. Fix the underlying finding, run `bun run lint:prune`, and include the reduced baseline in the same commit. Regenerating the baseline to accept new violations defeats that check.

The pre-commit hook runs lint-staged: ESLint and Prettier on staged JS/TS, Prettier on staged documents/styles/configuration, and rustfmt checks when Rust files are staged. Full-project checks run in CI on macOS, Windows, and Linux. Keep commit hooks quick; run `bun run check` and the relevant native checks before opening a PR.

Install the audit CLI once with `cargo install cargo-deny --version 0.20.2 --locked`. `deny.toml` checks desktop targets and records explicit exceptions for unmaintained transitive GTK/Tauri/dialog dependencies. It also documents the remaining Linux `glib` advisory, whose fixed version is incompatible with Tauri's GTK 3 dependency tree. Review these exceptions during native dependency upgrades. Other vulnerability/soundness advisories and yanked releases fail the audit; dependency updates must pass native tests, Clippy, and frontend checks.

The GitHub Actions workflow runs checks on pull requests and pushes to `main`. It also runs the Rust dependency policy in a separate job. Local successful checks do not replace verification on the other desktop platforms.

Run the verification suite before committing changes:

```bash
# Run frontend test suite
bun test

# Run Rust unit tests
cargo test --manifest-path src-tauri/Cargo.toml

# Check Rust formatting and common mistakes
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings

# Type check
bunx tsc --noEmit

# Production frontend build
bun run build:frontend

# Check formatting/whitespace
git diff --check
```

---

## Building Binaries

### Frontend Assets for Tauri

```bash
bun run build:frontend
```

### Native Desktop Application

```bash
bun run build
```

The compiled platform-native installer/executable will be placed in `src-tauri/target/release/bundle/`.

---

## Architecture Overview

```
├── src/
│   ├── components/       # UI grouped by viewer, annotations, dashboard, layout, modals, settings, AI
│   ├── hooks/            # PDF loading, sessions, page mutations, annotations, search, AI
│   ├── lib/              # Domain implementations, types, constants, generated bindings
│   │   ├── ai/           # Prompts, response formatting, drag state, region context
│   │   ├── annotations/  # Selection, annotation transfer, presentation, rasterization
│   │   ├── pdf/          # PDF.js worker, page processing, export, viewer geometry
│   │   ├── storage/      # Existing localStorage and IndexedDB persistence formats
│   │   ├── snippets/     # Snippet capture and stitching
│   │   ├── media/        # Image geometry and processing helpers
│   │   └── theme/        # Reading theme behavior
│   ├── utils/tauriBridge.ts # Public desktop interface
│   ├── utils/tauri/      # Capability modules with native calls
│   ├── App.tsx           # Main application entry
│   └── index.css         # Design system tokens and styles
├── src-tauri/
│   ├── src/app.rs        # Tauri setup and binding generation
│   ├── src/app/menu.rs   # Native menu definitions
│   ├── src/commands/     # Tauri command adapters and their single registration point
│   ├── src/ai/           # Providers, protocol, runner, workspace cleanup, data types
│   ├── src/documents/    # File IO, scan limits, document data types
│   ├── src/pdf/          # PDF mutations and fingerprinting
│   ├── src/media.rs      # Image compression and encoding
│   ├── src/library/      # Library state, database setup, migrations, queries, scanner
│   ├── src/platform.rs  # Shared desktop environment helpers
│   ├── src/shortcuts/    # Shortcut definitions and dispatch
│   ├── src/lib.rs        # Small native library entry point
│   ├── capabilities/     # Tauri 2 security permissions & capabilities
│   └── Cargo.toml        # Rust dependencies
├── assets/               # Media & preview assets
└── tests/                # Unit and integration tests (bun:test)
```

### Native Tauri Bridge

All desktop-specific operations (file dialogs, folder scanning, file reading/writing, clipboard access, external URL opening) must route through [`src/utils/tauriBridge.ts`](src/utils/tauriBridge.ts). Cinnabar runs only inside Tauri; use native file dialogs, clipboard access, window operations, and URL opening.

The bridge re-exports capability modules in `src/utils/tauri/`. UI and domain callers use the public bridge; capability modules share native result handling without importing the public bridge back into themselves. Domain types live in `src/lib/types/`; avoid adding compatibility re-exports in unrelated folders.

Native commands are registered once in [`src-tauri/src/commands/mod.rs`](src-tauri/src/commands/mod.rs). Specta generates their TypeScript interface at `src/lib/bindings.ts`. The generated file is ignored by Git and refreshed automatically by `bun run dev:frontend` and `bun run build:frontend`. Run it directly when needed:

```bash
bun run generate:bindings
```

Keep command failures serializable at the Tauri boundary. Use `anyhow` with context inside Rust modules, then convert unexpected failures to a frontend-safe message. Expected outcomes such as closing a dialog or cancelling an AI request should remain normal return values.

Native domain modules own processing and persistence; command adapters own Tauri arguments, dialogs, and serialized results. Tests for native implementations sit alongside their domain modules. `useDocumentSession` owns opening and resuming documents, while `usePdfPageMutations` coordinates PDF persistence, reload, annotation/snippet reindexing, and navigation.

Cinnabar currently targets desktop platforms only. Do not add mobile-specific entry points or configuration unless mobile support becomes an explicit project goal.

---

## Contribution Guidelines

1. **Keep it focused**: Scope PRs to single features, bug fixes, or performance improvements.
2. **Follow the design system**: Adhere to the design tokens and visual guidelines in `src/index.css`.
3. **Test desktop workflows**: Verify native file dialogs, saves, clipboard operations, and window behavior. Mock native calls in frontend tests.
4. **Preserve formatting & types**: Keep TypeScript strict and ensure `bun test` and `cargo test` pass.
