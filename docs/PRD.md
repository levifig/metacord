# Metacord - Your Personal Discord Server Directory — Product Requirements Document

## Overview

Metacord - Your Personal Discord Server Directory is a Discord server directory that allows users to view, organize, and manage their Discord server memberships through a clean web interface. Users authenticate via Discord OAuth, eliminating manual token handling and enabling seamless access to their server data.

## Problem Statement

Discord users who are members of many servers lack visibility into:
- When they joined each server
- Which servers have public widgets/invites
- A unified view of all their memberships with custom organization (favorites, nicknames, notes)

Currently, getting this information requires manual API calls with user tokens, which is:
- Tedious and error-prone
- Requires technical knowledge
- Poses security risks if tokens are mishandled

## Solution

A web application that:
1. Authenticates users via Discord OAuth (secure, no token handling)
2. Fetches and displays all server memberships with rich metadata
3. Provides organization tools (favorites, nicknames, notes, filtering)
4. Stores user preferences locally with optional cloud sync

## Architecture

All infrastructure hosted on Cloudflare. GitHub used for version control only.

```
+-----------------------------------------------------------------+
|                     GitHub Repository                           |
|                      (Version Control)                          |
+-----------------------------------------------------------------+
                                |
                                | auto-deploy on push
                                v
+-----------------------------------------------------------------+
|                    Cloudflare Platform                          |
|                                                                 |
|  +-----------------------------------------------------------+  |
|  |                  Cloudflare Workers                       |  |
|  |                (Static Assets SPA)                        |  |
|  |              discord.yourdomain.com                       |  |
|  +-----------------------------------------------------------+  |
|                                |                                |
|                                v                                |
|  +-----------------------------------------------------------+  |
|  |                Worker API (Hono Router)                   |  |
|  |           src/worker.ts (assets + API)                    |  |
|  |           discord.yourdomain.com/api/*                    |  |
|  |                                                           |  |
|  |  * GET  /api/auth/login     - Redirect to Discord OAuth   |  |
|  |  * GET  /api/auth/callback  - Exchange code for token     |  |
|  |  * POST /api/auth/logout    - Clear session               |  |
|  |  * GET  /api/me             - Get current user info       |  |
|  |  * GET  /api/guilds         - Fetch user's guilds         |  |
|  |  * GET  /api/guilds/:id     - Fetch guild member details  |  |
|  |  * GET  /api/widget/:id     - Fetch public widget data    |  |
|  +-----------------------------------------------------------+  |
|                                |                                |
|                                v                                |
|  +-----------------------------------------------------------+  |
|  |                    Workers KV                             |  |
|  |       (Encrypted Session Storage, AES-GCM tokens)         |  |
|  +-----------------------------------------------------------+  |
+-----------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|                        Discord API                              |
|                    (v10, OAuth2 + REST)                         |
+-----------------------------------------------------------------+
```

### Why This Architecture

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Version Control | GitHub | Industry standard, CI/CD integration |
| Frontend Host | Cloudflare Workers (Assets) | Free, auto-deploy from GitHub, global CDN, same-domain as API |
| Backend | Cloudflare Workers | Free tier (100k req/day), global edge, no cold starts, native asset integration |
| Session Storage | Workers KV | Simple key-value, integrated with Workers, 100k reads/day free |
| User Data | localStorage + export | Privacy-first, user owns their data |

### Benefits of All-Cloudflare

- **Single platform** — unified dashboard, billing, and domain management
- **No CORS issues** — Assets and API share the same domain
- **Auto-deployment** — push to GitHub triggers automatic deploy
- **Global edge** — both frontend and API served from 300+ locations
- **Zero cold starts** — Workers are always warm
- **Generous free tier** — suitable for personal use without cost

## Discord OAuth Configuration

### Required Scopes

| Scope | Purpose |
|-------|---------|
| `identify` | Get user ID, username, avatar |
| `guilds` | List all servers user is a member of |
| `guilds.members.read` | Get join date, nickname, roles per server |

### OAuth Flow (PKCE)

1. User clicks "Login with Discord"
2. Worker generates `state`, `code_verifier`, and `code_challenge` (S256)
3. Redirect to Discord authorization URL with challenge
4. User approves requested scopes
5. Discord redirects to callback URL with authorization code
6. Worker exchanges code + `code_verifier` for tokens (using client_secret)
7. Worker encrypts tokens (AES-GCM) and stores in KV with session ID
8. Frontend receives `__Host-session` cookie (HttpOnly, Secure, SameSite=Lax)
9. Subsequent API calls include session cookie, Worker proxies to Discord

## Features

### Core (MVP)

| Feature | Description | Priority |
|---------|-------------|----------|
| Discord OAuth Login | One-click authentication | P0 |
| Server List | Display all servers with icon, name, member count | P0 |
| Join Date | Show when user joined each server | P0 |
| Favorites | Star/unstar servers for quick access | P0 |
| Search | Filter servers by name | P0 |
| Server Details Modal | View full details, edit nickname/notes | P0 |
| Export/Import | Backup and restore user data (JSON) | P0 |
| Responsive Design | Mobile-friendly interface | P0 |
| Demo Mode | Preview UI with local `guilds_api.json` via `?demo=1` | P0 |

### Enhanced (Post-MVP)

| Feature | Description | Priority |
|---------|-------------|----------|
| Widget Data | Online count, instant invite (for enabled servers) | P1 |
| Sorting Options | By name, join date, member count | P1 |
| Filter by Features | Partner, Verified, Boosted, Discoverable | P1 |
| Bulk Actions | Mass favorite/unfavorite | P2 |
| Server Categories | Custom grouping beyond favorites | P2 |
| Role Information | Display user's roles per server | P2 |
| Leave Server | Leave directly from the app (requires additional scope) | P3 |
| Notifications | Alert when server features change | P3 |

## Data Model

### Server Object (stored in localStorage)

```javascript
{
  "id": "123456789",
  "name": "Server Name",
  "icon": "hash_or_null",
  "banner": "hash_or_null",
  "owner": false,
  "features": ["VERIFIED", "DISCOVERABLE"],
  "member": {
    "joined_at": "2023-01-15T10:30:00.000Z",
    "nickname": "MyNick",
    "roles": ["role_id_1", "role_id_2"]
  },
  "widget": {
    "instant_invite": "https://discord.gg/abc123",
    "presence_count": 1234,
    "last_cached": "2024-01-15T10:30:00.000Z"
  },
  "user_data": {
    "starred": true,
    "nickname": "Custom Display Name",
    "notes": "User's personal notes",
    "added_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### Session Object (stored in Workers KV)

```javascript
{
  "user_id": "discord_user_id",
  "access_token": "aes-gcm-encrypted",
  "refresh_token": "aes-gcm-encrypted",
  "expires_at": 1705320000000,
  "created_at": 1705312800000
}
```

**Session Details:**
- Cookie: `__Host-session` (HttpOnly, Secure, SameSite=Lax)
- Session TTL: 30 minutes (rolling, refreshed on each request)
- Refresh token: 90 days (Discord default)
- Token encryption: AES-GCM with `SESSION_SECRET` env var

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Token exposure | Tokens stored server-side in Workers KV, never sent to frontend |
| XSS | No innerHTML, CSP headers, sanitized user input |
| CSRF | SameSite cookies, origin validation |
| Session hijacking | Secure, HttpOnly cookies; short expiration with refresh |
| Data privacy | User data stored locally; no analytics/tracking |

## API Caching

Edge caching via Cloudflare Cache API with stale-while-revalidate:

| Endpoint | TTL | SWR | Visibility |
|----------|-----|-----|------------|
| `/api/guilds` | 600s | 300s | private (per-user) |
| `/api/guilds/:id` | 45s | 60s | private (per-user) |
| `/api/widget/:id` | 60s | 120s | public |

## Technical Requirements

### Project Structure

```
src/
  index.html              # SPA entry point
  main.ts                 # Application logic
  style.css               # Styles with CSS variables
  lib/
    api.ts                # API client
    storage.ts            # localStorage abstraction
    utils.ts              # Helpers
  components/
    modal.ts              # Detail modal
    serverCard.ts         # Server card component
    toast.ts              # Toast notifications
functions/
  api/
    [[route]].ts          # Hono catch-all router
  lib/
    cache.ts              # Edge cache helpers
    cookies.ts            # Cookie serialization
    crypto.ts             # AES-GCM + PKCE
    http.ts               # Response helpers
    session.ts            # Session management
    types.ts              # Shared types
shared/                   # (placeholder for shared types)
vite.config.ts            # Vite build config
wrangler.toml             # Cloudflare config
tsconfig.json             # TypeScript config
tsconfig.node.json        # Node-specific TS config
```

### Frontend
- Vite build with TypeScript
- Vanilla JS (no framework)
- CSS variables for theming
- Demo mode: `?demo=1` loads local `guilds_api.json`, uses isolated localStorage keys

### Backend (Workers)
- Hono router in `functions/api/[[route]].ts`, exposed via `src/worker.ts`
- TypeScript with strict mode
- Workers KV for encrypted session storage
- Environment variables: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `SESSION_SECRET`

### Infrastructure (Cloudflare)
- Cloudflare Workers for frontend assets (auto-deploy from GitHub)
- Worker entry for API (integrated Hono runtime)
- Workers KV for session storage
- Edge caching via Cache API
- Custom domain with automatic SSL

## User Experience

### First-Time User Flow
1. Land on homepage → see empty state with "Login with Discord" CTA
2. Click login → Discord OAuth flow
3. Return to app → see all servers populated
4. Explore, favorite, add notes
5. Optional: export data for backup

### Returning User Flow
1. Land on homepage → auto-login via session cookie
2. See cached server list immediately
3. Background refresh fetches latest data
4. UI updates with any changes

## Success Metrics

| Metric | Target |
|--------|--------|
| Login success rate | > 95% |
| Page load time | < 2s |
| Time to first meaningful paint | < 1s |
| Data fetch (all guilds + members) | < 10s |
| Export/import reliability | 100% |

## Non-Goals

- Real-time updates (WebSocket)
- Server management (settings, roles, channels)
- Multi-account support
- Social features (sharing, public profiles)
- Mobile native apps (web-only)

## Dependencies

| Dependency | Type | Risk |
|------------|------|------|
| Discord API | External | Medium — API changes, rate limits |
| Cloudflare (Workers, KV, Assets) | Infrastructure | Low — highly reliable, 99.9% SLA |
| GitHub | Version Control | Low — code only, no runtime dependency |

## Open Questions

1. **Token refresh strategy** — Refresh proactively or on-demand when expired?
2. **Offline support** — Service worker for offline viewing of cached data?
3. **Data sync** — Optional cloud backup (e.g., GitHub Gist, personal storage)?
4. **Multi-device** — How to sync favorites/notes across devices?

## Timeline

| Phase | Scope | Estimate |
|-------|-------|----------|
| Phase 1 | OAuth + basic guild list | — |
| Phase 2 | Join dates, favorites, search | — |
| Phase 3 | Widget data, filters, polish | — |
| Phase 4 | Export/import, documentation | — |

---

## Changelog

- 2025-01-19 14:30 - Initial PRD creation based on prototype development
- 2025-01-20 - Updated architecture diagram, project structure, OAuth flow (PKCE), session details, API caching, demo mode
