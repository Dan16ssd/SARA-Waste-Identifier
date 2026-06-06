(function () {
  'use strict';

  const input    = document.getElementById('join-code-input');
  const btn      = document.getElementById('btn-join');
  const errorEl  = document.getElementById('join-error');
  const successEl = document.getElementById('join-success');
  const orgNameEl = document.getElementById('success-org-name');

  // Force uppercase as user types
  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });

  btn.addEventListener('click', async () => {
    const code = input.value.trim();
    if (!code) { showError('Please enter a join code.'); return; }

    btn.disabled = true;
    btn.textContent = 'Joining…';
    clearError();

    try {
      const resp = await fetch('/api/orgs/join', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ joinCode: code }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        showError(data.error || 'Invalid join code. Please check and try again.');
        return;
      }

      localStorage.setItem('sara_org_id',   data.org_id);
      localStorage.setItem('sara_org_name', data.org_name);

      successEl.style.display = 'block';
      orgNameEl.textContent   = data.org_name;
      btn.style.display       = 'none';

      // Redirect to scanner after 2 seconds
      setTimeout(() => { window.location.href = '/'; }, 2000);
    } catch {
      showError('Connection error. Please try again.');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Join Organisation';
    }
  });

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('visible');
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.classList.remove('visible');
  }
})();
