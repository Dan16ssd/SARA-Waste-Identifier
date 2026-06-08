(function () {
  'use strict';

  // ── User identity ─────────────────────────────────────────────────────────────
  function getUserId() {
    let id = localStorage.getItem('sara_user_id');
    if (!id) {
      id = 'u_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      localStorage.setItem('sara_user_id', id);
    }
    return id;
  }

  function getStoredPoints() {
    return parseInt(localStorage.getItem('sara_points') || '0', 10);
  }

  function savePoints(pts) {
    localStorage.setItem('sara_points', String(pts));
  }

  function updatePointsBadge(pts) {
    const badge = document.getElementById('points-badge');
    if (badge) badge.textContent = pts + ' pts';
  }

  updatePointsBadge(getStoredPoints());

  // ── Org context ───────────────────────────────────────────────────────────────
  const orgId   = localStorage.getItem('sara_org_id')   || null;
  const orgName = localStorage.getItem('sara_org_name') || null;

  const orgBadge  = document.getElementById('org-badge');
  const navJoin   = document.getElementById('nav-join');

  if (orgId && orgName && orgBadge) {
      orgBadge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right:6px; vertical-align:middle;">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="var(--leaf)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle cx="12" cy="9" r="2.5" fill="var(--leaf)"/>
      </svg><span class="org-name">${orgName}</span>`;
      orgBadge.style.display = 'inline-flex';
      if (navJoin) navJoin.style.display = 'none';
    }

  // ── GPS ───────────────────────────────────────────────────────────────────────
  let gpsData = { lat: null, lng: null, accuracy: null };

  async function reverseGeocode(lat, lng) {
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      const addr = data.address || {};
      return addr.building || addr.amenity || addr.suburb || addr.city_district ||
             addr.town || addr.city || addr.county || addr.state || null;
    } catch {
      return null;
    }
  }

  async function tryGPS() {
    const statusEl   = document.getElementById('gps-status');
    const locationEl = document.getElementById('location-input');
    if (statusEl) statusEl.textContent = 'Detecting GPS…';

    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        if (statusEl) statusEl.textContent = 'GPS unavailable — enter location manually.';
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const acc = pos.coords.accuracy;
          gpsData = { lat, lng, accuracy: acc };

          if (statusEl) statusEl.textContent = 'GPS: ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ' (±' + Math.round(acc) + 'm)';

          // Auto-fill location name via reverse geocoding
          if (locationEl && !locationEl.value) {
            const placeName = await reverseGeocode(lat, lng);
            if (placeName) {
              locationEl.value = placeName;
              if (statusEl) statusEl.textContent = 'Auto-detected: ' + placeName + ' (±' + Math.round(acc) + 'm)';
            }
          }

          resolve(gpsData);
        },
        () => {
          gpsData = { lat: null, lng: null, accuracy: null };
          if (statusEl) statusEl.textContent = 'GPS denied — enter location manually.';
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────────
  const video        = document.getElementById('video');
  const preview      = document.getElementById('preview');
  const placeholder  = document.getElementById('placeholder-text');
  const canvas       = document.getElementById('canvas');
  const arScanner    = document.getElementById('ar-scanner');
  const arOverlay    = document.getElementById('ar-overlay');
  const detectStatus = document.getElementById('detect-status');
  const fileInput    = document.getElementById('file-input');
  const btnCamera    = document.getElementById('btn-camera');
  const btnUpload    = document.getElementById('btn-upload');
  const btnScan      = document.getElementById('btn-scan');
  const locationInput = document.getElementById('location-input');
  const spinner      = document.getElementById('spinner');
  const cameraStatus   = document.getElementById('camera-status');
  const cameraErrBlock = document.getElementById('camera-error-block');
  const cameraErrText  = document.getElementById('camera-err-text');
  const btnCameraRetry = document.getElementById('btn-camera-retry');
  const shutterOverlay = document.getElementById('shutter-overlay');
  const scanProgress   = document.getElementById('scan-progress');

  async function checkCameraPermission() {
    try {
      if (!navigator.permissions) return;
      const status = await navigator.permissions.query({ name: 'camera' });
      if (status.state === 'granted') {
        cameraStatus.classList.remove('visible');
        btnCamera.disabled = false;
        // attempt to start camera if allowed (may require user gesture in some browsers)
        try { btnCamera.click(); } catch (e) {}
      } else if (status.state === 'prompt') {
        cameraStatus.textContent = 'Tap "Use Camera" to allow access';
        cameraStatus.classList.add('visible');
      } else {
        cameraErrText.textContent = 'Camera access is blocked — enable it in browser settings.';
        cameraErrBlock.classList.add('visible');
      }
      status.onchange = () => {
        if (status.state === 'granted') { btnCamera.click(); cameraErrBlock.classList.remove('visible'); cameraStatus.classList.remove('visible'); }
      };
    } catch (e) {
      // permissions API may not be available — ignore
    }
  }

  checkCameraPermission();
  tryGPS();
  const errorMsg      = document.getElementById('error-msg');
  const scanCards    = document.getElementById('scan-cards');
  const aiChatCard  = document.getElementById('ai-chat-card');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput   = document.getElementById('chat-input');
  const chatSend    = document.getElementById('chat-send');

  let currentImageBase64 = null;
  let currentMimeType    = 'image/jpeg';
  let cameraStream       = null;
  let cameraActive       = false;
  let frozenFrame        = null;
  let currentItemContext = null;

  // ── AI Chat ───────────────────────────────────────────────────────────────────
  function appendBubble(text, role) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-' + role;
    bubble.textContent = text;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubble;
  }

  function showLoadingBubble() {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-assistant chat-bubble-loading';
    bubble.innerHTML = '<div class="chat-dot"></div><div class="chat-dot"></div><div class="chat-dot"></div>';
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubble;
  }

  function initAiChat(item) {
    currentItemContext = {
      object:               item.object    || item.label || 'item',
      material:             item.material  || 'unknown material',
      category:             item.category  || 'unknown',
      recyclable:           item.recyclable,
      disposalInstructions: item.disposalInstructions || '',
    };

    chatMessages.innerHTML = '';
    aiChatCard.classList.add('visible');
    chatInput.value   = '';
    chatSend.disabled = false;

    const recyclableText = item.recyclable === true
      ? 'recyclable'
      : item.recyclable === false
        ? 'not recyclable'
        : 'recyclability unknown';

    appendBubble(
      `I've analysed your ${currentItemContext.object} — it's made of ${currentItemContext.material} and is ${recyclableText}. Ask me anything about recycling it, disposal options, or eco alternatives!`,
      'assistant'
    );
  }

  async function sendChatMessage() {
    const msg = chatInput.value.trim();
    if (!msg || !currentItemContext) return;

    chatInput.value   = '';
    chatSend.disabled = true;
    appendBubble(msg, 'user');

    const loadingBubble = showLoadingBubble();

    try {
      const resp = await fetch('/api/ai-chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: msg, itemContext: currentItemContext }),
      });
      const data = await resp.json();
      loadingBubble.remove();
      appendBubble(data.reply || data.error || "Couldn't generate a response. Try rephrasing.", 'assistant');
    } catch {
      loadingBubble.remove();
      appendBubble('Network error. Please try again.', 'assistant');
    } finally {
      chatSend.disabled = false;
      chatInput.focus();
    }
  }

  chatSend.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // ── AR auto-detection loop ────────────────────────────────────────────────────
  let arTimer     = null;
  let arBusy      = false;
  let arLastItems = [];

  function startArLoop() {
    if (arTimer) return;
    setTimeout(runArDetect, 500);
    arTimer = setInterval(runArDetect, 3000);
  }

  function stopArLoop() {
    if (arTimer) { clearInterval(arTimer); arTimer = null; }
    arBusy      = false;
    arLastItems = [];
    if (arOverlay) {
      arOverlay.getContext('2d').clearRect(0, 0, arOverlay.width, arOverlay.height);
    }
    if (detectStatus) detectStatus.style.display = 'none';
  }

  async function runArDetect() {
    if (!cameraActive || arBusy || !video.videoWidth) return;
    arBusy = true;

    if (arLastItems.length > 0) {
      const m = getLetterboxMetrics();
      if (m) {
        arOverlay.width  = m.cw;
        arOverlay.height = m.ch;
        const octx = arOverlay.getContext('2d');
        octx.clearRect(0, 0, arOverlay.width, arOverlay.height);
        arLastItems.forEach(item =>
          drawBox(octx, item.box_2d, getCategoryColor(item.material),
                  item.label || item.object, m.renderedW, m.renderedH, m.offsetX, m.offsetY)
        );
      }
    }

    detectStatus.textContent = 'Scanning…';
    detectStatus.classList.add('scanning');
    detectStatus.style.display = 'block';
    if (scanProgress) scanProgress.style.display = 'flex';

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 15000);

    try {
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width  = video.videoWidth;
      tmpCanvas.height = video.videoHeight;
      tmpCanvas.getContext('2d').drawImage(video, 0, 0);
      const b64 = tmpCanvas.toDataURL('image/jpeg', 0.75).split(',')[1];

      const resp = await fetch('/api/scan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ imageBase64: b64, mimeType: 'image/jpeg', probe: true, user_id: getUserId() }),
        signal:  controller.signal,
      });

      clearTimeout(abortTimer);
      if (!resp.ok || !cameraActive) return;

      const data  = await resp.json();
      const items = (data.items || []).filter(i => i.box_2d);
      if (!cameraActive) return;

      const m = getLetterboxMetrics();
      if (!m) return;
      arOverlay.width  = m.cw;
      arOverlay.height = m.ch;

      const octx = arOverlay.getContext('2d');
      octx.clearRect(0, 0, arOverlay.width, arOverlay.height);
      items.forEach(item =>
        drawBox(octx, item.box_2d, getCategoryColor(item.material),
                item.label || item.object, m.renderedW, m.renderedH, m.offsetX, m.offsetY)
      );

      arLastItems = items;

      detectStatus.classList.remove('scanning');
      if (items.length > 0) {
        detectStatus.textContent   = 'Detected: ' + items.map(i => i.label || i.object).join(', ');
        detectStatus.style.display = 'block';
      } else {
        detectStatus.style.display = 'none';
      }
    } catch {
      clearTimeout(abortTimer);
      detectStatus.classList.remove('scanning');
      if (arLastItems.length > 0) {
        detectStatus.textContent   = 'Detected: ' + arLastItems.map(i => i.label || i.object).join(', ');
        detectStatus.style.display = 'block';
      } else {
        detectStatus.style.display = 'none';
      }
    } finally {
      arBusy = false;
      if (scanProgress) scanProgress.style.display = 'none';
    }
  }

  // ── Camera ────────────────────────────────────────────────────────────────────
  btnCamera.addEventListener('click', async () => {
    // Show status while requesting
    cameraErrBlock.classList.remove('visible');
    cameraStatus.textContent = 'Requesting camera access…';
    cameraStatus.classList.add('visible');
    btnCamera.disabled = true;

    try {
      if (cameraStream) stopCamera();
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      cameraStatus.classList.remove('visible');
      btnCamera.disabled = false;
      video.srcObject = cameraStream;
      video.style.display = 'block';
      canvas.style.display = 'none';
      preview.style.display = 'none';
      placeholder.style.display = 'none';
      arScanner.style.display = 'block';
      detectStatus.style.display = 'none';
      cameraActive = true;
      frozenFrame = null;
      currentImageBase64 = null;
      btnScan.disabled = false;
      clearCards();
      clearError();
      startArLoop();
    } catch (err) {
      cameraStatus.classList.remove('visible');
      const isPermissionDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      cameraErrText.textContent = isPermissionDenied
        ? 'Camera access was denied. Please allow camera permission in your browser settings and try again.'
        : 'No camera found or camera is unavailable. Please upload an image instead.';
      cameraErrBlock.classList.add('visible');
      btnCamera.disabled = false;
    }
  });

  // Camera retry button
  btnCameraRetry.addEventListener('click', () => {
    cameraErrBlock.classList.remove('visible');
    btnCamera.click();
  });

  // ── File upload ───────────────────────────────────────────────────────────────
  btnUpload.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    currentMimeType = file.type || 'image/jpeg';
    stopCamera();
    cameraErrBlock.classList.remove('visible');
    cameraStatus.classList.remove('visible');

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        frozenFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        currentImageBase64 = canvas.toDataURL(currentMimeType, 0.92).split(',')[1];
        canvas.style.display = 'block';
        preview.style.display = 'none';
        placeholder.style.display = 'none';
        arScanner.style.display = 'none';
        detectStatus.style.display = 'none';
        btnScan.disabled = false;
        clearCards();
        clearError();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  // ── Material → color mapping ──────────────────────────────────────────────────
  function getCategoryColor(material) {
    const m = (material || '').toLowerCase();
    if (m.includes('plastic'))                             return '#e63946';
    if (m.includes('metal') || m.includes('aluminum'))    return '#f4a261';
    if (m.includes('glass'))                               return '#9c27b0';
    if (m.includes('paper') || m.includes('cardboard'))   return '#2196f3';
    if (m.includes('organic') || m.includes('food'))      return '#4caf50';
    if (m.includes('ewaste') || m.includes('electronic')) return '#607d8b';
    return '#40916c';
  }

  function drawBox(ctx, box_2d, color, label, renderW, renderH, offsetX, offsetY) {
    if (!box_2d || box_2d.length < 4) return;
    const [ymin, xmin, ymax, xmax] = box_2d;
    const W  = renderW  !== undefined ? renderW  : ctx.canvas.width;
    const H  = renderH  !== undefined ? renderH  : ctx.canvas.height;
    const ox = offsetX  !== undefined ? offsetX  : 0;
    const oy = offsetY  !== undefined ? offsetY  : 0;

    const x = (xmin / 1000 * W) + ox;
    const y = (ymin / 1000 * H) + oy;
    const w = (xmax - xmin) / 1000 * W;
    const h = (ymax - ymin) / 1000 * H;
    const lw = Math.max(2, Math.round(W / 240));

    ctx.strokeStyle = color;
    ctx.lineWidth   = lw;
    ctx.strokeRect(x, y, w, h);

    const fontSize = Math.max(12, Math.round(W / 55));
    ctx.font = `bold ${fontSize}px Syne, Segoe UI, system-ui, sans-serif`;
    const textW  = ctx.measureText(label).width;
    const labelH = fontSize + 10;
    const labelY = y > labelH ? y : y + h + labelH;
    const clampedLabelY = Math.min(labelY, H - 4);

    ctx.fillStyle = color;
    ctx.fillRect(x, clampedLabelY - labelH, textW + 14, labelH);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x + 7, clampedLabelY - 6);
  }

  function getLetterboxMetrics() {
    const cw = video.clientWidth;
    const ch = video.clientHeight;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || !cw || !ch) return null;
    const scale    = Math.min(cw / vw, ch / vh);
    const renderedW = vw * scale;
    const renderedH = vh * scale;
    const offsetX   = (cw - renderedW) / 2;
    const offsetY   = (ch - renderedH) / 2;
    return { cw, ch, renderedW, renderedH, offsetX, offsetY };
  }

  function cropItem(box_2d) {
    const cropCanvas = document.createElement('canvas');
    if (!box_2d || !frozenFrame) {
      cropCanvas.width  = canvas.width;
      cropCanvas.height = canvas.height;
      const ctx2 = cropCanvas.getContext('2d');
      ctx2.putImageData(frozenFrame || ctx2.createImageData(1, 1), 0, 0);
      return cropCanvas;
    }
    const [ymin, xmin, ymax, xmax] = box_2d;
    const W = canvas.width, H = canvas.height;
    const pad = 0.05;
    const x0 = Math.max(0, (xmin / 1000 - pad) * W);
    const y0 = Math.max(0, (ymin / 1000 - pad) * H);
    const x1 = Math.min(W, (xmax / 1000 + pad) * W);
    const y1 = Math.min(H, (ymax / 1000 + pad) * H);
    const cw  = x1 - x0;
    const ch  = y1 - y0;
    cropCanvas.width  = cw;
    cropCanvas.height = ch;
    cropCanvas.getContext('2d').drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);
    return cropCanvas;
  }

  function buildCards(items) {
    if (!scanCards) return;
    clearCards();
    if (!items || items.length === 0) return;
    scanCards.style.display = 'flex';
    items.forEach((item, idx) => {
      const color      = getCategoryColor(item.material);
      const badgeClass = item.recyclable ? 'card-badge-yes' : 'card-badge-no';
      const badgeText  = item.recyclable ? 'Recyclable' : 'Non-recyclable';
      const card       = document.createElement('div');
      card.className   = 'scan-item-card';
      card.style.setProperty('--accent', color);
      const cropCv = cropItem(item.box_2d);
      cropCv.className = 'scan-item-thumb';
      const body = document.createElement('div');
      body.className = 'scan-item-body';
      body.innerHTML =
        `<div class="scan-item-label">${escHtml(item.label || item.object)}</div>` +
        `<div class="scan-item-material" style="color:${color}">${escHtml(item.material)}</div>` +
        `<span class="scan-item-badge ${badgeClass}">${badgeText}</span>` +
        `<div class="scan-item-action">${escHtml(item.disposalInstructions || '')}</div>`;
      card.appendChild(cropCv);
      card.appendChild(body);
      card.addEventListener('click', () => showResult(item, idx));
      scanCards.appendChild(card);
    });
    showResult(items[0], 0);
  }

  function clearCards() {
    if (!scanCards) return;
    scanCards.innerHTML = '';
    scanCards.style.display = 'none';
    if (aiChatCard) aiChatCard.classList.remove('visible');
    currentItemContext = null;
  }

  // ── Scan ──────────────────────────────────────────────────────────────────────
  btnScan.addEventListener('click', async () => {
    if (cameraActive) {
      stopArLoop();
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      frozenFrame        = ctx.getImageData(0, 0, canvas.width, canvas.height);
      currentImageBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      currentMimeType    = 'image/jpeg';
      canvas.style.display = 'block';
      video.style.display  = 'none';
      arScanner.style.display = 'none';
      stopCamera();

      // Trigger shutter flash animation
      shutterOverlay.classList.remove('flash');
      void shutterOverlay.offsetWidth; // force reflow
      shutterOverlay.classList.add('flash');
    }

    if (!frozenFrame) return;
    setLoading(true);
    clearError();
    clearCards();
    await tryGPS();

    const locationName = (locationInput && locationInput.value.trim()) || 'Unknown';

    detectStatus.textContent   = 'Analyzing items…';
    detectStatus.style.display = 'block';

    try {
      const resp = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64:   currentImageBase64,
          mimeType:      currentMimeType,
          binId:         'bin-1',
          lat:           gpsData.lat,
          lng:           gpsData.lng,
          gps_accuracy:  gpsData.accuracy,
          location_name: locationName,
          user_id:       getUserId(),
          org_id:        orgId,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Scan failed');

      const items = data.items || [];

      if (items.length > 0) {
        const ctx = canvas.getContext('2d');
        if (frozenFrame) ctx.putImageData(frozenFrame, 0, 0);
        items.forEach((item) => {
          drawBox(ctx, item.box_2d, getCategoryColor(item.material), item.label || item.object);
        });
      }

      detectStatus.style.display = 'none';
      scanProgress.style.display = 'none';
      buildCards(items);
      items.forEach((item) => addLogEntry(item, locationName));

      let newTotal;
      if (data.total_points !== null && data.total_points !== undefined) {
        newTotal = data.total_points;
      } else {
        newTotal = getStoredPoints() + 10;
      }
      savePoints(newTotal);
      updatePointsBadge(newTotal);
      showPointsToast(newTotal);
    } catch (err) {
      detectStatus.style.display = 'none';
      scanProgress.style.display = 'none';
      showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function stopCamera() {
    stopArLoop();
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
    video.style.display = 'none';
    arScanner.style.display = 'none';
    cameraActive = false;
  }

  function setLoading(on) {
    btnScan.disabled = on;
    spinner.classList.toggle('active', on);
    scanProgress.style.display = on ? 'flex' : 'none';
  }

  function showResult(item, idx) {
    const card = document.getElementById('result-card');
    card.classList.add('visible');
    if (scanCards) {
      Array.from(scanCards.children).forEach((c, i) => c.classList.toggle('active', i === idx));
    }
    const icon = item.icon ? item.icon + ' ' : '';
    document.getElementById('res-object').textContent   = item.object   || '—';
    document.getElementById('res-material').textContent = icon + (item.material || '—');
    document.getElementById('res-category').textContent = item.category || '—';
    document.getElementById('res-disposal').textContent = item.disposalInstructions || '—';

    const recycEl = document.getElementById('res-recyclable');
    if (item.recyclable === true) {
      recycEl.innerHTML = '<span class="badge badge-yes">Yes</span>';
    } else if (item.recyclable === false) {
      recycEl.innerHTML = '<span class="badge badge-no">No</span>';
    } else {
      recycEl.textContent = '—';
    }

    const guidelinesList = document.getElementById('res-guidelines-list');
    if (item.guidelines && item.guidelines.length) {
      guidelinesList.innerHTML = item.guidelines.map(g => `<li style="margin-bottom:4px;">${escHtml(g)}</li>`).join('');
    } else {
      guidelinesList.innerHTML = '<li style="color:var(--muted);">No specific guidelines available.</li>';
    }

    const materialKey = (item.material || '').toLowerCase().replace(/[^a-z]/g, '');
    const guideLink   = document.getElementById('res-guide-link');
    if (guideLink) guideLink.href = `/disposal.html#${materialKey}`;

    const earnedEl   = document.getElementById('points-earned');
    const earnedText = document.getElementById('points-earned-text');
    if (earnedEl && earnedText) {
      earnedText.textContent = '+10 ReGen Points earned';
      earnedEl.style.display = 'block';
    }

    initAiChat(item);
  }

  function showPointsToast(total) {
    const toast = document.getElementById('points-toast');
    if (!toast) return;
    toast.textContent = '+10 ReGen Points! Total: ' + total + ' pts';
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 3500);
  }

  function addLogEntry(item, locationName) {
    const logEl = document.getElementById('scan-log');
    const ph    = logEl.querySelector('p');
    if (ph) ph.remove();
    const recycled = item.recyclable ? 'Recyclable' : 'Not recyclable';
    const time     = new Date().toLocaleTimeString();
    const entry    = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML =
      '<span class="log-time">' + time + '</span>' +
      '<span class="log-msg"> — <strong>' + escHtml(item.object || item.material) + '</strong>' +
      ' at <strong>' + escHtml(locationName) + '</strong>' +
      ' — ' + escHtml(item.material) + ' — ' + recycled + '</span>';
    logEl.insertBefore(entry, logEl.firstChild);
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

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})();
