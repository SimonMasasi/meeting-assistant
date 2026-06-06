# Meeting Assistant

A cross-platform desktop application for managing meetings — capturing objectives, notes, key points, transcripts, and file attachments — built with [Tauri](https://tauri.app/), React, and TypeScript.

Attachments and application settings are stored locally on the user's machine through a small Rust backend, so meeting data never has to leave the device.

## Features

- **Dashboard** — at-a-glance charts (area, bar, line, pie, donut) and stat cards summarizing meeting activity, plus a recent-meetings table.
- **Meetings** — create meetings via a dynamic form, then view a detail page with objectives, notes & key points, a transcript panel, and per-meeting file attachments.
- **Local storage** — attachments are saved to a configurable folder on disk (defaults to Downloads), organized per meeting.
- **Settings** — configure the storage location and outgoing mail (SMTP) settings.
- **User management** — manage users, including an offline-users workflow.
- **Authentication** — token-based login with email/password and a forgot-password flow.

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Shell    | Tauri 2 (Rust) |
| Frontend | React 18, TypeScript, Vite |
| Styling  | Tailwind CSS, MUI (Material + Joy), Emotion |
| State    | Jotai |
| Routing  | React Router |
| Forms    | React Hook Form |
| Charts   | ECharts (`echarts-for-react`) |
| HTTP/API | Axios, GraphQL |

## Prerequisites

- [Node.js](https://nodejs.org/) (18+) and npm
- [Rust](https://www.rust-lang.org/tools/install) toolchain (stable)
- Platform-specific Tauri dependencies — see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   Copy the example env file and fill in your values:

   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   |----------|-------------|
   | `VITE_APP_TITLE` | Application title |
   | `VITE_BACKEND_GRAPHQL_URL` | GraphQL API endpoint |
   | `VITE_BACKEND_URL` | REST API base URL |
   | `VITE_APP_CLIENT_ID` | OAuth client ID |
   | `VITE_APP_CLIENT_SECRET` | OAuth client secret |
   | `VITE_APP_OFFLINE_URL` | Offline API base URL |

3. **Run in development**

   ```bash
   npm run tauri dev
   ```

   This launches the Tauri desktop window with the Vite dev server and hot reload. To run only the web frontend in a browser, use `npm run dev`.

## Building

Build a production desktop bundle for the current platform:

```bash
npm run tauri build
```

Cross-compile a Windows build (requires `cargo-xwin`):

```bash
npm run build-windows
```

Build artifacts are produced under `src-tauri/target/`.

### Backend commands

The Rust backend exposes a small set of Tauri commands, wrapped by the TypeScript services in `src/services/`:

- `save_meeting_attachment` — write a base64-encoded file into the storage folder, organized per meeting.
- `get_storage_dir` / `set_storage_dir` — read and persist the storage location.
- `get_mail_settings` / `set_mail_settings` — read and persist SMTP mail settings.

Settings are stored as a single `settings.json` in the app config directory.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the Vite dev server (frontend only) |
| `npm run build` | Type-check and build the frontend |
| `npm run preview` | Preview the built frontend |
| `npm run tauri dev` | Run the full Tauri desktop app in development |
| `npm run tauri build` | Build a production desktop bundle |
| `npm run build-windows` | Cross-compile a Windows build via `cargo-xwin` |

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

See [LICENSE](LICENSE).
