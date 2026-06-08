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
