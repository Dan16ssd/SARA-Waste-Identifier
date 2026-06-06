(function () {
  'use strict';

  if (localStorage.getItem('trashscan_token')) {
    window.location.href = '/admin-panel.html';
    return;
  }

  const form      = document.getElementById('login-form');
  const orgInput  = document.getElementById('org-id-input');
  const pwInput   = document.getElementById('password-input');
  const spinner   = document.getElementById('spinner');
  const errorMsg  = document.getElementById('error-msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const org_id   = orgInput.value.trim();
    const password = pwInput.value.trim();
    if (!org_id || !password) { showError('Organisation ID and password are required.'); return; }

    setLoading(true);
    clearError();

    try {
      const resp = await fetch('/api/orgs/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ org_id, password }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('trashscan_token',    data.token);
      localStorage.setItem('trashscan_org_id',   data.org_id);
      localStorage.setItem('trashscan_org_name', data.org_name);
      window.location.href = '/admin-panel.html';
    } catch (err) {
      showError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  function setLoading(on) { spinner.classList.toggle('active', on); }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.add('visible');
  }

  function clearError() {
    errorMsg.textContent = '';
    errorMsg.classList.remove('visible');
  }
})();
