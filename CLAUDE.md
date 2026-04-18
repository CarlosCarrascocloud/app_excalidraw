# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start the server locally
npm start              # runs: node server.js (port 3030)

# Docker (recommended for full stack)
docker-compose up      # starts all 4 services
docker-compose up scalidraw  # only the custom Node.js server
```

No build step required — vanilla JavaScript is served directly as static files.

## Architecture

This is a **real-time collaborative whiteboard** built on Express + WebSocket + Excalidraw. There is no bundler or transpiler — the backend serves static files directly.

### Services (docker-compose)

| Service | Port | Description |
|---|---|---|
| `scalidraw` | 8095 | Custom Node.js server (this repo) |
| `frontend` | 8092 | Excalidraw fork (alswl image) |
| `storage` | 8093 | Excalidraw storage backend |
| `room` | 8094 | Official Excalidraw room server |

The custom server (`scalidraw`) also runs standalone on port `3030` (or `$PORT`).

### Key Files

- **`server.js`** — WebSocket hub with room-based state (`Map<roomId, room>`). Manages client lifecycles, broadcasts, and server-side throttling (80ms minimum between broadcasts).
- **`public/js/collaboration.js`** — `CollaborationManager` class: WebSocket connection, exponential backoff reconnection (up to 50 attempts), outbound throttling (150ms).
- **`public/js/app.js`** — Excalidraw initialization, version-based element reconciliation for conflict resolution, pointer tracking, delta-based file sync.
- **`public/index.html`** — Main collaborative drawing UI (React + Excalidraw loaded from CDN).
- **`public/scalidraw.html`** — Split-view dashboard embedding Eraser board + collaborative drawing in dual iframes.

### Data Flow

1. User enters name → `CollaborationManager.connect()` opens WebSocket at `ws://host/?room=<roomId>`
2. Room ID comes from URL param `?room=<id>`, defaults to `"default"`
3. Scene changes are throttled (150ms client-side) then broadcasted by the server (80ms server-side)
4. Conflict resolution uses **version-based reconciliation**: higher-version elements win; ties use element ID sort
5. Files (images) use **delta sync**: only new file IDs are transmitted to avoid redundant payloads
6. Pointer positions are sent as `pointer-update` messages for live cursor display

### Message Protocol (WebSocket)

Messages are JSON with a `type` field:
- `scene-update` — full element array + files delta
- `pointer-update` — cursor position `{x, y, tool}`
- `client-list` — connected users for presence display

### Environment Variables

- `PORT` — server port (default `3030`)
- `VITE_APP_WS_SERVER_URL` — WebSocket endpoint (used by docker-compose frontend)
- `VITE_APP_BACKEND_V2_GET_URL` — scene storage API URL

### Language Note

Code comments and some variable names are in Spanish. This is intentional — "Qallpa" is a Quechua word and the project targets Spanish-speaking users.
