(function () {
  // If already logged in, skip to panel
  if (localStorage.getItem('trashscan_token')) {
    window.location.href = '/admin-panel.html';
    return;
  }

  const form     = document.getElementById('login-form');
  const pwInput  = document.getElementById('password-input');
  const spinner  = document.getElementById('spinner');
  const errorMsg = document.getElementById('error-msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = pwInput.value.trim();
    if (!password) return;

    setLoading(true);
    clearError();

    try {
      const resp = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('trashscan_token', data.token);
      window.location.href = '/admin-panel.html';
    } catch (err) {
      showError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  function setLoading(on) {
    spinner.classList.toggle('active', on);
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.add('visible');
  }

  function clearError() {
    errorMsg.textContent = '';
    errorMsg.classList.remove('visible');
  }
})();
