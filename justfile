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
    bun x tsc --noEmit
    cargo check --manifest-path src-tauri/Cargo.toml

clean:
    cargo clean --manifest-path src-tauri/Cargo.toml
    rm -rf dist node_modules
