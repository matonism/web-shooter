# Shooter Snipes

A browser-based multiplayer game suite for up to six players in a shared room. Create or join with a room code, pick a game (Arena Shooter, Multiplayer Snake, or Platform Race), and play in real time over WebSockets. The server runs an authoritative 30 Hz simulation for each game; clients predict local input and interpolate remote players for smooth play.

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 19, TypeScript, Vite, HTML5 Canvas |
| **Backend** | Node.js 20, Express, Socket.io |
| **Shared** | TypeScript types, constants, and game logic (`shared/`) |
| **Hosting** | [Render](https://render.com) (Blueprint via `render.yaml`) |

## Project Structure

```
shooter-snipes/
├── shared/                  Types and logic shared by client and server
│   ├── types.ts             Socket events, room state, world snapshots
│   ├── constants.ts         Tick rate, arena size, shooter stats
│   ├── games.ts             Game catalog (shooter, snake, race)
│   ├── movement.ts          Shared movement helpers
│   ├── powerups.ts          Arena Shooter powerup definitions
│   ├── snakeConstants.ts    Snake grid and spawn slots
│   ├── raceConstants.ts     Platform race physics and tile ids
│   ├── raceLevel.ts         Race course (312×15 tiles, hazards, checkpoint)
│   ├── racePhysics.ts       Racer movement and collision
│   └── raceSettings.ts      Race scoring and visibility options
├── server/
│   ├── index.ts             Express + Socket.io, rooms, lobby handlers
│   ├── roomSimulation.ts    Pluggable simulation interface
│   ├── createSimulation.ts  Factory for game sims
│   ├── gameSimulation.ts    Arena Shooter authoritative loop
│   ├── snakeSimulation.ts   Multiplayer Snake sim
│   ├── raceSimulation.ts    Platform Race sim
│   ├── gamePick.ts          Host / vote / random game selection
│   ├── soloBots.ts          AI bots for solo practice
│   ├── shooterAi.ts         Shooter bot logic
│   ├── snakeAi.ts           Snake bot logic
│   └── raceAi.ts            Race bot logic
├── src/
│   ├── game/                Canvas renderers and client prediction
│   │   ├── clientGame.ts    Shooter client (prediction + interpolation)
│   │   ├── GameCanvas.tsx
│   │   ├── snakeClientGame.ts / SnakeCanvas.tsx / snakeRenderer.ts
│   │   └── raceClientGame.ts / RaceCanvas.tsx / raceRenderer.ts
│   ├── components/          Lobby, HUDs, mobile controls
│   ├── hooks/               Socket connection and rejoin logic
│   ├── App.tsx              Main UI shell
│   └── main.tsx             React entry point
├── render.yaml              Render deployment blueprint
├── vite.config.ts           Vite + React + @shared alias
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

There is no dedicated test script in `package.json`.

## How to Play

### Lobby

1. Enter your name and **Create Room** or **Join Room** with a 6-character code.
2. The host configures how the game is chosen:
   - **Host picks** — host selects the game from the catalog
   - **Vote** — players vote; host starts when ready
   - **Random** — a random game is chosen when the host starts
3. Optional **Practice vs AI** (solo mode) — when alone, the host can enable bots and start without other humans.
4. The host clicks **Start Match** when the room meets the selected game’s requirements.
5. During a match, the host can click **Back to Lobby** in the header to end the round and return everyone to the lobby.

### Game catalog

| Game | Description | Teams | Solo vs AI |
|------|-------------|-------|------------|
| **Arena Shooter** | 3v3 top-down blaster with powerups | Red / Blue (up to 3 per team) | Yes |
| **Multiplayer Snake** | Grow your snake — last one slithering wins | No | Yes |
| **Platform Race** | Side-scroll sprint to the flag — same course, per-player camera | Optional (FFA or team scoring) | Yes |

---

### Arena Shooter

1. Pick **Red** or **Blue** (up to 3 players per team, 6 total).
2. The host starts once at least one player is on each team (or solo mode is enabled).
3. **WASD** — move · **Mouse** — aim · **Click** — fire
4. On **mobile/touch**: left stick to move · **tap/hold the arena** to aim & shoot (same as mouse on desktop)
5. Last team standing wins. Eliminated players stay on the board but cannot act.

#### Game rules (defaults)

| Setting | Value |
|---------|-------|
| Max players | 6 (3 per team) |
| Health | 200 HP |
| Bullet damage | 25 (8 hits to eliminate) |
| Server tick rate | 30 Hz |
| Respawn | None (elimination mode) |

#### Powerups

Powerups spawn in the arena every **12 seconds** (up to 2 on the field). Walk over one to pick it up.

| Powerup | Effect | Duration |
|---------|--------|----------|
| **Speed Boost** (S) | Move 55% faster | 8s |
| **Rapid Fire** (R) | Much faster shooting | 8s |
| **Spread Shot** (W) | Fires 3 bullets in a spread | 8s |
| **Heavy Slug** (H) | Slow, large bullets — 40 damage | 8s |
| **Energy Shield** (⛨) | Absorbs 50 damage, then breaks | Until depleted |

New pickups stack — timed effects combine, duplicate pickups extend duration, and shields add capacity.

---

### Multiplayer Snake

1. No team selection — free-for-all up to 6 snakes.
2. A **3-second countdown** runs before snakes move.
3. **WASD** or **arrow keys** to change direction (cannot reverse 180° instantly).
4. On **mobile/touch**: use the move stick for direction.
5. Eat pellets to grow; hitting a wall, another snake, or yourself eliminates you. Last snake alive wins.

---

### Platform Race

1. All racers run the **same course** (~312 tiles / 3× the original length) with a **per-player camera**.
2. A **3-second countdown** locks movement before the race starts.
3. **A/D** or **arrow keys** to move · **Space** or **W** to jump
4. On **mobile/touch**: move stick + **JUMP** button
5. **First to the flag** wins (team mode: first finisher wins for their team).

#### Race features

| Feature | Details |
|---------|---------|
| **Fair start** | All racers share the same start-line X — no horizontal head start |
| **Jump limit** | Max vertical reach ≈ **2 tiles**; course geometry respects this |
| **Hazards** | Spike tiles (`!`) — touch to respawn |
| **Checkpoint** | Midway checkpoint — touch once; death respawns there instead of the start |
| **Fall death** | Falling off the map respawns at checkpoint (if reached) or start |

#### Host race settings (lobby)

| Setting | Options |
|---------|---------|
| **Scoring** | Free-for-all or team race |
| **Visibility** | Full sprites, ghosts (faded), minimap dots, or hidden (solo view) |

---

## Architecture

- **Authoritative server** — each game’s simulation runs on the server at 30 Hz via a pluggable `RoomSimulation` interface.
- **Client-side prediction** — local inputs apply immediately; the server reconciles position (soft correction for shooter and race, with input replay on large race errors).
- **Interpolation** — remote entities render between server snapshots (100 ms delay) for smooth motion.
- **Reconnection** — disconnected players keep their slot for 30 minutes; refresh rejoins via a token stored in `localStorage`.
- **In-memory rooms** — room state lives in the Node process; idle rooms are destroyed after 10 minutes without activity.

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
