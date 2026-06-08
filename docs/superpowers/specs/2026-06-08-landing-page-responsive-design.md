# Landing Page & Responsive Design — Design Spec
Date: 2026-06-08

## Overview
Add a proper landing/introduction page with a "Get Started" call-to-action, and make the whole site (all 9 pages) work well on phones, tablets, and desktops. Today `/` (`index.html`) IS the scanner page — there's no welcome/intro page — and the responsive coverage is minimal (two small `@media` blocks covering only the dashboard map and a global nav/typography tweak at 600px).

---

## Architecture

### Page restructuring
- Rename `public/index.html` (current scanner page, plus its script `public/js/scanner.js` reference) → `public/scanner.html`
- Create a new `public/index.html` containing the landing page
- `express.static` already serves `index.html` at `/` automatically (`server.js:17`) — **no server.js changes needed**
- Update the nav on every page (`index.html`/landing, `scanner.html`, `dashboard.html`, `disposal.html`, `community.html`, `join.html`, `org-register.html`, `admin-login.html`, `admin-panel.html`):
  - Brand/logo link stays `href="/"` (now points to the landing page — consistent with how every other page already uses the brand link to "go home")
  - The "Scanner" nav link changes from `href="/" class="active"` → `href="/scanner.html"`, with `class="active"` applied only within `scanner.html`'s own copy of the nav

### Mobile navigation — shared script
- New file `public/js/nav.js`: a small vanilla-JS module (matching the existing IIFE pattern used by `scanner.js`/`community.js`) that:
  - Injects a hamburger button into the nav on narrow viewports (or toggles a pre-existing `#nav-toggle` button's `aria-expanded` state and a `.nav-open` class on `<nav>`)
  - Closes the menu when a nav link is clicked, when the user clicks outside the nav, or presses Escape
- Included via `<script src="/js/nav.js"></script>` on **every** page (one new `<script>` tag per HTML file — same mechanical change repeated 9 times)
- CSS for the hamburger button and slide-out/dropdown menu lives in `styles.css` inside the new responsive section (see below)
- This is the only place new client-side JS is introduced; everything else is HTML/CSS changes

### Responsive CSS strategy
- **Keep the existing desktop-first base styles** (Approach A — additive, not a rewrite). The site mostly works on desktop today; we're patching the gaps, not redoing what works.
- Add a systematic, two-tier breakpoint structure appended to `styles.css` (alongside/replacing the existing small `@media` blocks at lines 1044-1056, which get folded into the new structure):
  - **Tablet** `@media (max-width: 900px)`
  - **Phone** `@media (max-width: 600px)`
- Within those tiers, address each known problem area page-by-page (see "Per-page responsive checklist" below)

---

## Landing Page (`public/index.html`)

Single-page layout, reusing existing `.card`/`.btn`/`.btn-primary` classes and CSS custom properties (`--sage-*`, `--leaf`, `--forest`, fonts):

```
Nav bar (same as every page; "Scanner" link points to /scanner.html)

┌─ Hero ──────────────────────────────────────────────┐
│        [SARA logo, large — reuse /logo.png]          │
│        "SARA"                                        │
│        "Sustainable Analytics Recycling Assistant"   │
│        Tagline: "Scan it. Sort it. Recycle it        │
│         right — and earn points doing it."           │
│        [ Get Started → ]  (btn btn-primary, large)   │
└───────────────────────────────────────────────────────┘

┌─ How it works (3-step strip, responsive grid) ──────┐
│  [📷 Scan]      [♻️ Identify]      [✅ Dispose]       │
│  "Snap a photo  "Our AI tells you  "Follow local     │
│   of any item"   what it's made    disposal guidance,│
│                  of and whether    earn points, and  │
│                  it's recyclable"  join the          │
│                                    community"        │
└───────────────────────────────────────────────────────┘

┌─ Final CTA ─────────────────────────────────────────┐
│   "Ready to start sorting smarter?"                   │
│   [ Get Started → ]  (btn btn-primary)               │
└───────────────────────────────────────────────────────┘
```

- Hero displays the brand name "SARA" prominently with its full-name expansion "Sustainable Analytics Recycling Assistant" directly beneath it (the official meaning of the acronym — also used in `<title>` tags, see Files Changed).
- Both "Get Started" buttons are plain links: `<a href="/scanner.html" class="btn btn-primary">Get Started →</a>` — no JS, no localStorage gating, no onboarding steps. Matches how the app already works (anonymous users can use the scanner immediately).
- The 3-step strip uses a responsive grid (`repeat(auto-fit, minmax(220px, 1fr))`, matching the existing pattern at `styles.css:768-769`) so it naturally collapses to a single column on phones without a dedicated breakpoint rule.
- Copy matches SARA's existing friendly/eco tone (see `disposal.html`/`community.html` for reference voice).

---

## Per-page responsive checklist

For each page, the tablet (`≤900px`) and/or phone (`≤600px`) tiers address:

| Page | Known/likely problem areas | Fix approach |
|---|---|---|
| **Nav (all pages)** | 8+ items overflow on phones | Hamburger menu via `nav.js` + `.nav-open` CSS; badges (`#points-badge`/`#org-badge`) and secondary links (Join Org, Admin) move into the collapsed menu |
| **Landing (`index.html`, new)** | N/A — built responsive from the start | Hero text scales with `clamp()`/`em`-based sizing; 3-step grid auto-collapses; CTA buttons full-width on phone |
| **Scanner (`scanner.html`)** | Camera/preview video and canvas elements, side-by-side button rows, scan-result cards | Stack `btn-row` vertically on phone; constrain `#video`/`#canvas`/`#preview` to `max-width: 100%`; result cards go full-width |
| **Dashboard (`dashboard.html`)** | `.map-chart-row` (`1fr 360px` grid, already has an 860px breakpoint at line 1044-1047 — fold into the new 900px tier), Leaflet map height, Chart.js canvases, stat grids (`auto-fill, minmax(270px,1fr)` / `auto-fit, minmax(130px,1fr)` — already responsive) | Extend/fold existing map breakpoint into the unified tablet tier; ensure map height shrinks further on phone; verify Chart.js canvases respect container width |
| **Disposal Guide (`disposal.html`)** | `.guide-badges`/list layouts, tab row (`.tab`) | Allow tabs to wrap (`flex-wrap: wrap`); ensure guide cards/lists are single-column on phone |
| **Community (`community.html`)** | Composer card, post/comment cards, nickname modal (`.modal-*`, max-width 360-460px ranges) | Cards already use fluid widths via `.card`; verify modal fits viewport with margin on phone; comment-composer input row stacks if needed |
| **Join (`join.html`) / Org Register (`org-register.html`)** | Form field grids (e.g. `admin-bin-fields` pattern at line 1054, generic form rows) | Forms collapse to single-column on phone (many already do via existing 600px rules — verify and extend) |
| **Admin Login/Panel (`admin-login.html`/`admin-panel.html`)** | Tables, `.admin-bin-fields` grid (already has a 600px rule at line 1054), action button rows | Tables scroll horizontally within a wrapper on phone; button rows stack |

This list is the basis for Task-level work in the implementation plan — each row becomes one or more concrete CSS additions plus manual verification at phone/tablet/desktop widths.

---

## Error Handling / Edge Cases
- **JS-disabled fallback for the hamburger menu**: the nav remains a plain (if cramped) horizontal list if `nav.js` fails to load — no functionality is lost, only the collapse/expand convenience. No `<noscript>` block needed since the rest of the site already assumes JS (scanner, community, dashboard all require it).
- **Existing bookmarks/links to `/`**: anyone with `/` bookmarked now lands on the new landing page instead of the scanner — acceptable and expected for this change (this is the explicit goal: `/` becomes a proper front door). The "Scanner" nav link makes the scanner one click away from anywhere.
- **Direct links to `/index.html`**: same as `/` — Express serves the same static file either way; both now resolve to the landing page. No redirect needed since nothing in the codebase hardcodes `/index.html`.

---

## Testing
- **Manual viewport testing**: verify each of the 9 pages at three representative widths — phone (~375px), tablet (~768px), desktop (~1280px) — checking the per-page checklist above for each
- **Hamburger menu**: open/close via click, close-on-link-click, close-on-outside-click, close-on-Escape, and keyboard/screen-reader basics (`aria-expanded`, `aria-label`)
- **Landing page**: both "Get Started" links navigate to `/scanner.html`; hero/steps/CTA render correctly at all three widths; logo displays correctly (transparent PNG)
- **Regression check**: confirm the scanner, dashboard, disposal guide, community feed, join/org-register, and admin flows all still work after the page rename and nav-link updates (no broken links, no console errors)

---

## Files Changed

| File | Change |
|---|---|
| `public/index.html` | **Replaced** — becomes the new landing page (hero + how-it-works + CTA); `<title>SARA — Sustainable Analytics Recycling Assistant</title>` |
| `public/scanner.html` (renamed from `index.html`) | Scanner page moves here; nav "Scanner" link gets `class="active"`; keeps a `<title>` reflecting the SARA brand (e.g. `Scanner — SARA`) |
| `public/js/nav.js` (new) | Shared hamburger-menu toggle script, included on every page |
| `public/css/styles.css` | New landing-page styles (`.hero-*`, `.how-it-works-*`), hamburger-menu styles (`.nav-toggle`, `.nav-open`), and an expanded/unified responsive breakpoint structure (folding in the existing two small `@media` blocks) |
| All 9 HTML pages | Add `<script src="/js/nav.js">`; update "Scanner" nav link to `/scanner.html`; (landing page gets the full nav, no special-casing); favicon already updated to `<link rel="icon" type="image/png" href="/logo.png" />` (done ahead of this spec, applies to all pages including the new landing page) |

---

## Out of Scope
- Onboarding flows / first-visit gating (localStorage flags, tutorials) — "Get Started" is a plain link to the scanner
- A separate mobile app or PWA manifest/installability
- Redesigning desktop layouts that already work — this is a *responsive patch*, not a visual redesign
- Dark mode / theme switching
- Internationalization of landing-page copy
