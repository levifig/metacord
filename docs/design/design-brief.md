# DSM (Discord Server Manager) - Design Brief

## Overview

DSM is a personal Discord server directory that allows users to view, organize, and manage their Discord server memberships through a clean web interface.

## Goals

- Recreate the prototype layout with a deliberate, cohesive visual system
- Improve scannability of large server lists without adding visual noise
- Keep UI compact, fast, and accessible for keyboard and screen reader users
- Preserve MVP scope: list, search, filters, favorites, stats, modals, export/import, widget fetch
- Dark theme only; no light theme variants required

## Information Architecture

```
DSM App
├── Login (Standalone screen)
└── App Shell (authenticated)
    ├── Header
    │   ├── Title + subtitle
    │   ├── Stats row (Total, Favorites, Owned, Public)
    │   └── Actions (Import, Export, Fetch Public Info, Instructions)
    ├── Search + Filters
    │   ├── Search input
    │   └── Filter chips (Owner, Partner, Verified, Boosted, Discoverable)
    ├── Sections
    │   ├── Favorites
    │   ├── Owned
    │   ├── Public (widget enabled)
    │   └── Private
    ├── Legend
    └── Footer
```

### Modals

- Fetch Public Info (3-step wizard)
- Instructions
- Server Details (view/edit nickname, notes)
- Toast Notifications (global)

## Wireframes

### Login - Desktop

- Centered panel on subtle background
- Brand mark + "Discord Server Manager"
- Title: "Welcome back"
- Body: "No data stored on servers. Everything stays in your device."
- Primary CTA: "Log in with Discord" (full-width)
- Secondary link: Privacy/FAQ

### Login - Mobile

- Full-height layout, stacked content
- Primary CTA spans full width
- Secondary link below CTA

### Home - Desktop

- Stats row: 4 compact tiles with accent numerals
- Action row: Import, Export, Fetch Public Info, Instructions
- Search: single input (max 420px), helper text when empty
- Filters: "FILTERS:" label + chips + "Clear" link (multi-select AND logic)
- Sections: header with label + count, grid of cards (3-up at 1200px)
- Empty sections hidden

### Home - Mobile

- Header stacks vertically
- Stats in 2x2 grid
- Actions as full-width buttons
- Filters wrap to 2 rows
- Server cards in 1 column

### Server Card

- Left: icon (48px) with fallback letter
- Center: name (nickname emphasized), real name below if different
- Right: favorite toggle (star), invite link if public
- Meta row: online count (dot + number), badges
- Banner blur background when present
- Whole card opens details; star toggle is separate action

### Server Detail Modal

- Header: icon + name, close button
- Body: ID row with copy, stats (joined, roles, widget), nickname/notes fields
- Actions: Save, Cancel

## Component States

### Buttons

- Primary/Secondary/Danger: default, hover, focus, active, disabled

### Inputs

- Search: default, hover, focus, filled, error
- Text fields: default, focus, error, disabled

### Filter Chips

- Default, hover, focus, active (multi-select supported)

### Cards

- Default, hover, focus-within, starred, owned, banner-present

### Badges

- Partner (blue), Verified (green), Boosted (pink), Discoverable (gold), Owner (gold)

### Modal

- Overlay, container, header, body, footer
- States: open, closing, focus trap active

### Toast

- Success, error, info
- States: entering, visible, exiting

## Design Tokens

### Typography

```css
--font-display: "Space Grotesk", "IBM Plex Sans", system-ui, sans-serif;
--font-mono: "IBM Plex Mono", "SF Mono", monospace;

--text-xs: 0.75rem;
--text-sm: 0.875rem;
--text-base: 1rem;
--text-lg: 1.125rem;
--text-xl: 1.25rem;
--text-2xl: 1.5rem;
--text-3xl: 1.875rem;
```

### Color

```css
--color-bg: #0d0f12;
--color-surface-1: #161a20;
--color-surface-2: #1c222b;
--color-surface-3: #262d38;
--color-border: #2f3743;

--color-text: #f5f7fb;
--color-text-muted: #b2bccb;
--color-text-dim: #8a95a6;

--color-accent: #4aa8ff;
--color-accent-strong: #1f7fe0;
--color-success: #38b36b;
--color-warning: #f5b044;
--color-danger: #e24b4b;
--color-focus: #ffd166;
```

### Spacing

```css
--space-1: 0.25rem;
--space-2: 0.5rem;
--space-3: 0.75rem;
--space-4: 1rem;
--space-5: 1.25rem;
--space-6: 1.5rem;
--space-8: 2rem;
--space-12: 3rem;
```

### Radius

```css
--radius-2: 4px;
--radius-3: 6px;
--radius-4: 8px;
--radius-5: 12px;
--radius-pill: 999px;
```

### Shadow

```css
--shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
--shadow-2: 0 8px 20px rgba(0, 0, 0, 0.35);
--shadow-3: 0 16px 40px rgba(0, 0, 0, 0.45);
```

## Motion

- Page load: header/stats/first section fade up with 80ms stagger
- Card hover: raise 2px, border shifts to accent
- Favorite toggle: 120ms scale-in
- Modal: 160ms ease-out scale from 0.98
- Toast: slide up 160ms, auto-dismiss 3000ms
- Progress bar: smooth width at 150ms
- Respect `prefers-reduced-motion`: disable transforms

## Accessibility

- Contrast: text 4.5:1+, large text 3:1+, UI elements 3:1+
- Focus ring: 2px solid `--color-focus` with 2px offset
- All icons/badges have text labels or aria-labels
- Star button uses `aria-pressed`
- Modals: focus trap, Escape to close, return focus to trigger
- Touch targets: minimum 44x44px
- Error messages via `role="alert"`

## Visual Direction

- Mood: "midnight dashboard" - cool steel surfaces, crisp blue accent, warm focus highlight
- Structure: strong grid, consistent card rhythm, clear section hierarchy
- Texture: subtle radial gradient background
- Emphasis: light text + accent numerals for scanning
