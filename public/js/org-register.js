(function () {
  'use strict';

  const btnRegister = document.getElementById('btn-register');
  const btnGps      = document.getElementById('btn-gps');
  const btnCopy     = document.getElementById('btn-copy');
  const errorEl     = document.getElementById('reg-error');
  const formCard    = document.getElementById('form-card');
  const successCard = document.getElementById('success-card');

  // GPS capture
  btnGps.addEventListener('click', () => {
    if (!navigator.geolocation) { alert('GPS not available in this browser.'); return; }
    btnGps.textContent = 'Detecting…';
    btnGps.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.getElementById('reg-lat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('reg-lng').value  = pos.coords.longitude.toFixed(6);
        btnGps.textContent = '✅ GPS Set';
        btnGps.disabled = false;
      },
      () => {
        btnGps.textContent = '📍 Use GPS';
        btnGps.disabled = false;
        alert('GPS denied or unavailable. Enter coordinates manually.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  btnRegister.addEventListener('click', async () => {
    const name         = document.getElementById('reg-name').value.trim();
    const locationName = document.getElementById('reg-location').value.trim();
    const lat          = parseFloat(document.getElementById('reg-lat').value) || null;
    const lng          = parseFloat(document.getElementById('reg-lng').value) || null;
    const password     = document.getElementById('reg-password').value;

    clearError();

    if (!name)     { showError('Organisation name is required.'); return; }
    if (!password) { showError('Admin password is required.'); return; }
    if (password.length < 6) { showError('Password must be at least 6 characters.'); return; }

    btnRegister.disabled    = true;
    btnRegister.textContent = 'Creating…';

    try {
      const resp = await fetch('/api/orgs/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, locationName, lat, lng, password }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        showError(data.error || 'Registration failed. Please try again.');
        return;
      }

      document.getElementById('result-join-code').textContent = data.joinCode;
      document.getElementById('result-org-id').textContent    = data.org_id;
      formCard.style.display    = 'none';
      successCard.style.display = 'block';
    } catch {
      showError('Connection error. Please try again.');
    } finally {
      btnRegister.disabled    = false;
      btnRegister.textContent = 'Create Organisation';
    }
  });

  btnCopy && btnCopy.addEventListener('click', () => {
    const code = document.getElementById('result-join-code').textContent;
    navigator.clipboard.writeText(code).then(() => {
      btnCopy.textContent = '✅ Copied!';
      setTimeout(() => { btnCopy.textContent = 'Copy Code'; }, 2000);
    });
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
