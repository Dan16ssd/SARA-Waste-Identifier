# Community Feed (Core) — Design Spec
Date: 2026-06-07

## Overview
Add a global community feed to SARA where users can share text posts, comment, and like — a lightweight discussion space for recycling/eco topics. This spec covers the **core feed only** (posts, comments, likes, basic identity). AI content moderation, an admin review queue, and image uploads are deliberately out of scope here and will get their own follow-up specs once the core exists.

---

## Architecture

### Server
- New route file `routes/community.js`, mounted at `/api/community` in `server.js` (same pattern as `routes/chat.js`)
- Three flat top-level Firestore collections — matching the app's existing flat `scans`/`users` pattern (`routes/scan.js:80,94`) rather than the nested-subcollection pattern used only for org-scoped resources (`utils/firebase-admin.js:63`):
  - `posts/{postId}`: `{ authorId, authorName, text, createdAt, likeCount }`
  - `comments/{commentId}`: `{ postId, authorId, authorName, text, createdAt }`
  - `likes/{postId_userId}`: `{ postId, userId, createdAt }` — composite doc ID (`${postId}_${userId}`) gives free dedup (a user can't like twice) and O(1) "did I like this" lookups
- `authorName` is denormalized onto posts/comments at write time (read from the author's stored nickname), so the feed never needs a per-item join — consistent with how the app already caches `orgName` onto scan records
- Nicknames are stored as a `displayName` field on the existing `users/{userId}` doc (already created/touched by `routes/scan.js:94`) — no new collection needed

### Client
- New standalone page `public/community.html` + `public/js/community.js`, served statically via `express.static` (matches `dashboard.html`/`join.html` — no server-side page route needed)
- New "Community" nav link added alongside the existing Dashboard/Join links
- The client holds the existing `sara_user_id` (localStorage) and sends it with every write. The server looks up/denormalizes `authorName` from `users/{userId}.displayName` server-side — it never trusts a client-supplied display name for storage. (Note: the underlying anonymous-ID model means a user could still claim a different `userId`; this is a pre-existing app-wide limitation, not introduced by this feature.)
- First visit: if the user has no `displayName` yet, a one-time nickname prompt appears before they can post/comment/like. Read-only browsing never requires a nickname.

---

## Data Model Decision

Considered three layouts for posts/comments/likes:
- **Flat top-level collections (chosen)** — `posts`, `comments` (with `postId` field), `likes` (composite-key docs). Matches existing app conventions, supports independent cursor-based pagination of both posts and comments, and trivial "did I like this" lookups.
- Nested subcollections (`posts/{id}/comments/{id}`) — more "Firestore-native" nesting, but Firestore doesn't cascade-delete subcollections (so cascade-delete still requires manual batch work), cross-post queries need collection-group queries, and it breaks from the app's existing flat-collection convention.
- Embedded comments array on the post doc — simplest reads, but risks the 1MB Firestore document-size limit on popular posts and prevents independent comment pagination.

---

## API Endpoints

| Method | Path | Body / Query | Behavior |
|---|---|---|---|
| `GET` | `/api/community/me` | `?userId=` | Returns `{ displayName }` (or `null`) — client uses this to decide whether to show the nickname prompt |
| `POST` | `/api/community/nickname` | `{ userId, displayName }` | Sets/updates the user's nickname (1–24 chars, trimmed/validated); upserts `users/{userId}.displayName` |
| `GET` | `/api/community/posts` | `?cursor=&limit=20&userId=` | Returns `{ posts: [...], nextCursor }`, newest first (`orderBy('createdAt', 'desc')`, cursor = last post's `createdAt`). Each post includes `likedByMe: boolean` via a batched lookup of `likes/{postId_${userId}}` for the requesting user |
| `POST` | `/api/community/posts` | `{ userId, text }` | Creates a post. Requires `displayName` to exist (403 if not). Text must be 1–500 chars (trimmed) |
| `DELETE` | `/api/community/posts/:postId` | `{ userId }` | Deletes own post (404 if missing, 403 if not the author); batch-deletes its `comments` and `likes` docs (cascade) |
| `POST` | `/api/community/posts/:postId/like` | `{ userId }` | Toggles like: creates/deletes the `likes/{postId_userId}` doc and atomically increments/decrements `posts/{postId}.likeCount` inside a Firestore transaction |
| `GET` | `/api/community/posts/:postId/comments` | `?cursor=&limit=20` | Returns `{ comments: [...], nextCursor }`, oldest first (`orderBy('createdAt', 'asc')`) |
| `POST` | `/api/community/posts/:postId/comments` | `{ userId, text }` | Creates a comment. Requires `displayName` (403 if not). Text must be 1–300 chars (trimmed) |
| `DELETE` | `/api/community/comments/:commentId` | `{ userId }` | Deletes own comment only (404 if missing, 403 if not the author) |

All "own content" checks compare the request's `userId` against the document's stored `authorId`.

---

## UI Components

### Page layout (`community.html`)
```
Nav bar (existing, + new "Community" link)
┌─ Composer card ────────────────────────────┐
│  [textarea: "Share something with..."]      │
│  char counter (e.g. 0/500)      [Post] btn  │
└──────────────────────────────────────────────┘
┌─ Feed (list of post cards) ─────────────────┐
│  ┌ Post card ────────────────────────────┐  │
│  │ AuthorName · relative timestamp  [🗑]* │  │
│  │ post text                              │  │
│  │ [♥ likeCount]   [💬 N comments ▾]     │  │
│  │  ┄ (expanded) ┄                        │  │
│  │  comment list (flat, oldest→newest)    │  │
│  │   - AuthorName · time · text  [🗑]*    │  │
│  │  [mini textarea + Reply btn]           │  │
│  └────────────────────────────────────────┘  │
│  ... more post cards ...                     │
│  [ Load more ]                                │
└──────────────────────────────────────────────┘
   * delete icon shown only on the viewer's own content
```

### Nickname prompt
A small modal/inline card shown the first time a user without a `displayName` tries to post, like, or comment (e.g. "Pick a name for the community — like EcoWarrior42"). Browsing the feed read-only never triggers it.

### States to handle
- Empty feed: "No posts yet — be the first to share!"
- Empty comments on an expanded post
- Loading indicators on Post / Like / Comment / Load-more actions
- Optimistic like-toggle (instant icon flip; revert + show error toast on failure)
- Post/Comment submit button disabled while text is empty or over its character limit

### Styling
Reuses the existing CSS custom-property palette (`--sage-*`, `--leaf`, `--forest`, etc.) and component patterns: post cards styled like the existing `.card`, composer/comment inputs styled like `#chat-input`/`#chat-send` from the AI chat widget (`public/css/styles.css` "AI Chat Widget" block).

---

## Error Handling

| Condition | Response |
|---|---|
| Missing/empty `text` | 400 "Post text is required" / "Comment text is required" |
| Text exceeds limit (500 for posts, 300 for comments) | 400 "Text is too long" |
| User has no `displayName` yet and tries to post/comment/like | 403 "Set a nickname first" — client shows the nickname prompt |
| Nickname invalid (empty or > 24 chars) | 400 "Nickname must be 1–24 characters" |
| Post/comment not found | 404 "Post not found" / "Comment not found" |
| Deleting someone else's content | 403 "You can only delete your own posts/comments" |
| Firestore error (network/quota) | 500 "Something went wrong. Please try again." |
| Like-toggle race (rapid double-clicks) | Server-side Firestore transaction makes the increment/decrement atomic and safe; client also debounces the like button |

---

## Files Changed

| File | Change |
|---|---|
| `routes/community.js` (new) | All `/api/community/*` endpoints |
| `server.js` | Mount the `community` router |
| `public/community.html` (new) | Feed page markup |
| `public/js/community.js` (new) | Feed rendering, composer, like/comment/delete logic, nickname prompt, pagination |
| `public/css/styles.css` | `.community-*` styles (post cards, composer, comment list, nickname modal) |
| `public/index.html` (and/or shared nav markup) | Add "Community" nav link |

---

## Out of Scope (this spec)
- AI content moderation (HuggingFace zero-shot classification — follow-up spec)
- Admin review queue for flagged content (follow-up spec)
- Image uploads on posts (ships together with moderation, so images are never live without a content-safety gate)
- Editing posts/comments (delete-only keeps history honest, avoids edit-tracking complexity)
- Threaded/nested comment replies (flat list only)
- Real-time updates via Socket.io (refresh + "Load more" pagination for v1)
- Per-organization feeds (one global feed for all users)
- Rich profiles (bio, location, avatar) — nickname only
