(function () {
  const video       = document.getElementById('video');
  const preview     = document.getElementById('preview');
  const placeholder = document.getElementById('placeholder-text');
  const canvas      = document.getElementById('canvas');
  const fileInput   = document.getElementById('file-input');
  const captureRow  = document.getElementById('capture-row');
  const btnCamera   = document.getElementById('btn-camera');
  const btnUpload   = document.getElementById('btn-upload');
  const btnCapture  = document.getElementById('btn-capture');
  const btnScan     = document.getElementById('btn-scan');
  const binSelect   = document.getElementById('bin-select');
  const spinner     = document.getElementById('spinner');
  const errorMsg    = document.getElementById('error-msg');

  let currentImageBase64 = null;
  let currentMimeType    = 'image/jpeg';
  let cameraStream       = null;

  // ── Camera ──
  btnCamera.addEventListener('click', async () => {
    try {
      if (cameraStream) stopCamera();
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = cameraStream;
      video.style.display = 'block';
      preview.style.display = 'none';
      placeholder.style.display = 'none';
      captureRow.style.display = 'block';
      btnScan.disabled = true;
      currentImageBase64 = null;
    } catch (err) {
      showError('Camera access denied or unavailable. Please upload an image instead.');
    }
  });

  btnCapture.addEventListener('click', () => {
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    currentImageBase64 = dataUrl.split(',')[1];
    currentMimeType    = 'image/jpeg';

    preview.src = dataUrl;
    preview.style.display = 'block';
    video.style.display = 'none';
    captureRow.style.display = 'none';
    stopCamera();
    btnScan.disabled = false;
    clearError();
  });

  // ── File upload ──
  btnUpload.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    currentMimeType = file.type || 'image/jpeg';
    stopCamera();

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      currentImageBase64 = dataUrl.split(',')[1];
      preview.src = dataUrl;
      preview.style.display = 'block';
      video.style.display = 'none';
      placeholder.style.display = 'none';
      captureRow.style.display = 'none';
      btnScan.disabled = false;
      clearError();
    };
    reader.readAsDataURL(file);
  });

  // ── Scan ──
  btnScan.addEventListener('click', async () => {
    if (!currentImageBase64) return;
    setLoading(true);
    clearError();

    try {
      const resp = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: currentImageBase64,
          mimeType:    currentMimeType,
          binId:       binSelect.value,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Scan failed');
      showResult(data);
      addLogEntry(data);
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  // ── Helpers ──
  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    video.style.display = 'none';
  }

  function setLoading(on) {
    btnScan.disabled = on;
    spinner.classList.toggle('active', on);
  }

  function showResult(data) {
    const icon = data.icon ? data.icon + ' ' : '';
    document.getElementById('res-object').textContent   = data.object   || '—';
    document.getElementById('res-material').textContent = icon + (data.material || '—');
    document.getElementById('res-category').textContent = data.category || '—';
    document.getElementById('res-disposal').textContent = data.disposalInstructions || '—';

    const recycEl = document.getElementById('res-recyclable');
    if (data.recyclable === true) {
      recycEl.innerHTML = '<span class="badge badge-yes">✅ Yes</span>';
    } else if (data.recyclable === false) {
      recycEl.innerHTML = '<span class="badge badge-no">❌ No</span>';
    } else {
      recycEl.textContent = '—';
    }

    // Update recycling guidelines list
    const guidelinesList = document.getElementById('res-guidelines-list');
    if (data.guidelines && data.guidelines.length) {
      guidelinesList.innerHTML = data.guidelines
        .map(g => `<li style="margin-bottom:4px;">${g}</li>`).join('');
    } else {
      guidelinesList.innerHTML = '<li style="color:var(--muted);">No specific guidelines available.</li>';
    }

    // Point the guide link to the specific material section
    const materialKey = (data.material || '').toLowerCase()
      .replace('metal (aluminum/steel)', 'metal')
      .replace('paper/cardboard', 'paper')
      .replace('organic/food waste', 'organic')
      .replace('e-waste (electronics)', 'ewaste')
      .replace('hazardous waste', 'hazardous')
      .replace(/[^a-z]/g, '');
    const guideLink = document.getElementById('res-guide-link');
    if (guideLink) guideLink.href = `/disposal.html#${materialKey}`;
  }

  function addLogEntry(data) {
    const logEl = document.getElementById('scan-log');

    // Remove placeholder text on first scan
    const placeholder = logEl.querySelector('p');
    if (placeholder) placeholder.remove();

    const binName = binSelect.options[binSelect.selectedIndex].text;
    const icon    = data.icon || '🗑️';
    const recycled = data.recyclable ? '♻️ Recyclable' : '🚫 Not recyclable';
    const time    = new Date().toLocaleTimeString();

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
      <span class="log-time">${time}</span>
      <span class="log-msg">— ${icon} <strong>${data.object || data.material}</strong> at
        <strong>${binName}</strong> &mdash; ${data.material} &mdash; ${recycled}</span>
    `;
    logEl.insertBefore(entry, logEl.firstChild);

    // Cap at 20 entries
    while (logEl.children.length > 20) logEl.removeChild(logEl.lastChild);
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
