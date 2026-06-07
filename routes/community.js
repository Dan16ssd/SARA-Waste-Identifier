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
