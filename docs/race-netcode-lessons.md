# Race Netcode & Physics — Lessons Learned

This document records user-reported issues from Platform Race development, what caused them, and what to do instead. Use it when touching `raceClientGame.ts`, `racePhysics.ts`, hazard logic, or ghost rendering.

---

## Summary: did we implement pro techniques poorly?

**Mostly yes — not because the ideas were wrong, but because we applied the wrong technique to the wrong problem, or skipped steps pros always use together.**

| Pro technique | What we did wrong |
|---|---|
| Client-side prediction (local player) | Kept toggling reconciliation strategy without a stable rule for *when* to resync |
| Soft reconciliation | Used it for horizontal ground movement → run shake and slide-back on stop |
| Hard reconciliation | Used full reset every server tick → 30Hz micro-stutter |
| Entity interpolation (ghosts) | Added 100ms delay, removed it entirely, never landed on “interpolate + smooth” together |
| Display position relay | Sent position but drew it raw at 30Hz → jumpy ghosts |
| Server authority | Fought client prediction instead of separating **sim authority** from **render relay** |

**Stable target architecture (what we converged toward):**

- **Local player:** predict from input; resync only on respawn, vertical/hazard mismatch, or large error — not every tick on flat ground.
- **Server:** authoritative sim for hazards, respawn, finish; relay `racePosition` for what others draw.
- **Ghosts:** use relayed display position as a *target*, then **smooth render position toward it** at 60fps — never snap draw to network state.

---

## Issue log (chronological)

### 1. Running shake + slide-back when stopping

**Symptom:** Character shaky while running; after releasing movement keys, slides slightly backward.

**Root cause:** Soft server reconciliation (`SOFT_CORRECT`) nudged predicted X backward each tick while client was slightly ahead of server.

**Wrong fix:** More reconciliation, camera smoothing on X.

**Correct approach:** Trust local prediction on flat ground; no soft horizontal nudge. Hard snap only for large error or non-ground cases.

---

### 2. Landing on platform edge → snap to floor below

**Symptom:** Jump onto platform (especially edge) → dropped to ground below.

**Root cause (multiple bugs):**
- Y collision resolved **every** overlapping tile; ground tile below platform overwrote platform landing.
- **Double X movement:** `x += vx*dt` before `resolveAxis`, which also applied `vx*dt`.
- **X before Y:** horizontal move could walk off ledge before vertical landing resolved.

**Wrong fix:** Only trust client prediction / disable reconciliation.

**Correct approach:** Y before X; single X application; on falling (`delta > 0`), stop at **first** (topmost) hit only; pick landing tile under player center.

---

### 3. Same floor-snap on high platforms (multiple tiles above ground)

**Symptom:** Still snapped to floor on row-10 platforms, not just row-12 bridges.

**Root cause:** Same as #2 — double X and X-before-Y made player miss platform column before Y resolved. Not specific to bridge/hazard layout.

---

### 4. On bridge above hazard — client on platform, server in pit

**Symptom:** Local player on bridge; server/opponent thinks player is in hazard below (`positioninconsistencies.png`).

**Root cause:**
- Client predicted ahead with no reliable sync path.
- Input seq incremented per **frame** (~60Hz) but sim at 30Hz.
- Server kept only **latest** input per tick (dropped inputs).
- `racerTouchesHazardTile` (full body overlap) caused false hazard deaths.
- No display position relay — opponent only saw server sim state.

**Wrong fix:** Remove all reconciliation → smooth locally but large ghost gap.

**Correct approach:** Input seq per physics tick; server input queue; feet-only hazard check; `racePosition` relay; reconcile on vertical/hazard/large error only.

---

### 5. Intermittent ground jumpiness when other players on screen

**Symptom:** Small horizontal hitches while running, worse with opponents visible.

**Root cause:**
- Full reconcile + `predAccumulator = 0` every server tick (~30Hz).
- Snapshot applied via React render loop (irregular vs rAF).
- Display extrapolation threshold (`|vx| > 1`) caused discontinuities.

**Wrong fix:** Preserve accumulator without fixing reconcile frequency; split snapshot across `useLayoutEffect` + rAF.

**Correct approach:** Don’t reset accumulator on routine reconcile; apply snapshot in one loop; always extrapolate display between physics ticks for local player.

---

### 6. Ghost lag vs local player (opponent screen)

**Symptom:** Red player on own screen ahead of red ghost on opponent’s screen.

**Root cause:** Local = prediction; ghost = server `x/y` + intentional interpolation delay. Two different positions by design unless display is relayed.

**Wrong fix:** Remove delay only → ghosts jumpy; add delay → ghosts lag.

**Correct approach:** Relay client display position; smooth ghost render toward target; accept small RTT gap, not 100ms+ artificial delay.

---

### 7. Ghosts very jumpy after direct position send

**Symptom:** Local screen snappy (good); ghosts stutter/jump.

**Root cause:** Drew `displayX/displayY` **directly** from 30Hz snapshots with no render-side smoothing.

**Wrong fix:** More extrapolation, shorter delay, velocity guesses alone.

**Correct approach:** **Render smoothing layer** — `remoteRenderPos` lerps toward network target each frame; hard snap only on respawn/large teleport.

---

### 8. Hazard / death desync (earlier in project)

**Symptom:** Local player didn’t die on hazards; opponents did; wall collision “teleporting.”

**Root cause:** Hazard checks differed client vs server; collision resolution 0.01px offsets; soft reconcile fighting physics.

**Correct approach:** Shared hazard logic in `raceRespawn.ts`; feet-supported check on bridges; no spurious collision offsets.

---

## Anti-patterns checklist

- [x] No soft reconcile horizontal position on ground
- [x] No full position reset every server tick on flat ground
- [x] Local predicts; remote interpolates + smooths (different strategies)
- [x] Never draw raw 30Hz network state for ghosts
- [x] No artificial interpolation delay without smoothing
- [x] Dedicated `racePosition` channel (not bundled in input)
- [x] Y collision: first topmost hit only when falling
- [x] Y resolved before X
- [x] Single velocity integration per tick
- [x] Input seq per physics tick
- [x] Server input queue (not overwrite)
- [x] Feet-only hazard check on bridges

---

## Implementation map (current code)

| Concern | Location |
|---|---|
| Netcode tuning constants | `shared/raceConstants.ts` → `RACE_NETCODE` |
| Local prediction + ghost render | `src/game/raceClientGame.ts` |
| Physics / collision | `shared/racePhysics.ts` |
| Hazard / respawn | `shared/raceRespawn.ts`, `server/raceSimulation.ts` |
| Position relay | `racePosition` event, `RacePositionPayload` in `shared/types.ts` |
| Game loop wiring | `src/game/RaceCanvas.tsx` |

---

## Reference: files to touch carefully

| Area | Files |
|---|---|
| Local prediction & ghosts | `src/game/raceClientGame.ts`, `src/game/RaceCanvas.tsx` |
| Physics / collision | `shared/racePhysics.ts` |
| Hazards / respawn | `shared/raceRespawn.ts`, `server/raceSimulation.ts` |
| Position relay | `shared/types.ts` (`RacePositionPayload`), `server/index.ts` |
| Constants | `shared/raceConstants.ts`, `shared/constants.ts` |

---

## When changing netcode, test these scenarios

1. Run and stop on flat ground — no shake, no backward slide.
2. Land on platform edge (row 10 and row 12 bridge) — stay on platform.
3. Run across bridge over pit — no false hazard death; ghost matches roughly on two clients.
4. Two clients side by side — local snappy; ghost smooth, not laggy or jittery.
5. Respawn / finish — ghost hard-snaps (no long lerp across map).

---

*Last updated: June 2026 — from Platform Race multiplayer polish session.*

### 9. Occasional local-only jumpiness (single client)

**Symptom:** Rare hitches on your own character while running, no other players needed.

**Root causes:**
- **AABB collision:** `bottom === tileTop` counts as *separated*, not overlapping — one frame `grounded` clears, next frame re-lands (micro hop).
- **Reconciliation:** `local.grounded !== pred.grounded` for one server tick triggered full resync + accumulator reset at platform edges.

**Fix:** `findGroundSupport()` for feet-on-surface detection; resync only on meaningful `errY`, server hazard, or large total error — not grounded flag alone; preserve accumulator on horizontal-only resync.

### 10. Jumpiness running off platform after hazard death

**Symptom:** After dying once, running off a floating platform edge causes jitter.

**Root causes:**
- **`findGroundSupport` used full hitbox width** — a corner still over the platform kept you grounded while the center was already past the edge (grounded/ungrounded flicker).
- **Input history not cleared on respawn** — pre-death inputs replayed against post-respawn position, causing repeated resync hitches.

**Fix:** Support check uses **foot center column only**; clear `inputHistory` on client respawn and `pendingInputs` on server respawn.
