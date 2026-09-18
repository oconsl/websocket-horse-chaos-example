# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-18

First public release. Consolidates the previously separate `api` and `web`
repositories into a single monorepo, preserving the full history of both.

### Added

**Game**

- Six-phase race state machine: `WAITING → BETTING → BETTING_CLOSED → COUNTDOWN → RACING → RESULTS`, with illegal transitions rejected.
- Deterministic server-side race engine seeded with `mulberry32`, streaming position updates roughly every 100 ms over Socket.IO.
- Pari-mutuel betting with live odds, frozen at `BETTING_CLOSED` so payouts settle at the price bettors saw.
- Power-up system — `TURBO`, `SLOW`, `BOMB`, and `SHIELD` — fully validated server-side.
- Payout settlement, a 300-coin bailout for broke players, and a live top-20 leaderboard.
- Five seeded horses with speed, acceleration, stamina, and chaos stats.

**API (`api/`)**

- NestJS 12 application with Socket.IO gateways for the lobby and the game.
- Username and password authentication using `crypto.scrypt` with `timingSafeEqual` verification, and opaque session tokens rotated on every login.
- Admin-gated race control routes, guarded at the controller level.
- Prisma 7 schema with six migrations against PostgreSQL 16.
- Multi-stage Dockerfile and a `docker-compose.yml` for the database and API.

**Web (`web/`)**

- Next.js 16 App Router client with join, lobby, race, leaderboard, and host screens.
- A single shared Socket.IO instance per tab, so client-side navigation never duplicates emits.
- Session resume across reloads and reconnects, restoring bet, coins, power-ups, and live horse positions.
- Visual design system with design tokens, dark mode, and per-horse identity.

**Repository**

- Root documentation: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, and this changelog.
- GitHub Actions CI running lint, build, and tests for each application.
- Issue and pull request templates, Dependabot configuration, MIT license, `.editorconfig`, and `.nvmrc`.

### Known limitations

- Test coverage is minimal — only the framework scaffold specs exist.
- Only one race can be in flight at a time.
- Granting `isAdmin` requires editing the database directly; there is no bootstrap command.

[Unreleased]: https://github.com/oconsl/websocket-horse-chaos-example/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/oconsl/websocket-horse-chaos-example/releases/tag/v0.1.0
