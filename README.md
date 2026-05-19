# 🍁 Maple

**A fast, transparent macOS LLM client.**

Maple is a native-feeling desktop client for chatting with large language models
through any OpenAI-compatible API. It is built for two things above all:
**performance** and **showing you what the model is actually doing** — reasoning,
tool calls and token timings — as it happens.

Built on Tauri 2 (Rust core) + React. No Electron: small bundle, low memory,
instant startup.

## Features

- **Streaming chat** with any OpenAI-compatible provider (defaults to DMXAPI).
- **Intermediate-process display** — a live panel on every reply showing:
  - reasoning / "thinking" tokens as they stream in,
  - tool / function calls with their arguments,
  - a timeline of the turn (request → connected → first token → done),
  - **performance metrics**: time-to-first-token, tokens/sec, token counts.
- **700+ models** — searchable picker, fetched live from the provider.
- **Local-first** — conversations stored in SQLite, on your machine.
- Dark / light themes, native macOS overlay title bar.
- **Fast by design** — Rust streaming core, `requestAnimationFrame` render
  batching, memoised message list.

## Tech stack

| Layer    | Choice                                            |
| -------- | ------------------------------------------------- |
| Shell    | Tauri 2 (Rust)                                    |
| Backend  | `reqwest` streaming · `rusqlite` · structured SSE |
| Frontend | React 19 · TypeScript · Zustand · Vite            |
| IPC      | Tauri Channels (low-overhead event streaming)     |

## Getting started

### Prerequisites

- macOS
- [Rust](https://rustup.rs) · Node 20+ · [pnpm](https://pnpm.io)
- Xcode Command Line Tools — `xcode-select --install`

### Develop

```bash
pnpm install
pnpm tauri dev
```

### Build a release app

```bash
pnpm tauri build
```

## Configuration

Open **Settings** in the app and set:

- **API base URL** — e.g. `https://www.dmxapi.cn/v1`
- **API key** — your provider key
- **Default model** — chosen from the live model list

Settings are stored locally in SQLite (in the app's data directory). Nothing is
sent anywhere except the model provider you configure.

## Architecture

```
src-tauri/src/
  llm.rs        OpenAI-compatible streaming client; SSE → StreamEvents
  db.rs         SQLite persistence (conversations, messages, settings)
  commands.rs   Tauri command bridge
  lib.rs        app wiring & first-run seeding
src/
  store/        Zustand state (+ rAF render batching for streams)
  components/   ProcessPanel, MessageList, Composer, ModelPicker, …
  lib/          typed IPC, shared types, formatting
```

The backend parses the provider's SSE stream into a typed sequence of
`StreamEvent`s (`reasoning`, `content`, `tool_call`, `metrics`, `done`) and
pushes them to the UI over a Tauri Channel. The UI coalesces token deltas with
`requestAnimationFrame`, so it re-renders at most once per frame no matter how
fast the model streams.

## Roadmap

- [ ] Stop / cancel an in-flight turn
- [ ] Multimodal input (images)
- [ ] Knowledge base / RAG
- [ ] MCP tool servers
- [ ] Window vibrancy & virtualised message list
- [ ] Conversation export & search

## License

MIT — see [LICENSE](LICENSE).
