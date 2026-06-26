# Neon Blasters

A browser-based 3v3 top-down arena shooter for up to six players. Create or join a room, pick Red or Blue, and fight in real time over WebSockets. The server runs an authoritative 30 Hz game loop; clients predict local movement and interpolate remote players for smooth play.

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 19, TypeScript, Vite, HTML5 Canvas |
| **Backend** | Node.js 20, Express, Socket.io |
| **Shared** | TypeScript types and game constants (`shared/`) |
| **Hosting** | [Render](https://render.com) (Blueprint via `render.yaml`) |

## Project Structure

```
shooter-snipes/
├── shared/              Types and constants shared by client and server
│   ├── types.ts         Socket events, room state, world snapshots
│   └── constants.ts     Arena size, tick rate, player/bullet stats
├── server/
│   ├── index.ts         Express + Socket.io, rooms, lobby handlers
│   └── gameSimulation.ts Authoritative game loop and collision
├── src/
│   ├── game/            Canvas renderer, client prediction, interpolation
│   ├── components/      Lobby, HUD
│   ├── hooks/           Socket connection and rejoin logic
│   ├── App.tsx          Main UI shell
│   └── main.tsx         React entry point
├── render.yaml          Render deployment blueprint
├── vite.config.ts       Vite + React + @shared alias
└── index.html
```

## Prerequisites

- **Node.js 20.x** (see `engines` in `package.json`)
- npm

## Local Development

### Setup

```bash
npm install
```

### Run

```bash
npm run dev
```

This starts two processes:

- **Vite** on `http://localhost:5173` (client)
- **API** on `http://localhost:3001` (Express + Socket.io)

Open `http://localhost:5173` in the browser. Use multiple tabs or windows to test multiplayer.

### Other scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build the client to `dist/` |
| `npm run preview` | Preview the Vite build (client only; API still needed for full app) |
| `npm start` | Production server — serves `dist/` and Socket.io on one port |

## How to Play

1. Enter your name and **Create Room** or **Join Room** with a 6-character code.
2. Pick **Red** or **Blue** (up to 3 players per team, 6 total).
3. The host clicks **Start Match** once at least one player is on each team.
4. **WASD** — move · **Mouse** — aim · **Click** — fire
5. Last team standing wins. Eliminated players stay on the board but cannot act.

### Game rules (defaults)

| Setting | Value |
|---------|-------|
| Max players | 6 (3 per team) |
| Health | 100 HP |
| Bullet damage | 25 (4 hits to eliminate) |
| Server tick rate | 30 Hz |
| Respawn | None (elimination mode) |

## Architecture

- **Authoritative server** — movement, firing, and hit detection run on the server at 30 Hz.
- **Client-side prediction** — your own inputs apply immediately with server reconciliation.
- **Interpolation** — remote players render between server snapshots for smooth motion.
- **Reconnection** — disconnected players keep their slot for 30 minutes; refresh rejoins via a token stored in `localStorage`.

Socket events and state shapes live in `shared/types.ts`.

## Deployment

Deploy to Render using the included Blueprint (same pattern as [trivia-king](https://trivia-king.onrender.com/)):

1. Push the repo to GitHub.
2. In the Render dashboard: **New → Blueprint** and select this repo (or paste `render.yaml`).
3. Render runs `npm ci --include=dev && npm run build`, then `npm start`.

The web service serves the built client and Socket.io from a single Node process. Render sets `PORT` automatically; `NODE_ENV=production` is configured in `render.yaml`.

### Render free tier notes

- The service **spins down** after inactivity and takes a moment to wake up.
- **Room state is in-memory** — rooms are lost when the server restarts or sleeps.
- For persistent rooms you would need external storage (Redis, etc.).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Production | Set to `production` on Render; enables static file serving and same-origin Socket.io |
| `PORT` | Production | HTTP port (set automatically by Render) |
| `VITE_SOCKET_URL` | Dev only | Override Socket.io URL when developing locally (default: `http://localhost:3001`) |

No secrets or API keys are required for basic operation.

## Additional Notes

### Development vs production

- **Dev:** Client on port 5173 connects to the API on port 3001 (CORS enabled on the server).
- **Prod:** Client and API share the same origin; Express serves `dist/` and falls back to `index.html` for the SPA.

### Troubleshooting

- **Port 3001 already in use (`EADDRINUSE`)** — A previous `npm start` or dev session is still running. Stop it, or on Windows run `netstat -ano | findstr :3001` then `taskkill /PID <pid> /F`.
- **"Connecting…" forever** — Make sure the API is running (`npm run dev` starts both, or run `npm start` after a build).
- **Room not found after deploy** — Expected on Render free tier after a spin-down or deploy; create a new room.
- **Could not rejoin** — Session expired or room was destroyed; join again with the room code.
