# Community Feed (Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global community feed to SARA where users can create text posts, comment on them, and like them, using a lightweight nickname-based identity — landing on a new `/community.html` page.

**Architecture:** A new Express route `routes/community.js` (mounted at `/api/community`) backs three flat Firestore collections (`posts`, `comments`, `likes`), following the app's existing flat-collection conventions (`routes/scan.js`). A new static page `public/community.html` + `public/js/community.js` render the feed, reusing the existing `.card`/CSS-variable design system and the `escHtml`/`getUserId` patterns already used in `scanner.js`/`dashboard.js`.

**Tech Stack:** Node.js/Express, Firebase Admin SDK (Firestore), vanilla JS (IIFE module pattern), existing CSS custom-property design system.

> **Reference:** This plan implements `docs/superpowers/specs/2026-06-07-community-feed-design.md`. Read it for full rationale on data-model and UX decisions if anything here is unclear.

---

### Task 1: Server route — identity + posts endpoints

**Files:**
- Create: `routes/community.js`

- [ ] **Step 1: Create the route file with identity endpoints**

Create `routes/community.js`:

```js
'use strict';

const express = require('express');
const router  = express.Router();
const { getDb } = require('../utils/firebase-admin');

const POST_MAX_LEN    = 500;
const COMMENT_MAX_LEN = 300;
const NAME_MAX_LEN    = 24;
const PAGE_SIZE       = 20;

async function lookupDisplayName(db, userId) {
  const doc = await db.collection('users').doc(userId).get();
  return doc.exists ? (doc.data().displayName || null) : null;
}

// ── Identity ──────────────────────────────────────────────────────────────

router.get('/me', async (req, res) => {
  const userId = String(req.query.userId || '');
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const db = getDb();
  if (!db) return res.status(500).json({ error: 'Database unavailable' });

  try {
    const displayName = await lookupDisplayName(db, userId);
    return res.json({ displayName });
  } catch (err) {
    console.error('GET /me failed:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/nickname', async (req, res) => {
  const { userId, displayName } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const name = String(displayName ?? '').trim();
  if (!name || name.length > NAME_MAX_LEN) {
    return res.status(400).json({ error: 'Nickname must be 1-24 characters' });
  }

  const db = getDb();
  if (!db) return res.status(500).json({ error: 'Database unavailable' });

  try {
    await db.collection('users').doc(userId).set({ displayName: name }, { merge: true });
    return res.json({ displayName: name });
  } catch (err) {
    console.error('POST /nickname failed:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Manually verify the identity endpoints**

Add a temporary mount so you can test before Task 4 wires it in permanently — open `server.js`, find line 48-49 (`const chatRouter = require('./routes/chat'); app.use('/api', chatRouter);`), and temporarily add right after it:

```js
const communityRouterTEMP = require('./routes/community');
app.use('/api/community', communityRouterTEMP);
```

Start the server (`npm start`), then in a separate terminal run:

```bash
curl -s "http://localhost:3000/api/community/me?userId=test123"
# Expected: {"displayName":null}

curl -s -X POST http://localhost:3000/api/community/nickname -H "Content-Type: application/json" -d "{\"userId\":\"test123\",\"displayName\":\"EcoTester\"}"
# Expected: {"displayName":"EcoTester"}

curl -s "http://localhost:3000/api/community/me?userId=test123"
# Expected: {"displayName":"EcoTester"}

curl -s -X POST http://localhost:3000/api/community/nickname -H "Content-Type: application/json" -d "{\"userId\":\"test123\",\"displayName\":\"\"}"
# Expected: {"error":"Nickname must be 1-24 characters"}

curl -s -X POST http://localhost:3000/api/community/nickname -H "Content-Type: application/json" -d "{\"userId\":\"test123\",\"displayName\":\"ThisNicknameIsWayTooLongToAllow\"}"
# Expected: 400 {"error":"Nickname must be 1-24 characters"}   (rejected, not silently truncated)
```

If any response doesn't match, fix the route code before continuing. Leave the temporary mount in `server.js` for now — Task 4 replaces it with the permanent one.

- [ ] **Step 3: Add the posts endpoints**

In `routes/community.js`, replace the line `module.exports = router;` with the following (which adds the posts endpoints before the export):

```js
// ── Posts ─────────────────────────────────────────────────────────────────

router.get('/posts', async (req, res) => {
  const userId = String(req.query.userId || '');
  const limit  = Math.min(parseInt(req.query.limit, 10) || PAGE_SIZE, 50);
  const cursor = req.query.cursor ? new Date(req.query.cursor) : null;

  const db = getDb();
  if (!db) return res.status(500).json({ error: 'Database unavailable' });

  try {
    let q = db.collection('posts').orderBy('createdAt', 'desc').limit(limit);
    if (cursor && !isNaN(cursor.getTime())) q = q.startAfter(cursor);

    const snap  = await q.get();
    const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    let likedSet = new Set();
    if (userId && posts.length) {
      const refs     = posts.map(p => db.collection('likes').doc(`${p.id}_${userId}`));
      const likeDocs = await db.getAll(...refs);
      likeDocs.forEach((doc, i) => { if (doc.exists) likedSet.add(posts[i].id); });
    }

    const result = posts.map(p => ({
      id:         p.id,
      authorId:   p.authorId,
      authorName: p.authorName,
      text:       p.text,
      createdAt:  p.createdAt.toDate().toISOString(),
      likeCount:  p.likeCount || 0,
      likedByMe:  likedSet.has(p.id),
    }));

    const last = snap.docs[snap.docs.length - 1];
    const nextCursor = (snap.docs.length === limit && last)
      ? last.data().createdAt.toDate().toISOString()
      : null;

    return res.json({ posts: result, nextCursor });
  } catch (err) {
    console.error('GET /posts failed:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/posts', async (req, res) => {
  const { userId, text } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const raw  = String(text ?? '').trim();
  if (!raw) return res.status(400).json({ error: 'Post text is required' });
  if (raw.length > POST_MAX_LEN) return res.status(400).json({ error: 'Text is too long' });

  const db = getDb();
  if (!db) return res.status(500).json({ error: 'Database unavailable' });

  try {
    const displayName = await lookupDisplayName(db, userId);
    if (!displayName) return res.status(403).json({ error: 'Set a nickname first' });

    const createdAt = new Date();
    const ref = await db.collection('posts').add({
      authorId:   userId,
      authorName: displayName,
      text:       raw,
      createdAt,
      likeCount:  0,
    });

    return res.status(201).json({
      id:         ref.id,
      authorId:   userId,
      authorName: displayName,
      text:       raw,
      createdAt:  createdAt.toISOString(),
      likeCount:  0,
      likedByMe:  false,
    });
  } catch (err) {
    console.error('POST /posts failed:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.delete('/posts/:postId', async (req, res) => {
  const { postId }      = req.params;
  const { userId }      = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const db = getDb();
  if (!db) return res.status(500).json({ error: 'Database unavailable' });

  try {
    const ref = db.collection('posts').doc(postId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Post not found' });
    if (doc.data().authorId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    const [commentsSnap, likesSnap] = await Promise.all([
      db.collection('comments').where('postId', '==', postId).get(),
      db.collection('likes').where('postId', '==', postId).get(),
    ]);

    const batch = db.batch();
    commentsSnap.docs.forEach(d => batch.delete(d.ref));
    likesSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();

    return res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /posts/:postId failed:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
```

- [ ] **Step 4: Manually verify the posts endpoints**

With the server still running (restart it if you edited while it was up), run:

```bash
curl -s -X POST http://localhost:3000/api/community/posts -H "Content-Type: application/json" -d "{\"userId\":\"test123\",\"text\":\"My first post about composting!\"}"
# Expected: 201 with {"id":"...","authorName":"EcoTester","text":"My first post about composting!","likeCount":0,"likedByMe":false,...}
# Save the returned "id" value — call it POST_ID for the next commands.

curl -s "http://localhost:3000/api/community/posts?userId=test123"
# Expected: {"posts":[{... the post you just created ...}],"nextCursor":null}

curl -s -X POST http://localhost:3000/api/community/posts -H "Content-Type: application/json" -d "{\"userId\":\"nobody\",\"text\":\"hi\"}"
# Expected: 403 {"error":"Set a nickname first"}   (because "nobody" has no displayName)

curl -s -X DELETE http://localhost:3000/api/community/posts/POST_ID -H "Content-Type: application/json" -d "{\"userId\":\"someone-else\"}"
# Replace POST_ID with the real id. Expected: 403 {"error":"You can only delete your own posts"}

curl -s -X DELETE http://localhost:3000/api/community/posts/POST_ID -H "Content-Type: application/json" -d "{\"userId\":\"test123\"}"
# Expected: {"deleted":true}

curl -s "http://localhost:3000/api/community/posts?userId=test123"
# Expected: {"posts":[],"nextCursor":null}   (post is gone)
```

If any response doesn't match, fix the route code before continuing.

- [ ] **Step 5: Commit**

```bash
git add routes/community.js server.js
git commit -m "feat: add community feed identity and posts endpoints"
```

---

### Task 2: Server route — likes (transactional toggle)

**Files:**
- Modify: `routes/community.js`

- [ ] **Step 1: Add the like-toggle endpoint**

In `routes/community.js`, insert the following block immediately **before** the `// ── Comments` section if it exists, or — since Task 1 ended with `module.exports = router;` right after the Posts section — replace `module.exports = router;` with:

```js
// ── Likes ─────────────────────────────────────────────────────────────────

router.post('/posts/:postId/like', async (req, res) => {
  const { postId } = req.params;
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const db = getDb();
  if (!db) return res.status(500).json({ error: 'Database unavailable' });

  try {
    const postRef = db.collection('posts').doc(postId);
    const likeRef = db.collection('likes').doc(`${postId}_${userId}`);

    const result = await db.runTransaction(async (t) => {
      const [postDoc, likeDoc] = await Promise.all([t.get(postRef), t.get(likeRef)]);
      if (!postDoc.exists) throw new Error('NOT_FOUND');

      const current = postDoc.data().likeCount || 0;
      let liked, likeCount;
      if (likeDoc.exists) {
        t.delete(likeRef);
        likeCount = Math.max(0, current - 1);
        t.update(postRef, { likeCount });
        liked = false;
      } else {
        t.set(likeRef, { postId, userId, createdAt: new Date() });
        likeCount = current + 1;
        t.update(postRef, { likeCount });
        liked = true;
      }
      return { liked, likeCount };
    });

    return res.json(result);
  } catch (err) {
    if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Post not found' });
    console.error('POST /posts/:postId/like failed:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Manually verify the like endpoint**

```bash
# First create a fresh post to like (capture its id as POST_ID):
curl -s -X POST http://localhost:3000/api/community/posts -H "Content-Type: application/json" -d "{\"userId\":\"test123\",\"text\":\"Post to like\"}"

curl -s -X POST http://localhost:3000/api/community/posts/POST_ID/like -H "Content-Type: application/json" -d "{\"userId\":\"test123\"}"
# Expected: {"liked":true,"likeCount":1}

curl -s -X POST http://localhost:3000/api/community/posts/POST_ID/like -H "Content-Type: application/json" -d "{\"userId\":\"test123\"}"
# Expected: {"liked":false,"likeCount":0}   (toggled back off)

curl -s -X POST http://localhost:3000/api/community/posts/does-not-exist/like -H "Content-Type: application/json" -d "{\"userId\":\"test123\"}"
# Expected: 404 {"error":"Post not found"}
```

If any response doesn't match, fix the route code before continuing.

- [ ] **Step 3: Commit**

```bash
git add routes/community.js
git commit -m "feat: add transactional like-toggle endpoint to community feed"
```

---

### Task 3: Server route — comments endpoints

**Files:**
- Modify: `routes/community.js`

- [ ] **Step 1: Add the comments endpoints**

In `routes/community.js`, replace `module.exports = router;` (left over from Task 2) with:

```js
// ── Comments ──────────────────────────────────────────────────────────────

router.get('/posts/:postId/comments', async (req, res) => {
  const { postId } = req.params;
  const limit  = Math.min(parseInt(req.query.limit, 10) || PAGE_SIZE, 50);
  const cursor = req.query.cursor ? new Date(req.query.cursor) : null;

  const db = getDb();
  if (!db) return res.status(500).json({ error: 'Database unavailable' });

  try {
    let q = db.collection('comments')
      .where('postId', '==', postId)
      .orderBy('createdAt', 'asc')
      .limit(limit);
    if (cursor && !isNaN(cursor.getTime())) q = q.startAfter(cursor);

    const snap = await q.get();
    const comments = snap.docs.map(d => {
      const c = d.data();
      return {
        id:         d.id,
        authorId:   c.authorId,
        authorName: c.authorName,
        text:       c.text,
        createdAt:  c.createdAt.toDate().toISOString(),
      };
    });

    const last = snap.docs[snap.docs.length - 1];
    const nextCursor = (snap.docs.length === limit && last)
      ? last.data().createdAt.toDate().toISOString()
      : null;

    return res.json({ comments, nextCursor });
  } catch (err) {
    console.error('GET /posts/:postId/comments failed:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/posts/:postId/comments', async (req, res) => {
  const { postId }     = req.params;
  const { userId, text } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const raw = String(text ?? '').trim();
  if (!raw) return res.status(400).json({ error: 'Comment text is required' });
  if (raw.length > COMMENT_MAX_LEN) return res.status(400).json({ error: 'Text is too long' });

  const db = getDb();
  if (!db) return res.status(500).json({ error: 'Database unavailable' });

  try {
    const postDoc = await db.collection('posts').doc(postId).get();
    if (!postDoc.exists) return res.status(404).json({ error: 'Post not found' });

    const displayName = await lookupDisplayName(db, userId);
    if (!displayName) return res.status(403).json({ error: 'Set a nickname first' });

    const createdAt = new Date();
    const ref = await db.collection('comments').add({
      postId,
      authorId:   userId,
      authorName: displayName,
      text:       raw,
      createdAt,
    });

    return res.status(201).json({
      id:         ref.id,
      authorId:   userId,
      authorName: displayName,
      text:       raw,
      createdAt:  createdAt.toISOString(),
    });
  } catch (err) {
    console.error('POST /posts/:postId/comments failed:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.delete('/comments/:commentId', async (req, res) => {
  const { commentId } = req.params;
  const { userId }    = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const db = getDb();
  if (!db) return res.status(500).json({ error: 'Database unavailable' });

  try {
    const ref = db.collection('comments').doc(commentId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Comment not found' });
    if (doc.data().authorId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    await ref.delete();
    return res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /comments/:commentId failed:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Manually verify the comments endpoints**

```bash
# Create a fresh post to comment on (capture id as POST_ID):
curl -s -X POST http://localhost:3000/api/community/posts -H "Content-Type: application/json" -d "{\"userId\":\"test123\",\"text\":\"Post to comment on\"}"

curl -s -X POST http://localhost:3000/api/community/posts/POST_ID/comments -H "Content-Type: application/json" -d "{\"userId\":\"test123\",\"text\":\"Great tip!\"}"
# Expected: 201 with {"id":"...","authorName":"EcoTester","text":"Great tip!",...}
# Save the returned "id" as COMMENT_ID.

curl -s "http://localhost:3000/api/community/posts/POST_ID/comments"
# Expected: {"comments":[{... the comment ...}],"nextCursor":null}

curl -s -X POST http://localhost:3000/api/community/posts/does-not-exist/comments -H "Content-Type: application/json" -d "{\"userId\":\"test123\",\"text\":\"hi\"}"
# Expected: 404 {"error":"Post not found"}

curl -s -X DELETE http://localhost:3000/api/community/comments/COMMENT_ID -H "Content-Type: application/json" -d "{\"userId\":\"someone-else\"}"
# Expected: 403 {"error":"You can only delete your own comments"}

curl -s -X DELETE http://localhost:3000/api/community/comments/COMMENT_ID -H "Content-Type: application/json" -d "{\"userId\":\"test123\"}"
# Expected: {"deleted":true}
```

If any response doesn't match, fix the route code before continuing.

- [ ] **Step 3: Commit**

```bash
git add routes/community.js
git commit -m "feat: add comments endpoints to community feed route"
```

---

### Task 4: Mount the community router permanently in server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Remove the temporary mount and add the permanent one**

Find the temporary lines added in Task 1 Step 2:

```js
const communityRouterTEMP = require('./routes/community');
app.use('/api/community', communityRouterTEMP);
```

Delete them. Then find the existing chat-router mount (around line 48-49):

```js
const chatRouter = require('./routes/chat');
app.use('/api', chatRouter);
```

Add immediately after it:

```js
const communityRouter = require('./routes/community');
app.use('/api/community', communityRouter);
```

- [ ] **Step 2: Verify the mount**

Restart the server (`npm start`) and run:

```bash
curl -s "http://localhost:3000/api/community/posts?userId=test123"
# Expected: {"posts":[...],"nextCursor":null}  — a normal JSON response, not a 404
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: mount community feed router at /api/community"
```

---

### Task 5: Community page HTML + navigation links

**Files:**
- Create: `public/community.html`
- Modify: `public/index.html:15-24`, `public/dashboard.html:18-26`, `public/disposal.html:15-21`, `public/join.html:15-21`, `public/org-register.html:15-21`

- [ ] **Step 1: Create `public/community.html`**

Look at `public/join.html` first (it's the simplest existing page) to copy its `<head>` block exactly (fonts, stylesheet links, favicon) — then create `public/community.html` with this structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Community — SARA</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,600;1,300&family=Syne:wght@500;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/styles.css" />
</head>
<body>

<nav>
  <a href="/" class="brand"><img src="/logo.png" alt="SARA" class="nav-logo" />SARA</a>
  <a href="/">Scanner</a>
  <a href="/dashboard.html">Dashboard</a>
  <a href="/disposal.html">Disposal Guide</a>
  <a href="/community.html" class="active">Community</a>
  <a href="/admin-login.html" style="margin-left:auto;">Admin</a>
</nav>

<div class="page" style="max-width:680px;">
  <h1>🌱 Community</h1>
  <p style="color:var(--muted); margin-bottom:24px; font-size:0.95rem;">
    Share recycling tips, wins, and questions with fellow SARA users.
  </p>

  <div class="card" id="composer-card">
    <textarea id="composer-input" maxlength="500" placeholder="Share something with the community…"></textarea>
    <div class="composer-footer">
      <span id="composer-count">0/500</span>
      <button id="composer-submit" disabled>Post</button>
    </div>
  </div>

  <div id="feed"></div>
  <p id="feed-empty" class="feed-empty" style="display:none;">No posts yet — be the first to share!</p>
  <button id="load-more" class="load-more-btn" style="display:none;">Load more</button>
</div>

<div id="nickname-modal" class="modal-overlay" style="display:none;">
  <div class="modal-card">
    <h3>Pick a community name</h3>
    <p>This is how others will see you on posts and comments.</p>
    <input type="text" id="nickname-input" maxlength="24" placeholder="e.g. EcoWarrior42" autocomplete="off" />
    <div class="modal-actions">
      <button id="nickname-cancel" class="btn-secondary">Cancel</button>
      <button id="nickname-save">Save</button>
    </div>
  </div>
</div>

<script src="/js/community.js"></script>
</body>
</html>
```

- [ ] **Step 2: Add the "Community" nav link to existing pages**

In **`public/index.html`**, find line 19 (`  <a href="/disposal.html">Disposal Guide</a>`) and add immediately after it:
```html
  <a href="/community.html">Community</a>
```

In **`public/dashboard.html`**, find the line `  <a href="/disposal.html">Disposal Guide</a>` and add immediately after it:
```html
  <a href="/community.html">Community</a>
```

In **`public/disposal.html`**, find the line `  <a href="/disposal.html" class="active">♻️ Disposal Guide</a>` and add immediately after it:
```html
  <a href="/community.html">Community</a>
```

In **`public/join.html`**, find the line `  <a href="/disposal.html">Disposal Guide</a>` and add immediately after it:
```html
  <a href="/community.html">Community</a>
```

In **`public/org-register.html`**, find the line `  <a href="/disposal.html">Disposal Guide</a>` and add immediately after it:
```html
  <a href="/community.html">Community</a>
```

- [ ] **Step 3: Verify the page loads and nav links work**

Start the server, open `http://localhost:3000/community.html` in a browser. Confirm:
- The page loads with the SARA nav, composer card, and empty feed
- "Community" appears as a nav link (highlighted as active) on this page
- Clicking "Community" from `/`, `/dashboard.html`, `/disposal.html`, `/join.html`, and `/org-register.html` navigates here correctly

(The composer and feed won't be functional yet — that's Tasks 7-8. Just confirm the markup renders without console errors about missing `community.js` — a 404 for `/js/community.js` is expected until Task 7.)

- [ ] **Step 4: Commit**

```bash
git add public/community.html public/index.html public/dashboard.html public/disposal.html public/join.html public/org-register.html
git commit -m "feat: add community feed page and nav links"
```

---

### Task 6: Community feed CSS styles

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Append the community styles**

Open `public/css/styles.css`, go to the end of the file, and append:

```css

/* ── Community Feed ───────────────────────────────────────────────────────── */
#composer-card textarea,
#composer-input {
  width: 100%;
  min-height: 80px;
  padding: 12px 16px;
  border: 1.5px solid var(--sage-200);
  border-radius: var(--radius);
  font-family: 'Syne', sans-serif;
  font-size: 0.9rem;
  color: var(--body-text);
  background: var(--white);
  resize: vertical;
  outline: none;
  transition: border-color 0.18s;
}

#composer-input:focus {
  border-color: var(--leaf);
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

.composer-footer span {
  font-size: 0.78rem;
  color: var(--muted);
}

#composer-submit,
.comment-submit,
#nickname-save {
  padding: 9px 22px;
  background: var(--leaf);
  color: var(--white);
  border: none;
  border-radius: 50px;
  font-family: 'Syne', sans-serif;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s;
}

#composer-submit:hover:not(:disabled),
.comment-submit:hover:not(:disabled),
#nickname-save:hover {
  background: var(--leaf-hover);
}

#composer-submit:disabled,
.comment-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.feed-empty {
  text-align: center;
  color: var(--muted);
  padding: 32px 0;
  font-size: 0.9rem;
}

.post-card { }

.post-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.post-author {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--forest);
}

.post-time {
  font-size: 0.76rem;
  color: var(--muted);
}

.post-delete,
.comment-delete {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 2px 6px;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}

.post-delete:hover,
.comment-delete:hover {
  color: #c0392b;
  background: #fff0f0;
}

.post-text {
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--body-text);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 12px;
}

.post-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  border-top: 1px solid var(--sage-200);
  padding-top: 10px;
}

.like-btn,
.comment-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--muted);
  font-family: 'Syne', sans-serif;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: color 0.15s, background 0.15s;
}

.like-btn:hover,
.comment-toggle:hover {
  background: var(--sage-50);
}

.like-btn.liked {
  color: var(--leaf);
}

.comments-section {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--sage-200);
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.comment-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-size: 0.85rem;
  line-height: 1.5;
}

.comment-author {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  color: var(--forest);
}

.comment-time {
  font-size: 0.72rem;
  color: var(--muted);
}

.comment-text {
  width: 100%;
  color: var(--body-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.comment-composer {
  display: flex;
  gap: 8px;
}

.comment-input {
  flex: 1;
  padding: 8px 14px;
  border: 1.5px solid var(--sage-200);
  border-radius: 50px;
  font-family: 'Syne', sans-serif;
  font-size: 0.82rem;
  color: var(--body-text);
  background: var(--white);
  outline: none;
  transition: border-color 0.18s;
}

.comment-input:focus {
  border-color: var(--leaf);
}

.load-more-btn {
  display: block;
  margin: 8px auto 24px;
  padding: 10px 28px;
  background: var(--white);
  color: var(--leaf);
  border: 1.5px solid var(--leaf);
  border-radius: 50px;
  font-family: 'Syne', sans-serif;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s, color 0.18s;
}

.load-more-btn:hover:not(:disabled) {
  background: var(--leaf);
  color: var(--white);
}

.load-more-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(30, 50, 40, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal-card {
  background: var(--white);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 28px;
  max-width: 360px;
  width: calc(100% - 48px);
}

.modal-card h3 {
  font-family: 'Fraunces', serif;
  font-style: italic;
  font-weight: 300;
  color: var(--forest);
  margin-bottom: 6px;
}

.modal-card p {
  font-size: 0.85rem;
  color: var(--muted);
  margin-bottom: 16px;
}

.modal-card input {
  width: 100%;
  padding: 10px 16px;
  border: 1.5px solid var(--sage-200);
  border-radius: 50px;
  font-family: 'Syne', sans-serif;
  font-size: 0.88rem;
  color: var(--body-text);
  background: var(--white);
  outline: none;
  margin-bottom: 16px;
}

.modal-card input:focus {
  border-color: var(--leaf);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-secondary {
  padding: 9px 20px;
  background: var(--sage-50);
  color: var(--body-text);
  border: none;
  border-radius: 50px;
  font-family: 'Syne', sans-serif;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s;
}

.btn-secondary:hover {
  background: var(--sage-100);
}
```

- [ ] **Step 2: Visually verify in the browser**

Reload `http://localhost:3000/community.html`. Confirm the composer card, nav, and (currently empty) feed area look styled and consistent with the rest of the app (rounded cards, sage/leaf color palette, Syne/Fraunces fonts). Open dev tools and confirm there are no CSS-related console warnings.

- [ ] **Step 3: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: add community feed CSS styles"
```

---

### Task 7: Client JS — identity, feed loading, and the composer

**Files:**
- Create: `public/js/community.js`

- [ ] **Step 1: Write the module skeleton, identity handling, and feed rendering**

Create `public/js/community.js`:

```js
(function () {
  'use strict';

  // ── User identity (matches the pattern in scanner.js) ─────────────────────
  function getUserId() {
    let id = localStorage.getItem('sara_user_id');
    if (!id) {
      id = 'u_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      localStorage.setItem('sara_user_id', id);
    }
    return id;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function relativeTime(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins   = Math.floor(diffMs / 60000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return mins + 'm ago';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    if (days < 7)   return days + 'd ago';
    return new Date(iso).toLocaleDateString();
  }

  const userId = getUserId();

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const composerInput  = document.getElementById('composer-input');
  const composerCount  = document.getElementById('composer-count');
  const composerSubmit = document.getElementById('composer-submit');
  const feedEl         = document.getElementById('feed');
  const feedEmptyEl    = document.getElementById('feed-empty');
  const loadMoreBtn    = document.getElementById('load-more');

  const nicknameModal  = document.getElementById('nickname-modal');
  const nicknameInput  = document.getElementById('nickname-input');
  const nicknameSave   = document.getElementById('nickname-save');
  const nicknameCancel = document.getElementById('nickname-cancel');

  let myDisplayName = null;
  let nextCursor    = null;
  let loading       = false;

  // ── Nickname prompt ────────────────────────────────────────────────────────
  function openNicknameModal() {
    nicknameInput.value = '';
    nicknameModal.style.display = 'flex';
    nicknameInput.focus();
  }

  function closeNicknameModal() {
    nicknameModal.style.display = 'none';
  }

  async function ensureNickname() {
    if (myDisplayName) return true;
    return new Promise((resolve) => {
      openNicknameModal();

      function onCancel() {
        cleanup();
        closeNicknameModal();
        resolve(false);
      }

      async function onSave() {
        const name = nicknameInput.value.trim();
        if (!name) return;
        nicknameSave.disabled = true;
        try {
          const resp = await fetch('/api/community/nickname', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ userId, displayName: name }),
          });
          const data = await resp.json().catch(() => null);
          if (!resp.ok) {
            alert((data && data.error) || 'Could not save nickname. Try again.');
            return;
          }
          myDisplayName = data.displayName;
          cleanup();
          closeNicknameModal();
          resolve(true);
        } catch (err) {
          alert('Network error — please try again.');
        } finally {
          nicknameSave.disabled = false;
        }
      }

      function cleanup() {
        nicknameSave.removeEventListener('click', onSave);
        nicknameCancel.removeEventListener('click', onCancel);
      }

      nicknameSave.addEventListener('click', onSave);
      nicknameCancel.addEventListener('click', onCancel);
    });
  }

  // ── Feed rendering ─────────────────────────────────────────────────────────
  function renderPost(post) {
    const card = document.createElement('div');
    card.className = 'card post-card';
    card.dataset.postId = post.id;

    const isMine = post.authorId === userId;

    card.innerHTML =
      '<div class="post-header">' +
        '<span class="post-author">' + escHtml(post.authorName) + '</span>' +
        '<span class="post-time">' + escHtml(relativeTime(post.createdAt)) + '</span>' +
        (isMine ? '<button class="post-delete" title="Delete post">🗑</button>' : '') +
      '</div>' +
      '<p class="post-text">' + escHtml(post.text) + '</p>' +
      '<div class="post-actions">' +
        '<button class="like-btn' + (post.likedByMe ? ' liked' : '') + '">' +
          '♥ <span class="like-count">' + post.likeCount + '</span>' +
        '</button>' +
        '<button class="comment-toggle">💬 <span class="comment-count">comments</span></button>' +
      '</div>' +
      '<div class="comments-section" style="display:none;">' +
        '<div class="comments-list"></div>' +
        '<div class="comment-composer">' +
          '<input type="text" class="comment-input" maxlength="300" placeholder="Write a reply…" autocomplete="off" />' +
          '<button class="comment-submit">Reply</button>' +
        '</div>' +
      '</div>';

    return card;
  }

  async function loadFeed(reset) {
    if (loading) return;
    loading = true;
    loadMoreBtn.disabled = true;

    if (reset) {
      feedEl.innerHTML = '';
      nextCursor = null;
    }

    try {
      const params = new URLSearchParams({ userId, limit: '20' });
      if (nextCursor) params.set('cursor', nextCursor);

      const resp = await fetch('/api/community/posts?' + params.toString());
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        alert((data && data.error) || 'Could not load the feed.');
        return;
      }

      data.posts.forEach(post => feedEl.appendChild(renderPost(post)));
      nextCursor = data.nextCursor;
      loadMoreBtn.style.display = nextCursor ? 'block' : 'none';
      feedEmptyEl.style.display = (feedEl.children.length === 0) ? 'block' : 'none';
    } catch (err) {
      alert('Network error — could not load the feed.');
    } finally {
      loading = false;
      loadMoreBtn.disabled = false;
    }
  }

  // ── Composer ───────────────────────────────────────────────────────────────
  composerInput.addEventListener('input', () => {
    const len = composerInput.value.length;
    composerCount.textContent = len + '/500';
    composerSubmit.disabled = (len === 0 || len > 500);
  });

  composerSubmit.addEventListener('click', async () => {
    const text = composerInput.value.trim();
    if (!text) return;

    const ok = await ensureNickname();
    if (!ok) return;

    composerSubmit.disabled = true;
    try {
      const resp = await fetch('/api/community/posts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId, text }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        alert((data && data.error) || 'Could not create the post.');
        return;
      }

      composerInput.value = '';
      composerCount.textContent = '0/500';
      feedEl.insertBefore(renderPost(data), feedEl.firstChild);
      feedEmptyEl.style.display = 'none';
    } catch (err) {
      alert('Network error — could not create the post.');
    } finally {
      composerSubmit.disabled = composerInput.value.trim().length === 0;
    }
  });

  loadMoreBtn.addEventListener('click', () => loadFeed(false));

  // ── Init ───────────────────────────────────────────────────────────────────
  async function init() {
    try {
      const resp = await fetch('/api/community/me?userId=' + encodeURIComponent(userId));
      const data = await resp.json().catch(() => null);
      if (resp.ok && data) myDisplayName = data.displayName;
    } catch (err) {
      // Identity lookup failure is non-fatal — ensureNickname() will retry on first post/comment/like.
    }

    loadFeed(true);
  }

  init();
})();
```

- [ ] **Step 2: Manually verify in the browser**

Open `http://localhost:3000/community.html`:
1. Type into the composer — confirm the `0/500` counter updates and the **Post** button enables only when there's text.
2. Click **Post** — since this `userId` has no nickname yet, the nickname modal should appear. Enter a name (e.g. "BrowserTester") and click **Save**.
3. Confirm the modal closes, the post appears at the top of the feed immediately, and the composer clears.
4. Reload the page — confirm the post still loads from the server (via `GET /api/community/posts`) and the nickname modal does *not* reappear (because `displayName` is now set).
5. If you have 20+ posts (create a few more via the composer or `curl`), confirm the **Load more** button appears and fetches older posts when clicked.

- [ ] **Step 3: Commit**

```bash
git add public/js/community.js
git commit -m "feat: add community feed identity, rendering, and composer logic"
```

---

### Task 8: Client JS — comments, likes, and delete interactions

**Files:**
- Modify: `public/js/community.js`

- [ ] **Step 1: Add event delegation for post-card interactions**

In `public/js/community.js`, add the following block immediately before the line `loadMoreBtn.addEventListener('click', () => loadFeed(false));`:

```js
  // ── Comments ───────────────────────────────────────────────────────────────
  function renderComment(comment, mine) {
    const row = document.createElement('div');
    row.className = 'comment-item';
    row.dataset.commentId = comment.id;
    row.innerHTML =
      '<span class="comment-author">' + escHtml(comment.authorName) + '</span>' +
      '<span class="comment-time">' + escHtml(relativeTime(comment.createdAt)) + '</span>' +
      (mine ? '<button class="comment-delete" title="Delete comment">🗑</button>' : '') +
      '<span class="comment-text">' + escHtml(comment.text) + '</span>';
    return row;
  }

  async function loadComments(postId, listEl, countEl) {
    listEl.innerHTML = '<p style="color:var(--muted); font-size:0.82rem;">Loading…</p>';
    try {
      const resp = await fetch('/api/community/posts/' + encodeURIComponent(postId) + '/comments?limit=50');
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        listEl.innerHTML = '<p style="color:var(--muted); font-size:0.82rem;">Could not load comments.</p>';
        return;
      }

      listEl.innerHTML = '';
      if (data.comments.length === 0) {
        listEl.innerHTML = '<p style="color:var(--muted); font-size:0.82rem;">No comments yet.</p>';
      } else {
        data.comments.forEach(c => listEl.appendChild(renderComment(c, c.authorId === userId)));
      }
      countEl.textContent = data.comments.length + (data.nextCursor ? '+' : '') + ' comments';
    } catch (err) {
      listEl.innerHTML = '<p style="color:var(--muted); font-size:0.82rem;">Network error loading comments.</p>';
    }
  }

  async function submitComment(postId, input, listEl, countEl) {
    const text = input.value.trim();
    if (!text) return;

    const ok = await ensureNickname();
    if (!ok) return;

    input.disabled = true;
    try {
      const resp = await fetch('/api/community/posts/' + encodeURIComponent(postId) + '/comments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId, text }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        alert((data && data.error) || 'Could not post the comment.');
        return;
      }

      input.value = '';
      const empty = listEl.querySelector('p');
      if (empty) empty.remove();
      listEl.appendChild(renderComment(data, true));
      const current = parseInt(countEl.textContent, 10) || 0;
      countEl.textContent = (current + 1) + ' comments';
    } catch (err) {
      alert('Network error — could not post the comment.');
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  // ── Card-level interactions (event delegation) ────────────────────────────
  feedEl.addEventListener('click', async (e) => {
    const card = e.target.closest('.post-card');
    if (!card) return;
    const postId = card.dataset.postId;

    // Like toggle
    if (e.target.closest('.like-btn')) {
      const btn = e.target.closest('.like-btn');
      btn.disabled = true;
      const wasLiked = btn.classList.contains('liked');
      const countEl  = btn.querySelector('.like-count');
      const before   = parseInt(countEl.textContent, 10) || 0;

      // Optimistic update
      btn.classList.toggle('liked', !wasLiked);
      countEl.textContent = wasLiked ? Math.max(0, before - 1) : before + 1;

      try {
        const resp = await fetch('/api/community/posts/' + encodeURIComponent(postId) + '/like', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ userId }),
        });
        const data = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error((data && data.error) || 'Like failed');

        btn.classList.toggle('liked', data.liked);
        countEl.textContent = data.likeCount;
      } catch (err) {
        // Revert optimistic update on failure
        btn.classList.toggle('liked', wasLiked);
        countEl.textContent = before;
        alert(err.message || 'Could not update your like.');
      } finally {
        btn.disabled = false;
      }
      return;
    }

    // Toggle comments section
    if (e.target.closest('.comment-toggle')) {
      const section = card.querySelector('.comments-section');
      const listEl  = card.querySelector('.comments-list');
      const countEl = card.querySelector('.comment-count');
      const isHidden = section.style.display === 'none';
      section.style.display = isHidden ? 'block' : 'none';
      if (isHidden && !listEl.dataset.loaded) {
        listEl.dataset.loaded = '1';
        await loadComments(postId, listEl, countEl);
      }
      return;
    }

    // Submit a comment
    if (e.target.closest('.comment-submit')) {
      const section = card.querySelector('.comments-section');
      const input   = section.querySelector('.comment-input');
      const listEl  = section.querySelector('.comments-list');
      const countEl = card.querySelector('.comment-count');
      await submitComment(postId, input, listEl, countEl);
      return;
    }

    // Delete a comment
    if (e.target.closest('.comment-delete')) {
      const row = e.target.closest('.comment-item');
      const commentId = row.dataset.commentId;
      if (!confirm('Delete this comment?')) return;
      try {
        const resp = await fetch('/api/community/comments/' + encodeURIComponent(commentId), {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ userId }),
        });
        const data = await resp.json().catch(() => null);
        if (!resp.ok) {
          alert((data && data.error) || 'Could not delete the comment.');
          return;
        }
        row.remove();
        const countEl = card.querySelector('.comment-count');
        const current = parseInt(countEl.textContent, 10) || 0;
        countEl.textContent = Math.max(0, current - 1) + ' comments';
      } catch (err) {
        alert('Network error — could not delete the comment.');
      }
      return;
    }

    // Delete a post
    if (e.target.closest('.post-delete')) {
      if (!confirm('Delete this post? This also removes its comments and likes.')) return;
      try {
        const resp = await fetch('/api/community/posts/' + encodeURIComponent(postId), {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ userId }),
        });
        const data = await resp.json().catch(() => null);
        if (!resp.ok) {
          alert((data && data.error) || 'Could not delete the post.');
          return;
        }
        card.remove();
        feedEmptyEl.style.display = (feedEl.children.length === 0) ? 'block' : 'none';
      } catch (err) {
        alert('Network error — could not delete the post.');
      }
      return;
    }
  });

  // Submit a comment via Enter key
  feedEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('comment-input')) {
      e.preventDefault();
      const card = e.target.closest('.post-card');
      card.querySelector('.comment-submit').click();
    }
  });

```

- [ ] **Step 2: Manually verify in the browser**

On `http://localhost:3000/community.html`:
1. Click the **♥** like button on a post — confirm the heart fills, the count increments instantly (optimistic update), and stays correct after a page reload. Click again — confirm it un-likes and the count decrements.
2. Click **💬 comments** — confirm the comments section expands, shows "No comments yet." for a fresh post, and loads existing comments for posts that have them.
3. Type a reply and click **Reply** (or press Enter) — confirm it appears in the list immediately and the comment count updates.
4. As the post's author, confirm a 🗑 delete icon appears on your own posts/comments (and not on others'), and that deleting removes the item from the page and from the server (verify via reload).
5. Open a second browser (or incognito window) to act as a different anonymous user — confirm you do *not* see delete icons on the first user's content, and that liking/commenting from the second user works and prompts for its own nickname.

- [ ] **Step 3: Commit**

```bash
git add public/js/community.js
git commit -m "feat: add comment, like, and delete interactions to community feed"
```

---

### Task 9: End-to-end smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run a full user-journey smoke test**

With the server running and Firestore configured (real `FIREBASE_*` env vars — not the `getDb() === null` fallback path), walk through this full journey in a browser as a fresh anonymous user (clear `localStorage` or use a new incognito window):

1. Navigate to `/community.html` — feed loads (empty or with seed data), no console errors
2. Compose and submit a post → nickname modal appears → set a nickname → post appears at the top
3. Reload the page → the post persists, nickname modal does not reappear
4. Like the post → heart fills and count increments; reload → state persists
5. Un-like the post → heart empties and count decrements; reload → state persists
6. Expand comments → add a comment → it appears immediately; reload → it persists
7. Open a second (incognito) session as a different anonymous user → set a different nickname → like/comment on the first user's post → confirm no delete icons show on someone else's content
8. As the original user, delete your own comment, then delete your own post → confirm both disappear and (via a fresh `GET /api/community/posts` / `.../comments`) are actually gone server-side, including the post's likes (re-liking a deleted post should now 404)
9. Trigger each error path at least once and confirm the user-facing message matches the spec's error table: empty post/comment submission (button stays disabled — can't trigger), text over the length limit (button disables at 500/300), and a deleted/missing post (e.g. open two tabs on the same post, delete it in one, then try to comment/like in the other — expect "Post not found")

- [ ] **Step 2: Fix any issues found**

If any step in the journey doesn't match the spec (`docs/superpowers/specs/2026-06-07-community-feed-design.md`) or this plan, fix the relevant file(s) and re-run the affected steps until the full journey passes cleanly.

- [ ] **Step 3: Commit any fixes**

If Step 2 required changes:

```bash
git add -A
git commit -m "fix: address issues found during community feed smoke test"
```

If no changes were needed, no commit is required for this task.
