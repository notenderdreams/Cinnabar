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

### 3. Run the Web Frontend Standalone

Runs the browser frontend in Vite for quick UI iteration:

```bash
bun run dev:web
```

---

## Testing & Quality Checks

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

# Production web build
bun run build:web

# Check formatting/whitespace
git diff --check
```

---

## Building Binaries

### Web Bundle
```bash
bun run build:web
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
│   ├── components/       # React UI components (Viewer, Toolbar, Modals, Overlays)
│   ├── hooks/            # Custom hooks (PDF loading, search, AI explanations)
│   ├── lib/              # Generated native bindings, domain types, and constants
│   ├── utils/            # Bridge helpers, PDF workers, themes, export logic
│   ├── App.tsx           # Main application entry
│   └── index.css         # Design system tokens and styles
├── src-tauri/
│   ├── src/app.rs        # Tauri setup and binding generation
│   ├── src/commands/     # Native commands grouped by responsibility
│   ├── src/lib.rs        # Small native library entry point
│   ├── capabilities/     # Tauri 2 security permissions & capabilities
│   └── Cargo.toml        # Rust dependencies
├── assets/               # Media & preview assets
└── tests/                # Unit and integration tests (bun:test)
```

### Native Tauri Bridge
All desktop-specific operations (file dialogs, folder scanning, file reading/writing, clipboard access, external URL opening) must route through [`src/utils/tauriBridge.ts`](src/utils/tauriBridge.ts). Always maintain a safe fallback for the browser build when applicable.

Native commands are registered once in [`src-tauri/src/commands/mod.rs`](src-tauri/src/commands/mod.rs). Specta generates their TypeScript interface at `src/lib/bindings.ts`. The generated file is ignored by Git and refreshed automatically by `bun run dev:web` and `bun run build:web`. Run it directly when needed:

```bash
bun run generate:bindings
```

Keep command failures serializable at the Tauri boundary. Use `anyhow` with context inside Rust modules, then convert unexpected failures to a frontend-safe message. Expected outcomes such as closing a dialog or cancelling an AI request should remain normal return values.

Cinnabar currently targets desktop platforms only. Do not add mobile-specific entry points or configuration unless mobile support becomes an explicit project goal.

---

## Contribution Guidelines

1. **Keep it focused**: Scope PRs to single features, bug fixes, or performance improvements.
2. **Follow the design system**: Adhere to the design tokens and visual guidelines in `src/index.css`.
3. **Test both modes**: When touching file workflows, verify behavior in both desktop and browser fallbacks.
4. **Preserve formatting & types**: Keep TypeScript strict and ensure `bun test` and `cargo test` pass.
