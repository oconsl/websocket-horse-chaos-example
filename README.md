# 🐎 Horse Chaos

> A real-time multiplayer horse-racing betting game — built to teach WebSocket
> architecture with something more fun than a chat app.

[![CI](https://github.com/oconsl/websocket-horse-chaos-example/actions/workflows/ci.yml/badge.svg)](https://github.com/oconsl/websocket-horse-chaos-example/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](CHANGELOG.md)

Players join a lobby, bet coins on one of five absurdly-named horses, then watch a
live race unfold tick by tick — sabotaging each other with power-ups while the odds
move in real time. Every player sees the same race at the same moment, because the
simulation runs **once, on the server**, and is streamed to everyone.

---

## Why this project exists

Most WebSocket tutorials stop at "echo a message to a room". That teaches the API,
but not the architecture. Horse Chaos exists to make the harder questions unavoidable:

- **Who owns the truth?** The race is simulated server-side and broadcast. Clients
  render; they never compute. A client cannot make its horse win.
- **How do you keep state consistent across reconnects?** Refresh mid-race and you
  get your bet, your coins, your power-ups, and the live horse positions back.
- **How do you model money without race conditions?** Bets deduct coins atomically,
  odds freeze when betting closes, and payouts settle inside a single transaction.
- **What does a real state machine look like?** Six phases, with illegal transitions
  rejected rather than tolerated.

It is an **educational demo**, not a production betting platform. See
[SECURITY.md](SECURITY.md) for its deliberate limitations.

---

## Architecture

```
┌──────────────────────────┐          ┌──────────────────────────────────────┐
│   web/  Next.js 16       │          │   api/  NestJS 12                    │
│   React 19 · zustand     │          │                                      │
│                          │          │  ┌────────────────────────────────┐  │
│  ┌────────────────────┐  │  REST    │  │ Controllers (sessions, races,  │  │
│  │ pages: join/lobby/ │──┼─────────▶│  │ admin, leaderboard)            │  │
│  │ race/leaderboard/  │  │          │  └────────────────────────────────┘  │
│  │ host               │  │          │  ┌────────────────────────────────┐  │
│  └────────────────────┘  │          │  │ GameService — state machine    │  │
│           │              │          │  │ RaceEngineService — simulation │  │
│  ┌────────▼───────────┐  │ Socket.IO│  │ Gateways — players, game       │  │
│  │ ONE shared socket  │◀─┼─────────▶│  └────────────────────────────────┘  │
│  │   lib/socket.ts    │  │          │                 │                    │
│  └────────────────────┘  │          │        ┌────────▼────────┐           │
└──────────────────────────┘          │        │ Prisma 7 client │           │
                                      └────────┴────────┬────────┘───────────┘
                                                        │
                                              ┌─────────▼─────────┐
                                              │  PostgreSQL 16    │
                                              └───────────────────┘
```

**Two design decisions worth calling out:**

1. **One socket per browser tab, not one per page.** `web/lib/socket.ts` holds a
   module-level singleton. Creating a socket per page caused duplicate targeted
   emits — the shared instance survives client-side navigation, which is why the
   app links with `next/link` rather than full page loads.

2. **Identity comes from the session token, never `socket.id`.** A socket id dies on
   reconnect; the player does not. Every targeted emit resolves through the
   token → player mapping.

---

## Tech stack

| Layer     | Choice                                                               |
| --------- | -------------------------------------------------------------------- |
| Backend   | NestJS 12 (ESM), Socket.IO 4, TypeScript 6                           |
| Database  | PostgreSQL 16 via Prisma 7 (`@prisma/adapter-pg` driver adapter)      |
| Frontend  | Next.js 16 (App Router), React 19, zustand 5, socket.io-client 4      |
| Tooling   | api → pnpm + oxlint + Vitest · web → npm + ESLint                     |
| Runtime   | Node 22 (see [`.nvmrc`](.nvmrc))                                      |

---

## Getting started

### Prerequisites

- Node 22 (`nvm use`)
- pnpm via corepack (`corepack enable`)
- Docker, for PostgreSQL

### 1. Database

```bash
cd api
docker compose up -d db
```

Postgres comes up on `127.0.0.1:5432` with local-only development credentials.

### 2. API

```bash
cd api
cp .env.example .env          # then set DATABASE_URL
pnpm install
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm run start:dev            # http://localhost:3000
```

The five horses are seeded automatically on module init — no seed script to run.

### 3. Web

```bash
cd web
npm install
npm run dev -- -p 3001        # http://localhost:3001
```

> **⚠️ Port collision.** The API listens on `3000` and `next dev` also defaults to
> `3000`. `NEXT_PUBLIC_API_URL` falls back to `http://localhost:3000`, so the
> simplest fix is to move the **web** app to another port, as above. If you'd
> rather move the API, set `PORT` for it *and* `NEXT_PUBLIC_API_URL` for the web app.

### 4. Run the whole API stack in Docker instead

```bash
cd api
docker compose up --build     # db + api, migrations applied on boot
```

### 5. Become an admin

The host panel at `/host` is gated on `Player.isAdmin`, which defaults to `false`.
**There is no endpoint or script to grant it** — flip it directly in the database:

```bash
cd api
pnpm exec prisma studio        # edit isAdmin on your player row
```

Then open `/host` to drive a race: create → open betting → close betting → start.

---

## Environment variables

### `api/.env`

| Variable       | Required | Default | Purpose                                            |
| -------------- | -------- | ------- | -------------------------------------------------- |
| `DATABASE_URL` | ✅       | —       | PostgreSQL connection string (app + migrations)     |
| `PORT`         | —        | `3000`  | HTTP and Socket.IO listen port                      |

### `web/.env.local`

| Variable              | Required | Default                 | Purpose                             |
| --------------------- | -------- | ----------------------- | ----------------------------------- |
| `NEXT_PUBLIC_API_URL` | —        | `http://localhost:3000` | Base URL for REST **and** Socket.IO |

Real `.env` files are git-ignored repo-wide. Only `.example` files are committed.

---

## The game lifecycle

A race is a strict state machine. Illegal transitions are rejected with a `400`,
not silently ignored.

```
WAITING ──▶ BETTING ──▶ BETTING_CLOSED ──▶ COUNTDOWN ──▶ RACING ──▶ RESULTS
```

| Phase            | What happens                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `WAITING`        | Race created with a `randomUUID()` seed and 5 horses assigned to lanes 1–5.                                                          |
| `BETTING`        | Players place **one bet each**. Coins deduct atomically; odds recompute and broadcast on every bet.                                  |
| `BETTING_CLOSED` | Odds **freeze** into `Race.finalOdds`, so payouts settle at the price bettors actually saw.                                          |
| `COUNTDOWN`      | Server-timed 3 → 2 → 1, one second apart. The client never owns the clock.                                                           |
| `RACING`         | Every connected player receives 2 random power-ups. The engine simulates and streams positions ~every 100 ms.                        |
| `RESULTS`        | Finish positions written, bets settled, winners credited, bailouts applied, leaderboard rebroadcast — all in a single transaction.    |

Only one race runs at a time in this version.

---

## Core mechanics

### Pari-mutuel odds

There is no bookmaker. The players *are* the market:

```
odds(horse) = totalPool / poolOn(horse)
```

A horse with no money on it has `null` odds (rendered `—`) rather than `Infinity`.
Only first place pays: `payout = round(betAmount × winnerOdds)`, using the **frozen**
odds. Backing the favourite is safe and cheap; backing the horse nobody believes in
is how you get rich.

### The race engine

Deterministic and reproducible — `mulberry32` seeded from the race's `seed`, so the
same seed always produces the same race.

- Track length `1000` units, `50 ms` internal tick, broadcast every 2nd tick
- Horse stats (`speed`, `acceleration`, `stamina`, `chaos`) apply a **deliberately
  small** nudge next to the RNG term
- Stamina-based fatigue kicks in past 60% of the race

The fastest horse on paper does **not** automatically win. That is the point — it
keeps the betting interesting and the chaos honest.

### The horses

| Horse                 | Speed | Accel | Stamina | Chaos |
| --------------------- | ----- | ----- | ------- | ----- |
| El Backend            | 55    | 45    | 60      | 20    |
| NullPointer           | 40    | 65    | 35      | 70    |
| CSS Master            | 50    | 50    | 50      | 50    |
| Segmentation Fault    | 70    | 30    | 45      | 60    |
| localhost:3000        | 45    | 55    | 65      | 30    |

### Power-ups

Two per connected player, granted at race start, weighted `TURBO 35 · SLOW 35 ·
BOMB 15 · SHIELD 15`. Every use is **server-validated** — the client sends an
intent, never an effect.

| Power-up | Effect                                                    |
| -------- | --------------------------------------------------------- |
| `TURBO`  | ×1.3 speed for 3 s                                        |
| `SLOW`   | ×0.75 speed for 3 s                                       |
| `BOMB`   | Speed to 0 for 1 s, plus an instant −25 position knockback |
| `SHIELD` | Blocks incoming effects on that lane for 4 s              |

A blocked attempt still consumes the attacker's power-up. Choose your moment.

### Going broke

Hit exactly 0 coins after a race you bet on and you get a **300-coin bailout**.
Nobody gets permanently eliminated from a party game.

---

## HTTP API

Base URL `http://localhost:3000`. Authenticated routes take an `x-session-token` header.

| Method | Path                               | Auth   | Purpose                                      |
| ------ | ---------------------------------- | ------ | -------------------------------------------- |
| `POST` | `/sessions/register`               | —      | Create account (1000 starting coins)          |
| `POST` | `/sessions/login`                  | —      | Log in; rotates the session token             |
| `GET`  | `/races/current`                   | —      | Current race snapshot with live odds          |
| `POST` | `/races/:id/bets`                  | Player | Place a bet (`{ horseId, amount }`)           |
| `GET`  | `/races/:id/results`               | Player | Standings plus the caller's own bet/payout    |
| `GET`  | `/leaderboard`                     | —      | Top 20 players by coins                       |
| `POST` | `/admin/races`                     | Admin  | Create a race → `WAITING`                     |
| `POST` | `/admin/races/:id/open-betting`    | Admin  | → `BETTING`                                   |
| `POST` | `/admin/races/:id/close-betting`   | Admin  | → `BETTING_CLOSED`, freezes odds              |
| `POST` | `/admin/races/:id/start`           | Admin  | → `COUNTDOWN` → `RACING` → `RESULTS`          |

Admin routes are guarded at the **controller** level, so they fail closed by construction.

---

## WebSocket events

Socket.IO shares the API's HTTP port. The handshake requires
`auth.sessionToken`; an invalid token gets a `game:error` and an immediate disconnect.

### Client → server

| Event            | Payload                 | Purpose                                     |
| ---------------- | ----------------------- | ------------------------------------------- |
| `powerup:use`    | `{ powerupId, lane }`   | Request a power-up; the server decides all   |
| `session:resume` | —                       | Ask for a full rehydration snapshot          |

### Server → client

| Event                | Scope     | Purpose                                              |
| -------------------- | --------- | ---------------------------------------------------- |
| `lobby:update`       | broadcast | Connected player list, on every connect/disconnect   |
| `betting:opened`     | broadcast | Betting is open, with the odds snapshot              |
| `odds:updated`       | broadcast | Odds moved after an accepted bet                     |
| `betting:closed`     | broadcast | Betting is closed                                    |
| `race:countdown`     | broadcast | 3, 2, 1 — server-timed                               |
| `race:started`       | broadcast | Simulation begins                                    |
| `race:update`        | broadcast | Position tick (~100 ms)                              |
| `race:event`         | broadcast | Horse finished, power-up fired, or power-up blocked  |
| `race:finished`      | broadcast | Final standings                                      |
| `leaderboard:updated`| broadcast | Rebroadcast after each settlement                    |
| `powerup:received`   | targeted  | The two power-ups granted at race start              |
| `coins:updated`      | targeted  | Balance change (`race_payout` or `bailout`)          |
| `session:resumed`    | socket    | Reply to `session:resume`                            |
| `game:error`         | socket    | Auth failure or a rejected action                    |

---

## Data model

| Model           | Purpose                                                                            |
| --------------- | ---------------------------------------------------------------------------------- |
| `Player`        | Username, scrypt password hash, rotating session token, coins, `isAdmin`             |
| `Race`          | Status, deterministic `seed`, timestamps, frozen `finalOdds`                         |
| `Horse`         | Name and four stats: speed, acceleration, stamina, chaos                             |
| `RaceHorse`     | Join row: lane assignment and finish position                                        |
| `Bet`           | Amount and payout — `@@unique([playerId, raceId])` enforces one bet per race in the DB |
| `PlayerPowerUp` | Type, used flag, target lane                                                         |

Passwords use node's `crypto.scrypt` with a per-user salt and `timingSafeEqual`
verification. Session credentials are opaque UUIDs rotated on every login.

---

## Project structure

```
.
├── api/                      NestJS backend (pnpm)
│   ├── prisma/               schema + 6 migrations
│   ├── src/
│   │   ├── auth/             player and admin guards
│   │   ├── game/             state machine, race engine, odds, controllers
│   │   ├── players/          lobby gateway
│   │   ├── prisma/           Prisma service
│   │   └── sessions/         register/login, password hashing
│   └── docker-compose.yml    postgres + api
├── web/                      Next.js frontend (npm)
│   ├── app/                  join · lobby · race · leaderboard · host
│   ├── components/           UI kit
│   ├── lib/                  shared socket singleton, config
│   └── store/                zustand session store
└── .github/workflows/ci.yml  lint + build + test, per app
```

---

## Development

```bash
# api
cd api
pnpm run start:dev      # watch mode
pnpm run lint           # oxlint
pnpm run test           # vitest
pnpm run test:e2e       # supertest
pnpm exec prisma studio # inspect the database

# web
cd web
npm run dev
npm run lint
npm run build
```

### Honest note on test coverage

Test coverage is currently **minimal** — only the NestJS scaffold specs exist. The
odds calculation, race engine, betting flow, power-up validation, and guards are
untested. They are pure, deterministic, and seeded, which makes them unusually easy
to test. This is the most valuable contribution the project could receive right now.

---

## Roadmap

- [ ] Test suite for odds, race engine, and power-up validation
- [ ] Concurrent races (the current version tracks a single in-flight race)
- [ ] An admin bootstrap command, so `isAdmin` doesn't require manual SQL
- [ ] Race history and per-player statistics
- [ ] Rate limiting on betting and power-up use

---

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow,
commit convention, and quality bar. Security reports go through
[SECURITY.md](SECURITY.md), never a public issue.

## License

[MIT](LICENSE) © Santiago Luis Ocón
