## Council

- Date: 2026-01-19
- Topic: Plan decisions for stack, OAuth sessions, API caching, and design collaboration.
- Members: frontend-dev, backend-dev, devops, qa, design

## Recommendations

- Stack: TypeScript + Hono + Vite on Cloudflare Pages/Workers; use pnpm + Wrangler for runtime parity; avoid relying on Bun runtime APIs.
- OAuth/session: short session cookie (15-30m) with session ID only; tokens in KV; refresh when <5 minutes to expiry or on 401; rotate refresh tokens; encrypt at rest.
- API contract/caching: /api/me, /api/guilds, /api/guilds/:id, /api/guilds/:id/member, /api/widget/:id; guild cache 600s + SWR 300s; member 45s + SWR 60s; widget 60s + SWR 120s; rate limit 30 req/s app, 10 req/s per guild, 60 req/min per IP.
- Design process: IA + wireframes, component inventory with states, lightweight tokens; checkpoints at wireframes, visual system, and usability pass.

## Decision

- Approved: pnpm + Wrangler toolchain, OAuth/session approach above, API contract/caching defaults, design collaboration workflow.
- Scope: recreate `discord-servers.html` prototype with OAuth; localStorage only for now.
