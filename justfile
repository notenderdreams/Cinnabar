default: run

install:
    bun install
    cargo fetch --manifest-path src-tauri/Cargo.toml

run:
    bun run dev

run-frontend:
    bun run dev:frontend

build:
    bun run build

build-frontend:
    bun run build:frontend

check:
    bun run check
    bun run check:rust

format:
    bun run format
    cargo fmt --manifest-path src-tauri/Cargo.toml

audit:
    bun run audit:rust

clean:
    cargo clean --manifest-path src-tauri/Cargo.toml
    rm -rf dist node_modules
