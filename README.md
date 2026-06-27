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
5. On **mobile/touch**: left stick to move · drag the right side to aim · hold to shoot
6. Last team standing wins. Eliminated players stay on the board but cannot act.

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

## Deployment (Render)

This repo is set up for [Render](https://render.com) — same pattern as [trivia-king](https://trivia-king.onrender.com/). The GitHub repo is [`matonism/web-shooter`](https://github.com/matonism/web-shooter); the default branch is **`master`** (not `main`).

### First-time setup (Blueprint — recommended)

1. **Push the repo to GitHub** (if you have not already):

   ```bash
   git remote add origin https://github.com/YOUR_USER/web-shooter.git
   git push -u origin master
   ```

2. Open the [Render dashboard](https://dashboard.render.com/) and sign in with GitHub.

3. Click **New → Blueprint**.

4. Connect GitHub and select the **`web-shooter`** repository (or paste the repo URL).

5. Render reads `render.yaml` at the repo root and proposes a web service named **`shooter-snipes`**.

6. Click **Apply** / **Create** and wait for the first deploy to finish (usually a few minutes).

7. When the deploy succeeds, open the service URL (e.g. `https://shooter-snipes.onrender.com`). You can rename the service in Render settings to change the subdomain.

**What Render runs:**

| Step | Command |
|------|---------|
| Build | `npm ci --include=dev && npm run build` |
| Start | `npm start` |

`npm ci --include=dev` is required because **Vite** is a devDependency and must be installed even when `NODE_ENV=production` during the build.

The web service serves the built client from `dist/` and Socket.io from a **single Node process** on the port Render assigns via `PORT`.

### First-time setup (manual Web Service)

If you prefer not to use the Blueprint:

1. **New → Web Service** → connect `matonism/web-shooter`.
2. Set **Branch** to **`master`**.
3. **Runtime:** Node  
4. **Build command:** `npm ci --include=dev && npm run build`  
5. **Start command:** `npm start`  
6. **Health check path:** `/`  
7. Add env var: `NODE_ENV` = `production`  
8. Create the service.

### After the service exists — auto-deploy on push

Each `git push` to the branch Render watches should trigger a new deploy. Check these if a push does **not** update the live site:

| Check | What to verify |
|-------|----------------|
| **Branch** | In Render → your service → **Settings → Build & Deploy → Branch**, the branch must be **`master`**. Render’s default is often `main`; this repo uses **`master`**, so a mismatch means pushes never trigger deploys. |
| **Auto-Deploy** | **Settings → Build & Deploy → Auto-Deploy** should be **Yes**. |
| **Correct repo** | The service must point at **`matonism/web-shooter`**, not another repo or fork. |
| **Deploy events** | Open the service → **Events** or **Logs**. A failed build still counts as “synced” but the site stays on the last good deploy — read the build log for errors. |
| **Manual deploy** | **Manual Deploy → Deploy latest commit** forces a rebuild from the current branch tip. |

### Verify GitHub received your push

Locally:

```bash
git status          # should say "up to date with 'origin/master'"
git log origin/master -1 --oneline
```

On GitHub, confirm the latest commit appears on the **`master`** branch.

### Render free tier notes

- The service **spins down** after ~15 minutes without traffic; the first visit after that can take 30–60 seconds.
- **Room state is in-memory** — rooms are lost when the server restarts, redeploys, or sleeps.
- For always-on parties you need a paid instance or another host.

### Why not static hosting only?

Firebase Hosting, S3, and similar serve **files only**. This app needs a **long-lived Node process** for Express + Socket.io + in-memory rooms. Render runs `npm start`, which serves `dist/` and WebSockets from one origin — that is what the client expects in production.

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

#### Local dev

- **Port 3001 already in use (`EADDRINUSE`)** — A previous `npm start` or dev session is still running. Stop it, or on Windows run `netstat -ano | findstr :3001` then `taskkill /PID <pid> /F`.
- **"Connecting…" forever** — Make sure the API is running (`npm run dev` starts both, or run `npm start` after a build).

#### In-game

- **Room not found after deploy** — Expected on Render free tier after a spin-down or deploy; create a new room.
- **Could not rejoin** — Session expired or room was destroyed; join again with the room code.

#### Render deploy did not update after `git push`

1. Confirm the push reached GitHub on branch **`master`** (see [Verify GitHub received your push](#verify-github-received-your-push)).
2. In Render → service → **Settings**, set **Branch** to **`master`** and **Auto-Deploy** to **Yes**.
3. Check **Events** / build logs for a failed deploy.
4. Use **Manual Deploy → Deploy latest commit** to force a rebuild.
5. If no Render service exists yet, complete [First-time setup (Blueprint)](#first-time-setup-blueprint--recommended) — pushing alone does not create a service.
