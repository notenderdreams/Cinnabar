export default {
  '**/*.{js,mjs,cjs,ts,tsx}': [
    'bunx --bun eslint --fix --no-warn-ignored',
    'bunx --bun prettier --write',
  ],
  '**/*.{json,css,md,html,yml,yaml}': 'bunx --bun prettier --write',
  '**/*.rs': () => 'cargo fmt --manifest-path src-tauri/Cargo.toml -- --check',
};
