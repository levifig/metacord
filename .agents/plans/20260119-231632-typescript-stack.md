# Discord Manager — TypeScript Stack Implementation Plan

## Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | **pnpm + Wrangler** | Package manager + local dev/preview (no Bun runtime) |
| Backend | **Hono** | Lightweight Workers framework, routing, middleware |
| Frontend | **Vite + TypeScript** | Build tool, HMR, module bundling |
| Hosting | **Cloudflare Pages** | Static frontend + Functions |
| Storage | **Workers KV** | Session storage |

## Project Structure (Target)

```
discord-manager/
├── src/                          # Frontend (Vite)
│   ├── index.html                # Entry HTML
│   ├── main.ts                   # Entry TypeScript
│   ├── style.css                 # Styles (extracted from HTML)
│   ├── lib/
│   │   ├── api.ts                # API client
│   │   ├── storage.ts            # localStorage helpers
│   │   └── types.ts              # Shared types
│   └── components/
│       ├── server-card.ts        # Server card rendering
│       ├── modal.ts              # Modal management
│       └── filters.ts            # Search/filter logic
├── functions/                    # Backend (Hono)
│   └── api/
│       └── [[route]].ts          # Hono catch-all handler
├── shared/
│   └── types.ts                  # Types shared between frontend/backend
├── docs/
│   └── PRD.md
├── vite.config.ts
├── wrangler.toml
├── package.json
├── tsconfig.json
└── tsconfig.node.json
```

## Implementation Steps

### 1. Update package.json with new dependencies

Add:
- `hono` — Backend framework
- `vite` — Frontend build tool
- `typescript` — Already have, keep
- `@cloudflare/workers-types` — Already have, keep

### 2. Configure Vite

Create `vite.config.ts`:
- Output to `dist/` for Cloudflare Pages
- Configure dev server proxy to Workers

### 3. Restructure Backend with Hono

Replace individual function files with single Hono app:

**`functions/api/[[route]].ts`** (catch-all route):
```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono<{ Bindings: Env }>();

// Auth routes
app.get('/api/auth/login', authLogin);
app.get('/api/auth/callback', authCallback);
app.get('/api/auth/logout', authLogout);

// API routes
app.get('/api/me', getMe);
app.get('/api/guilds', getGuilds);
app.get('/api/guilds/:id', getGuildMember);
app.get('/api/widget/:id', getWidget);

export const onRequest = app.fetch;
```

### 4. Restructure Frontend

Split `index.html` into modules:

- **`src/index.html`** — Minimal HTML shell
- **`src/main.ts`** — Entry point, initialization
- **`src/style.css`** — All CSS (extracted from HTML)
- **`src/lib/api.ts`** — Fetch helpers for `/api/*` endpoints
- **`src/lib/storage.ts`** — localStorage data layer
- **`src/lib/types.ts`** — TypeScript interfaces
- **`src/components/server-card.ts`** — Card creation/rendering
- **`src/components/modal.ts`** — Modal show/hide/content
- **`src/components/filters.ts`** — Search, filter buttons

### 5. Update wrangler.toml

```toml
pages_build_output_dir = "dist"  # Vite output
```

### 6. Update scripts in package.json

```json
{
  "scripts": {
    "dev": "concurrently -k \"pnpm run dev:api\" \"pnpm run dev:ui\"",
    "dev:ui": "vite",
    "dev:api": "wrangler pages dev ./ --kv=SESSIONS",
    "build": "vite build",
    "preview": "wrangler pages dev dist --kv=SESSIONS",
    "deploy": "pnpm run build && wrangler pages deploy dist"
  }
}
```

All commands use **pnpm** as the package manager and script runner.

## Files to Modify

| File | Action |
|------|--------|
| `package.json` | Add hono, vite deps; update scripts |
| `wrangler.toml` | Change output dir to `dist` |
| `tsconfig.json` | Update for Vite compatibility |
| `functions/api/*.ts` | Consolidate into single Hono app |
| `src/index.html` | Strip JS/CSS, add Vite entry |
| (new) `src/main.ts` | Frontend entry point |
| (new) `src/style.css` | Extracted styles |
| (new) `src/lib/*.ts` | API, storage, types |
| (new) `src/components/*.ts` | UI components |
| (new) `vite.config.ts` | Vite configuration |

## Verification

1. `pnpm install` — Dependencies install without errors
2. `pnpm run dev` — Vite + Wrangler start together, Wrangler proxies to Vite
3. `pnpm run preview` — Full stack runs locally with Workers
4. Auth flow works: login → Discord → callback → session
5. API endpoints respond: `/api/me`, `/api/guilds`
6. Frontend fetches and displays data
7. `pnpm run build` — Production build succeeds

## Notes

- Hono's catch-all `[[route]].ts` pattern is the recommended approach for Cloudflare Pages Functions
- Wrangler is the dev entry, proxying `/` to Vite and `/api/*` to Workers
- Optional scripts: `dev:ui` for Vite only, `dev:api` for Wrangler only
- The frontend code stays vanilla (no React/Vue), just organized into modules
- OAuth/session defaults: 30m session, 90d refresh, `__Host-session` cookie, PKCE, AES-GCM encryption
- API caching defaults: guilds 600s / SWR 300s; member 45s / SWR 60s; widget 60s / SWR 120s
- Storage scope: user data in localStorage only, sessions in KV

---

## Changelog

- 2025-01-19 15:00 - Initial plan created
