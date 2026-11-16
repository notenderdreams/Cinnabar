@AGENTS.md

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature>/` (git-excluded, never published). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.

## UI automation

Debug builds (`bun run dev`) run a loopback-only MCP bridge on `127.0.0.1:9223` (`tauri-plugin-mcp-bridge`). With the user-level `tauri` MCP server (`npx -y @hypothesi/tauri-mcp-server`), start a `driver_session`, then use `webview_screenshot`, `webview_interact`, `webview_execute_js`, and `read_logs`. Without the MCP tools, the same calls work through `npx -y -p @hypothesi/tauri-mcp-cli tauri-mcp <tool> --raw '<json>'`. To count PDF.js worker work, patch `Worker.prototype.postMessage` and tally `m.action`.
