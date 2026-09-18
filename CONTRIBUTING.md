# Contributing

Thanks for taking the time to contribute. This document covers the workflow,
conventions, and quality bar for this repository.

## Repository layout

This is a monorepo with two independently managed applications:

| Path   | Application     | Package manager |
| ------ | --------------- | --------------- |
| `api/` | NestJS backend  | **pnpm**        |
| `web/` | Next.js frontend| **npm**         |

They are intentionally not a single workspace — each app installs, builds, and
tests on its own. Run commands from inside the app directory.

## Getting set up

Use the Node version pinned in [`.nvmrc`](.nvmrc):

```bash
nvm use
corepack enable   # required for pnpm in api/
```

Then follow the "Getting started" section of the [README](README.md).

## Before you open a pull request

Every affected app must pass its own checks:

```bash
# api
cd api && pnpm run lint && pnpm run build && pnpm run test

# web
cd web && npm run lint && npm run build
```

CI runs exactly these commands, so a green local run means a green pipeline.

## Commit convention

This repository uses [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>(<scope>): <subject>
```

- **type**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `build`, `ci`, `chore`
- **scope**: `api`, `web`, or a more specific module (`auth`, `race`, `host`)
- **subject**: imperative mood, lower case, no trailing period

Examples from this repo's history:

```
feat(auth): add username+password register/login flow
feat(race): render live race simulation, countdown, and results
fix: rename prisma7.config.ts to prisma.config.ts for CLI auto-detect
```

## Pull requests

- Keep each PR to a single reviewable unit of work. If a change grows past
  roughly 400 lines of real diff, split it into a chain of smaller PRs.
- Fill in the PR template: what changed, why, and how to verify it.
- Include tests alongside behaviour changes, in the same PR as the code.
- Never include `.env` files, credentials, or generated output
  (`dist/`, `.next/`, `node_modules/`) in a diff.

## Code style

- TypeScript everywhere, with `strict` mode respected.
- `api/` lints with **oxlint** and formats with **Prettier**.
- `web/` lints with **ESLint** (`eslint-config-next`).
- Code, comments, identifiers, and documentation are written in **English**.

## Database changes

Schema lives in [`api/prisma/schema.prisma`](api/prisma/schema.prisma). After
editing it:

```bash
cd api
pnpm exec prisma migrate dev --name <descriptive_name>
pnpm exec prisma generate
```

Commit the generated migration directory together with the schema change.
