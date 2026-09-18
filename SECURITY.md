# Security Policy

## Scope and intent

This project is an **educational demo** built to teach real-time architecture with
WebSockets. It is not hardened for production use. Please do not deploy it as-is
with real users, real money, or real personal data.

Known, deliberate limitations of the demo:

- Session tokens are opaque UUIDs stored client-side, not signed/expiring JWTs.
- The bundled `docker-compose.yml` ships well-known local development credentials.
  They exist so the stack runs with one command and must never be reused elsewhere.
- There is no rate limiting, CSRF protection, or audit logging.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through
[GitHub Security Advisories](https://github.com/oconsl/websocket-horse-chaos-example/security/advisories/new).

Include a description of the issue, the affected component (`api` or `web`), and
a minimal reproduction. You can expect an initial response within 7 days.

## Handling secrets

Never commit real credentials. `.env` files are ignored by git across the repo —
`api/.env.example` documents the required variable names with placeholder values
only. If you believe a secret was committed, rotate it first, then report it.
