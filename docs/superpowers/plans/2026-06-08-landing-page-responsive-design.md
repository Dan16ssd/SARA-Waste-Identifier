# Landing Page & Responsive Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give SARA a welcoming landing page with a "Get Started" call-to-action as its new home page, move the scanner to `/scanner.html`, and make all 9 pages work well on phones, tablets, and desktops via a shared hamburger-menu nav script and a unified two-tier responsive breakpoint structure.

**Architecture:** Rename today's home page (`public/index.html`, the scanner) to `public/scanner.html`, then build a brand-new `public/index.html` landing page that becomes the home page — Express already serves `index.html` at `/` via `express.static` (`server.js:17`), so no server changes are needed. Add one shared `public/js/nav.js` script (IIFE module, matching the pattern already used by `public/js/community.js`) that injects a hamburger toggle button into every page's `<nav>` and collapses the link list on narrow viewports. Layer two new `@media` tiers — Tablet `(max-width: 900px)` and Phone `(max-width: 600px)` — onto the existing desktop-first CSS in `public/css/styles.css`, folding in the two small breakpoint blocks that exist today (lines 1044-1056).

**Tech Stack:** Vanilla HTML/CSS/JS (no build step, no bundler), Express static file serving, the existing `--sage-*`/`--leaf`/`--forest`/`--white`/`--radius`/`--shadow` CSS custom properties and `.card`/`.btn`/`.btn-primary`/`.page` component classes already defined in `public/css/styles.css`.

---

### Task 1: Rename the scanner page to `/scanner.html`

**Files:**
- Rename: `public/index.html` → `public/scanner.html`
- Modify: `public/scanner.html` (title line 6, nav link line 17)

- [ ] **Step 1: Rename the file with git so history is preserved**

```bash
cd "C:\Users\Danny\Desktop\Sara"
git mv public/index.html public/scanner.html
```

- [ ] **Step 2: Update the page title to match the "Page — SARA" pattern every other page already uses** (`Community — SARA`, `Join an Organisation — SARA`, `Admin Login — SARA`, etc.)

In `public/scanner.html`, change:
```html
  <title>SARA — Sustainable Analytics Recycling Assistant</title>
```
to:
```html
  <title>Scanner — SARA</title>
```

- [ ] **Step 3: Point the nav's own "Scanner" link at its new URL** so the `active` highlight still lands correctly once `/` becomes the landing page

In `public/scanner.html`, change:
```html
  <a href="/" class="active">Scanner</a>
```
to:
```html
  <a href="/scanner.html" class="active">Scanner</a>
```

- [ ] **Step 4: Verify in the browser**

```bash
npm start
```

Open `http://localhost:3000/scanner.html`. It should look and behave exactly like the old `/` did — camera UI, location field, scan log, and the "Ask SARA" chat widget all present — the browser tab should read "Scanner — SARA", and the "Scanner" nav link should be highlighted (sage background). `http://localhost:3000/` will look broken/empty until Task 3 replaces it — that's expected at this point.

- [ ] **Step 5: Commit**

```bash
git add public/scanner.html
git commit -m "Rename scanner page to /scanner.html ahead of new landing page"
```

---

### Task 2: Build the shared mobile-nav script and wire it into the scanner page

**Files:**
- Create: `public/js/nav.js`
- Modify: `public/css/styles.css` (append hamburger styles at end of file)
- Modify: `public/scanner.html` (add `<script src="/js/nav.js">`)

- [ ] **Step 1: Create `public/js/nav.js`**

```js
(function () {
  'use strict';

  const nav = document.querySelector('nav');
  if (!nav) return;

  // ── Build the hamburger toggle button ─────────────────────────────────────
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nav-toggle';
  toggle.setAttribute('aria-label', 'Toggle navigation menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML =
    '<span class="nav-toggle-bar"></span>' +
    '<span class="nav-toggle-bar"></span>' +
    '<span class="nav-toggle-bar"></span>';

  const brand = nav.querySelector('.brand');
  if (brand) {
    brand.insertAdjacentElement('afterend', toggle);
  } else {
    nav.appendChild(toggle);
  }

  // ── Open / close ───────────────────────────────────────────────────────────
  function openMenu() {
    nav.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    nav.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    if (nav.classList.contains('nav-open')) closeMenu();
    else openMenu();
  });

  // Close on link click, outside click, or Escape — keeps the menu out of the way
  nav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('click', function (e) {
    if (nav.classList.contains('nav-open') && !nav.contains(e.target)) closeMenu();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('nav-open')) closeMenu();
  });
})();
```

- [ ] **Step 2: Append the hamburger button styles to the end of `public/css/styles.css`**

The file currently ends (line 1512) with `.btn-secondary:hover { background: var(--sage-100); }`. Add this block after it:

```css

/* ── Mobile nav toggle (hamburger) ─────────────────────────────────────────── */
.nav-toggle {
  display: none;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  width: 36px;
  height: 36px;
  margin-left: auto;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  transition: background 0.18s;
  flex-shrink: 0;
}

.nav-toggle:hover { background: rgba(255,255,255,0.08); }

.nav-toggle-bar {
  display: block;
  width: 20px;
  height: 2px;
  background: var(--sage-100);
  border-radius: 2px;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

nav.nav-open .nav-toggle-bar:nth-child(1) { transform: translateY(6px) rotate(45deg); }
nav.nav-open .nav-toggle-bar:nth-child(2) { opacity: 0; }
nav.nav-open .nav-toggle-bar:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }
```

(The rules that actually hide/collapse the nav links on narrow viewports live in the unified responsive section added in Task 5 — this step only adds the button's own look and its open/close icon animation, which apply at every width but the button stays `display: none` until Task 5's media query turns it on.)

- [ ] **Step 3: Add the script tag to `public/scanner.html`**

Change:
```html
<script src="/socket.io/socket.io.js"></script>
<script src="/js/scanner.js"></script>
```
to:
```html
<script src="/js/nav.js"></script>
<script src="/socket.io/socket.io.js"></script>
<script src="/js/scanner.js"></script>
```

- [ ] **Step 4: Verify in the browser**

Refresh `http://localhost:3000/scanner.html` and open the browser console — there should be no errors. Resize the window below 900px width (or use dev tools' device toolbar): a hamburger button (three small bars) should appear at the right edge of the nav bar in place of the link list once Task 5 adds the collapsing rules. For now, confirm only that the button renders in the DOM (inspect element — `<button class="nav-toggle">` should sit right after the brand link) and that clicking it toggles `nav-open` on `<nav>` (visible via dev tools, even though the visual collapse isn't wired up until Task 5).

- [ ] **Step 5: Commit**

```bash
git add public/js/nav.js public/css/styles.css public/scanner.html
git commit -m "Add shared hamburger-menu nav script and wire it into the scanner page"
```

---

### Task 3: Build the new landing page

**Files:**
- Create: `public/index.html` (new landing page — home page)
- Modify: `public/css/styles.css` (append landing-page styles)

- [ ] **Step 1: Create the new `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SARA — Sustainable Analytics Recycling Assistant</title>
  <link rel="icon" type="image/png" href="/logo.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700;1,9..144,300;1,9..144,500&family=Syne:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/styles.css" />
</head>
<body>

<nav>
  <a href="/" class="brand"><img src="/logo.png" alt="SARA" class="nav-logo" />SARA</a>
  <a href="/scanner.html">Scanner</a>
  <a href="/dashboard.html">Dashboard</a>
  <a href="/disposal.html">Disposal Guide</a>
  <a href="/community.html">Community</a>
  <a href="/join.html" style="margin-left:4px; font-size:0.76rem; font-weight:700; color:var(--sage-300); text-decoration:none; padding:6px 12px; border-radius:20px; transition:color 0.18s, background 0.18s; white-space:nowrap;">Join Org</a>
  <a href="/admin-login.html" style="margin-left:auto;">Admin</a>
</nav>

<section class="hero">
  <img src="/logo.png" alt="SARA logo" class="hero-logo" />
  <h1 class="hero-title">SARA</h1>
  <p class="hero-subtitle">Sustainable Analytics Recycling Assistant</p>
  <p class="hero-tagline">Scan it. Sort it. Recycle it right — and earn points doing it.</p>
  <a href="/scanner.html" class="btn btn-primary hero-cta">Get Started &rarr;</a>
</section>

<section class="how-it-works">
  <div class="how-it-works-grid">
    <div class="how-it-works-step">
      <span class="how-it-works-icon">📷</span>
      <h3>Scan</h3>
      <p>Snap a photo of any item with your camera, or upload one from your gallery.</p>
    </div>
    <div class="how-it-works-step">
      <span class="how-it-works-icon">♻️</span>
      <h3>Identify</h3>
      <p>Our AI tells you what it's made of, what category it falls into, and whether it's recyclable.</p>
    </div>
    <div class="how-it-works-step">
      <span class="how-it-works-icon">✅</span>
      <h3>Dispose</h3>
      <p>Follow clear local disposal guidance, earn points for every scan, and join the community.</p>
    </div>
  </div>
</section>

<section class="final-cta">
  <p class="final-cta-title">Ready to start sorting smarter?</p>
  <a href="/scanner.html" class="btn btn-primary">Get Started &rarr;</a>
</section>

<script src="/js/nav.js"></script>
</body>
</html>
```

- [ ] **Step 2: Append the landing-page styles to the end of `public/css/styles.css`**

Add this block after the hamburger-menu styles added in Task 2:

```css

/* ── Landing page — Hero ──────────────────────────────────────────────────── */
.hero {
  max-width: 720px;
  margin: 0 auto;
  padding: 72px 20px 56px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero-logo {
  width: 88px;
  height: 88px;
  object-fit: contain;
  margin-bottom: 22px;
}

.hero-title {
  font-family: 'Fraunces', serif;
  font-style: italic;
  font-weight: 300;
  font-size: clamp(2.4rem, 6vw, 3.6rem);
  color: var(--forest);
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin-bottom: 8px;
}

.hero-subtitle {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 0.8rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--leaf);
  margin-bottom: 22px;
}

.hero-tagline {
  font-size: 1.05rem;
  color: var(--body-text);
  max-width: 460px;
  margin-bottom: 32px;
  line-height: 1.7;
}

.hero-cta {
  font-size: 0.9rem;
  padding: 14px 36px;
}

/* ── Landing page — How it works ──────────────────────────────────────────── */
.how-it-works {
  max-width: 1040px;
  margin: 0 auto;
  padding: 0 20px 64px;
}

.how-it-works-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
}

.how-it-works-step {
  background: var(--white);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  border: 1px solid rgba(195,222,206,0.5);
  padding: 32px 24px;
  text-align: center;
}

.how-it-works-icon {
  display: inline-block;
  font-size: 2rem;
  margin-bottom: 14px;
}

.how-it-works-step h3 {
  font-family: 'Fraunces', serif;
  font-style: italic;
  font-weight: 300;
  font-size: 1.3rem;
  color: var(--forest);
  margin-bottom: 10px;
}

.how-it-works-step p {
  font-size: 0.88rem;
  color: var(--body-text);
  line-height: 1.7;
}

/* ── Landing page — Final CTA ─────────────────────────────────────────────── */
.final-cta {
  max-width: 640px;
  margin: 0 auto;
  padding: 0 20px 80px;
  text-align: center;
}

.final-cta-title {
  font-family: 'Fraunces', serif;
  font-style: italic;
  font-weight: 300;
  font-size: 1.6rem;
  color: var(--forest);
  letter-spacing: -0.01em;
  margin-bottom: 24px;
  line-height: 1.3;
}
```

- [ ] **Step 3: Verify in the browser**

Refresh `http://localhost:3000/`. You should see: the nav bar (with no link highlighted as `active` — correct, since the brand itself represents "home"), a centered hero with the logo, "SARA" in large italic serif type, the "Sustainable Analytics Recycling Assistant" subtitle, the tagline, and a green "Get Started →" button; below that, a 3-column "How it works" strip (Scan / Identify / Dispose); and a final "Ready to start sorting smarter?" CTA section with another "Get Started →" button. Click both "Get Started" buttons — both should navigate to `/scanner.html`. Click the brand logo/"SARA" — it should reload `/`.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/css/styles.css
git commit -m "Add new landing page with hero, how-it-works strip, and Get Started CTAs"
```

---

### Task 4: Wire the shared nav script into the remaining 7 pages

**Files:**
- Modify: `public/admin-login.html`, `public/admin-panel.html`, `public/community.html`, `public/dashboard.html`, `public/disposal.html`, `public/join.html`, `public/org-register.html`

Each of these pages currently has a nav link `<a href="/">Scanner</a>` (pointing at the old scanner location) and is missing the `nav.js` script tag. Apply both changes to each file.

- [ ] **Step 1: `public/admin-login.html`**

Change the nav link:
```html
  <a href="/">Scanner</a>
```
to:
```html
  <a href="/scanner.html">Scanner</a>
```

Change the script tag:
```html
<script src="/js/admin-login.js"></script>
```
to:
```html
<script src="/js/nav.js"></script>
<script src="/js/admin-login.js"></script>
```

- [ ] **Step 2: `public/admin-panel.html`**

Change the nav link:
```html
  <a href="/">Scanner</a>
```
to:
```html
  <a href="/scanner.html">Scanner</a>
```

Change the first script tag:
```html
<script src="/socket.io/socket.io.js"></script>
<script src="/js/admin-panel.js"></script>
```
to:
```html
<script src="/js/nav.js"></script>
<script src="/socket.io/socket.io.js"></script>
<script src="/js/admin-panel.js"></script>
```

- [ ] **Step 3: `public/community.html`**

Change the nav link:
```html
  <a href="/">Scanner</a>
```
to:
```html
  <a href="/scanner.html">Scanner</a>
```

Change the script tag:
```html
<script src="/js/community.js"></script>
```
to:
```html
<script src="/js/nav.js"></script>
<script src="/js/community.js"></script>
```

- [ ] **Step 4: `public/dashboard.html`**

Change the nav link:
```html
  <a href="/">Scanner</a>
```
to:
```html
  <a href="/scanner.html">Scanner</a>
```

Change the first script tag:
```html
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
```
to:
```html
<script src="/js/nav.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
```

- [ ] **Step 5: `public/disposal.html`**

Change the nav link:
```html
  <a href="/">Scanner</a>
```
to:
```html
  <a href="/scanner.html">Scanner</a>
```

Change the script tag:
```html
<script src="/js/disposal.js"></script>
```
to:
```html
<script src="/js/nav.js"></script>
<script src="/js/disposal.js"></script>
```

- [ ] **Step 6: `public/join.html`**

Change the nav link:
```html
  <a href="/">Scanner</a>
```
to:
```html
  <a href="/scanner.html">Scanner</a>
```

Change the script tag:
```html
<script src="/js/join.js"></script>
```
to:
```html
<script src="/js/nav.js"></script>
<script src="/js/join.js"></script>
```

- [ ] **Step 7: `public/org-register.html`**

Change the nav link:
```html
  <a href="/">Scanner</a>
```
to:
```html
  <a href="/scanner.html">Scanner</a>
```

Change the script tag:
```html
<script src="/js/org-register.js"></script>
```
to:
```html
<script src="/js/nav.js"></script>
<script src="/js/org-register.js"></script>
```

- [ ] **Step 8: Verify in the browser**

Visit each of the 7 pages (`/admin-login.html`, `/admin-panel.html` — log in first, `/community.html`, `/dashboard.html`, `/disposal.html`, `/join.html`, `/org-register.html`). On each: the "Scanner" nav link should navigate to `/scanner.html`, the page's own `active` link should still be highlighted correctly (e.g. "Community" stays highlighted on the community page), and there should be no console errors from the new `<script src="/js/nav.js">` tag.

- [ ] **Step 9: Commit**

```bash
git add public/admin-login.html public/admin-panel.html public/community.html public/dashboard.html public/disposal.html public/join.html public/org-register.html
git commit -m "Point Scanner nav link at /scanner.html and load shared nav script on all pages"
```

---

### Task 5: Add the unified responsive breakpoint structure

**Files:**
- Modify: `public/css/styles.css` (remove old breakpoint blocks at lines 1043-1056, append new unified Tablet/Phone tiers at end of file)

This is where the hamburger menu actually starts collapsing the nav, and where the per-page responsive checklist from the spec gets addressed.

- [ ] **Step 1: Remove the two small existing `@media` blocks**

In `public/css/styles.css`, delete this entire block (currently at lines 1043-1056, right before the "AI Chat Widget" section):

```css
/* ── Responsive ────────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .map-chart-row { grid-template-columns: 1fr; }
  #map { height: 300px; }
}

@media (max-width: 600px) {
  nav { padding: 0 16px; gap: 2px; }
  nav a:not(.brand) { padding: 5px 10px; font-size: 0.76rem; }
  h1 { font-size: 1.6rem; }
  .page { margin: 24px auto; }
  .admin-bin-fields { grid-template-columns: 1fr; }
}

```

Replace it with nothing — leave a single blank line between `.guide-steps li { margin-bottom: 4px; }` and `/* ── AI Chat Widget ── */`, matching the spacing convention used between every other section in this file. (All of these rules are folded into the new unified tiers below — nothing is lost, just relocated and reorganized.)

- [ ] **Step 2: Append the unified responsive tiers at the very end of `public/css/styles.css`**

This goes after the landing-page styles added in Task 3 (i.e., at the new end of the file):

```css

/* ══════════════════════════════════════════════════════════════════════════
   Responsive — Tablet (≤900px) and Phone (≤600px)
   Additive tiers layered on the desktop-first base above (Approach A):
   the desktop layout is the default; these media queries patch the
   specific places that break on narrower viewports.
   ══════════════════════════════════════════════════════════════════════════ */

@media (max-width: 900px) {
  /* Nav: show the hamburger, hide the link list until opened.
     The :has(.nav-toggle) guard is the JS-disabled fallback: nav.js is what
     creates .nav-toggle, so if it fails to load these rules never match and
     the nav simply stays a plain (if cramped) horizontal list — nothing
     becomes inaccessible. */
  .nav-toggle { display: flex; }

  nav:has(.nav-toggle) > a:not(.brand),
  nav:has(.nav-toggle) > .points-badge,
  nav:has(.nav-toggle) > .org-badge {
    display: none;
  }

  nav.nav-open {
    flex-wrap: wrap;
    align-items: stretch;
    height: auto;
    padding-bottom: 14px;
  }

  nav.nav-open > a:not(.brand),
  nav.nav-open > .points-badge,
  nav.nav-open > .org-badge {
    display: block;
    width: 100%;
    text-align: left;
    /* !important: several nav links/badges carry inline margin/padding
       (e.g. "Join Org", "Admin") that would otherwise win over these rules */
    padding: 10px 14px !important;
    margin: 2px 0 !important;
  }

  /* Dashboard — map and chart stack instead of sitting side by side
     (folded in from the old 860px rule) */
  .map-chart-row { grid-template-columns: 1fr; }
  #map { height: 300px; }
}

@media (max-width: 600px) {
  /* Nav spacing + page typography (folded in from the old 600px rule) */
  nav { padding: 0 16px; gap: 2px; }
  h1 { font-size: 1.6rem; }
  .page { margin: 24px auto; }
  .admin-bin-fields { grid-template-columns: 1fr; }

  /* Scanner — stack the action buttons full-width and keep camera media
     inside the viewport instead of forcing horizontal scroll */
  .btn-row { flex-direction: column; align-items: stretch; }
  .btn-row .btn { width: 100%; justify-content: center; }
  #camera-wrap video,
  #camera-wrap img#preview,
  #camera-wrap canvas#canvas { max-height: 280px; }

  /* Dashboard — shrink the map further and let the time-filter tabs wrap */
  #map { height: 240px; }
  .time-tabs { flex-wrap: wrap; }

  /* Landing page — scale the hero down for small screens */
  .hero { padding: 48px 20px 40px; }
  .hero-logo { width: 72px; height: 72px; }
  .hero-cta { width: 100%; justify-content: center; }
  .final-cta .btn { width: 100%; justify-content: center; }
}
```

- [ ] **Step 3: Verify in the browser**

```bash
npm start
```

Open dev tools, switch to the device toolbar, and check at ~768px width (tablet tier):
- On every page, the nav link list disappears and a hamburger button appears at the right of the nav bar
- Clicking the hamburger reveals the links stacked vertically below the brand row, each full-width and tappable; the icon animates into an "X"
- Clicking a link, clicking outside the nav, or pressing Escape closes the menu again
- On `/dashboard.html`, the map and chart stack into a single column

Then check at ~375px width (phone tier):
- `/scanner.html`: "Use Camera"/"Upload Image" buttons stack full-width; the camera/preview area stays within the screen width
- `/dashboard.html`: the map is shorter and the "Today/Week/Month" time-filter tabs wrap onto multiple lines if needed
- `/` (landing): the hero logo, title, and buttons scale down and the "Get Started" buttons are full-width
- `/admin-panel.html` (after logging in): the bin-creation form fields stack to a single column

- [ ] **Step 4: Commit**

```bash
git add public/css/styles.css
git commit -m "Unify responsive breakpoints into Tablet/Phone tiers and wire up hamburger nav collapse"
```

---

### Task 6: Manual responsive QA pass and regression check

**Files:** none (verification only — this project has no automated UI test suite; manual viewport testing is the testing strategy called for in the spec)

- [ ] **Step 1: Start the app and open the browser device toolbar**

```bash
npm start
```

In Chrome/Edge dev tools, open the device toolbar (Ctrl+Shift+M) and test at three widths: **375px** (phone), **768px** (tablet), **1280px** (desktop).

- [ ] **Step 2: Walk every page at all three widths**

For each of these 9 pages — `/` (landing), `/scanner.html`, `/dashboard.html`, `/disposal.html`, `/community.html`, `/join.html`, `/org-register.html`, `/admin-login.html`, `/admin-panel.html` (log in with admin credentials first) — confirm:
- No element overflows the viewport horizontally (no horizontal scrollbar appears on the page itself)
- The nav collapses to a hamburger at ≤900px and expands to the full link bar at >900px
- Text remains readable (no clipped or overlapping content)
- Buttons and form fields are comfortably tappable on the 375px view (not cramped side-by-side)

- [ ] **Step 3: Hamburger interaction checks**

On any page at ≤900px width:
- Click the hamburger → menu opens, icon animates to "X", `aria-expanded="true"`
- Click a nav link inside the open menu → menu closes and the browser navigates
- Re-open the menu, click anywhere outside the `<nav>` → menu closes
- Re-open the menu, press **Escape** → menu closes
- Re-open the menu, resize the window back above 900px → the full link bar reappears (the menu's open/closed state no longer matters since the rules only apply at ≤900px)

- [ ] **Step 4: Regression check — confirm existing flows still work end to end**

- Landing page: both "Get Started →" buttons navigate to `/scanner.html`; clicking the "SARA" brand returns to `/`
- Scanner (`/scanner.html`): camera/upload still work, a scan still produces a result card and an "Ask SARA" reply
- Dashboard: map, charts, and time-filter tabs still load and respond to clicks
- Disposal Guide: filter buttons and guide content still render
- Community: feed loads, composer/like/comment still function
- Join / Org Register: forms submit without console errors
- Admin Login / Admin Panel: login works, bin list and stats still render
- Open the browser console on each page — no new errors introduced by `nav.js` or the CSS changes

- [ ] **Step 5: Report results**

If every check in Steps 2-4 passes, the feature is complete — proceed to `superpowers:finishing-a-development-branch`. If any check fails, note exactly which page/width/interaction failed and fix it with a small follow-up commit before moving on (don't bundle unrelated fixes into this task's commit).
