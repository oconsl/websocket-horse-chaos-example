# Horse Chaos — API

The NestJS backend for [Horse Chaos](../README.md). It owns the race state machine,
the deterministic race simulation, pari-mutuel odds, payouts, and the Socket.IO
gateways.

> Start with the [root README](../README.md) for the architecture overview, the full
> HTTP and WebSocket reference, and the game rules. This file covers only how to run
> and work on the API.

## Stack

NestJS 12 (ESM) · Socket.IO 4 · Prisma 7 · PostgreSQL 16 · TypeScript 6 · Node 22 · pnpm

## Setup

```bash
corepack enable
pnpm install

docker compose up -d db          # PostgreSQL on 127.0.0.1:5432
cp .env.example .env             # then set DATABASE_URL

pnpm exec prisma migrate deploy
pnpm exec prisma generate

pnpm run start:dev               # http://localhost:3000
```

The five horses are seeded on module init — there is no separate seed step.

## Scripts

| Command             | Purpose                              |
| ------------------- | ------------------------------------ |
| `pnpm run start:dev`| Watch mode                           |
| `pnpm run build`    | Compile to `dist/`                   |
| `pnpm run start:prod`| Run the compiled build              |
| `pnpm run lint`     | oxlint over `src/` and `test/`       |
| `pnpm run format`   | Prettier                             |
| `pnpm run test`     | Vitest unit tests                    |
| `pnpm run test:cov` | Vitest with coverage                 |
| `pnpm run test:e2e` | Supertest end-to-end suite           |

## Environment

| Variable       | Required | Default | Purpose                                        |
| -------------- | -------- | ------- | ---------------------------------------------- |
| `DATABASE_URL` | ✅       | —       | PostgreSQL connection string (app + migrations) |
| `PORT`         | —        | `3000`  | HTTP and Socket.IO listen port                  |

Never commit a real `.env` — only `.env.example` is tracked.

## Docker

```bash
docker compose up -d db          # database only, for local development
docker compose up --build        # database + API, migrations applied on boot
```

## Layout

```
src/
├── auth/       PlayerAuthGuard and AdminGuard
├── game/       state machine, race engine, odds, race + admin + leaderboard controllers
├── players/    lobby gateway (connect/disconnect presence)
├── prisma/     Prisma service using the @prisma/adapter-pg driver adapter
└── sessions/   register/login and scrypt password hashing
prisma/         schema.prisma and migrations
```

## Database changes

```bash
pnpm exec prisma migrate dev --name <descriptive_name>
pnpm exec prisma generate
pnpm exec prisma studio          # inspect data; also how you grant isAdmin
```

Commit the generated migration directory together with the schema change.

## License

[MIT](../LICENSE)
