# Discord Manager Design Brief

## Goals
- Recreate the current prototype layout and features with a more deliberate, cohesive visual system.
- Improve scannability of large server lists without adding visual noise.
- Keep UI compact, fast, and accessible for keyboard and screen reader users.
- Preserve MVP scope: list, search, filters, favorites, stats, modals, export/import, widget fetch.
- Dark theme only; no light theme variants required.

## Information Architecture / Site Map
- App Shell
- Login (Standalone)
- Home (Server Directory)
  - Header (title, subtitle, stats, actions)
  - Search + Filters
  - Sections
    - Favorites
    - Owned
    - Public (widget enabled)
    - Private
  - Legend
  - Footer
- Modals
  - Fetch Public Info
  - Instructions
  - Server Details
  - Toast Notifications (global)

## Annotated Wireframes (Textual)

### 1) Login - Desktop
- Centered panel on subtle background, inspired by linear.app/login
- Brand mark + product name
- Title: Welcome back
- Body copy: Local-only storage note ("No data stored on servers. Everything stays in localStorage.")
- Copy tone: neutral, minimal phrasing throughout the login screen
- Primary CTA: Log in with Discord (full-width button)
- Secondary link: Privacy/FAQ (small, muted)

### 2) Login - Mobile
- Full-height layout with stacked content
- Brand mark, title, and local-only storage note centered
- Primary CTA spans full width, pinned above safe area
- Secondary link below CTA

### 3) Home - Desktop
- Top bar
  - H1: Discord Server Manager
  - Subtitle: Personal directory (small, muted)
  - Stats row: 4 compact tiles with accent numerals
  - Action row: Import (file input), Export, Fetch Public Info, Instructions
- Search row
  - Single input, full width (max 420px), helper text below when empty
- Filter row
  - Segmented filters: All, Owner, Partner, Verified, Boosted, Discoverable
  - Active state has filled background + underline bar
- Sections (stacked)
  - Section header with label + count badge
  - Grid of server cards, 3-up at 1200px
  - Empty sections hidden
- Legend
  - 2-column list of badge meanings
- Footer
  - Local storage note

### 4) Home - Mobile
- Header stacks: title, subtitle, stats in 2x2 grid, actions as full-width buttons
- Search input full width
- Filters wrap to 2 rows
- Server cards in 1 column with tighter spacing

### 5) Server Card
- Left: server icon (48px) with fallback letter
- Center: name (nickname emphasized), real name below if different
- Right: favorite toggle (star)
- Meta row: online count (dot + number), optional badges
- Banner blur background when present
- Interaction: whole card opens details, star toggle is separate action

### 6) Server Detail Modal
- Header: server icon + name, close button
- Body
  - ID row with copy action
  - Stats: joined date, roles count, widget presence
  - Editable fields: nickname, notes
  - Save and Cancel actions

### 7) Fetch Public Info Modal
- Step 1: Explanation, checkbox to force refresh, primary/secondary actions
- Step 2: Progress bar with current count + stop button
- Step 3: Completion summary

### 8) Empty State
- Logged-out state is the standalone Login screen (no in-app banner)

## Component Inventory + States

### Buttons
- Primary: default, hover, focus, active, disabled
- Secondary: default, hover, focus, active, disabled
- Danger: default, hover, focus, active, disabled

### Auth
- Login panel: default, loading, error
- Login CTA: default, hover, focus, active, disabled

### Inputs
- Search input: default, hover, focus, filled, error
- Text fields (modal): default, focus, error, disabled
- File input (hidden): default, focus (on label), disabled

### Filters (segmented chips)
- Default, hover, focus, active, disabled

### Cards
- Default, hover, focus-within, starred, owned, banner-present

### Badges
- Partner, Verified, Boosted, Discoverable, Owner, Favorite
- Default, high-contrast when used on dark surface

### Modal
- Overlay, dialog container, header, body, footer
- Open, closing, focus trap active

### Toast
- Success, error, info, entering, exiting

### Progress Bar
- Idle, running, stopped

## Design Tokens

### Typography
- Font family: "Space Grotesk", "IBM Plex Sans", system sans
- Mono: "IBM Plex Mono", "SF Mono", monospace
- --text-xs: 0.75rem
- --text-sm: 0.875rem
- --text-base: 1rem
- --text-lg: 1.125rem
- --text-xl: 1.25rem
- --text-2xl: 1.5rem
- --text-3xl: 1.875rem

### Color
- --color-bg: #0d0f12
- --color-surface-1: #161a20
- --color-surface-2: #1c222b
- --color-surface-3: #262d38
- --color-border: #2f3743
- --color-text: #f5f7fb
- --color-text-muted: #b2bccb
- --color-text-dim: #8a95a6
- --color-accent: #4aa8ff
- --color-accent-strong: #1f7fe0
- --color-success: #38b36b
- --color-warning: #f5b044
- --color-danger: #e24b4b
- --color-focus: #ffd166

### Spacing
- --space-1: 0.25rem
- --space-2: 0.5rem
- --space-3: 0.75rem
- --space-4: 1rem
- --space-5: 1.25rem
- --space-6: 1.5rem
- --space-8: 2rem
- --space-12: 3rem

### Radius
- --radius-2: 4px
- --radius-3: 6px
- --radius-4: 8px
- --radius-5: 12px
- --radius-pill: 999px

### Shadow
- --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4)
- --shadow-2: 0 8px 20px rgba(0, 0, 0, 0.35)
- --shadow-3: 0 16px 40px rgba(0, 0, 0, 0.45)

## Interaction + Motion Notes
- Page load: header, stats, and first section fade up with 80ms stagger.
- Card hover: raise by 2px, border color shift to accent, banner blur increases slightly.
- Favorite toggle: star fill animates with 120ms scale-in.
- Modal: 160ms ease-out scale from 0.98 to 1 with overlay fade.
- Toast: slide up 160ms, auto-dismiss 3000ms, pause on hover.
- Progress bar: smooth width transitions at 150ms, stop state changes color.
- Respect reduced motion: disable transforms and use instant state changes.

## Accessibility + Contrast Considerations
- Contrast targets: text 4.5:1+, large text 3:1+, UI elements 3:1+.
- Focus ring: 2px solid --color-focus with 2px offset on all controls.
- All icons and badges include text labels or aria-labels.
- Star button has aria-pressed and aria-label toggling Favorite/Unfavorite.
- Inputs use visible labels in modals; search uses label visually hidden.
- Keyboard order: header actions -> search -> filters -> sections -> footer.
- Modal: focus trap, escape to close, return focus to trigger.
- Touch targets: minimum 44x44px for buttons and filters.
- Error messages announced via role="alert" and associated with fields.

## Visual System Direction
- Mood: "midnight dashboard" with cool steel surfaces, crisp blue accent, and warm focus highlight.
- Structure: strong grid, consistent card rhythm, and clear section hierarchy.
- Texture: subtle radial gradient background and low-contrast noise for depth.
- Emphasis: favor light text + accent numerals to guide scanning.
