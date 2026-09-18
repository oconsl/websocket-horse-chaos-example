# Horse Chaos — Web

The Next.js frontend for [Horse Chaos](../README.md). It renders the lobby, the live
race, betting, power-ups, and the leaderboard. It never simulates anything — the
server owns the truth and this client draws it.

> Start with the [root README](../README.md) for the architecture overview, the full
> HTTP and WebSocket reference, and the game rules. This file covers only how to run
> and work on the web app.

## Stack

Next.js 16 (App Router) · React 19 · zustand 5 · socket.io-client 4 · TypeScript · Node 22 · npm

## Setup

Start the [API](../api/README.md) first, then:

```bash
npm install
npm run dev -- -p 3001           # http://localhost:3001
```

> **⚠️ Port collision.** The API defaults to `3000` and so does `next dev`. Run the
> web app on another port as above, or move the API with its `PORT` variable and
> point `NEXT_PUBLIC_API_URL` at the new address.

## Scripts

| Command         | Purpose                        |
| --------------- | ------------------------------ |
| `npm run dev`   | Development server             |
| `npm run build` | Production build               |
| `npm run start` | Serve the production build     |
| `npm run lint`  | ESLint (`eslint-config-next`)  |

## Environment

| Variable              | Required | Default                 | Purpose                             |
| --------------------- | -------- | ----------------------- | ----------------------------------- |
| `NEXT_PUBLIC_API_URL` | —        | `http://localhost:3000` | Base URL for REST **and** Socket.IO |

Set it in `web/.env.local`, which is git-ignored.

## Routes

| Route          | Purpose                                                                       |
| -------------- | ----------------------------------------------------------------------------- |
| `/`            | Hydrates the stored session, then redirects to `/lobby` or `/join`             |
| `/join`        | Login and registration                                                         |
| `/lobby`       | Live connected players, coin balance, navigation                               |
| `/race`        | The main screen: betting, live track, power-ups, event feed, results           |
| `/leaderboard` | Top players, live-updating after every race                                    |
| `/host`        | Admin panel to drive a race (requires `isAdmin`)                               |

## Layout

```
app/          route segments (join, lobby, race, leaderboard, host)
components/   UI kit and shared visual components
lib/          socket.ts (shared Socket.IO singleton) and config.ts
store/        zustand session store, persisted to localStorage
```

## Two things to know before editing

1. **There is exactly one socket per tab.** `lib/socket.ts` holds a module-level
   singleton. Do not call `io()` inside a page — creating a socket per page caused
   duplicate targeted emits. This is also why navigation uses `next/link` rather
   than full page loads: it keeps the connection alive.

2. **The session store hydrates manually.** `store/session.ts` uses zustand
   `persist` with `skipHydration: true`; `lib/useHydrateSession.ts` drives
   hydration so server and client renders stay consistent.

## License

[MIT](../LICENSE)
