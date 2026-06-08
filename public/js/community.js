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
