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

  // ── Campus geofencing ─────────────────────────────────────────────────────────
  const CAMPUS_ZONES = [
    { name: 'Engineering Cafe', lat: 17.9651, lng: 102.6220, radius: 60 },
    { name: 'Main Library',     lat: 17.9644, lng: 102.6214, radius: 60 },
    { name: 'Science Building', lat: 17.9638, lng: 102.6228, radius: 60 },
    { name: 'Admin Block',      lat: 17.9658, lng: 102.6208, radius: 60 },
  ];

  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function detectZone(lat, lng) {
    let best = null, bestDist = Infinity;
    for (const z of CAMPUS_ZONES) {
      const d = haversine(lat, lng, z.lat, z.lng);
      if (d <= z.radius && d < bestDist) { best = z; bestDist = d; }
    }
    return best;
  }

  // ── GPS ───────────────────────────────────────────────────────────────────────
  let gpsData = { lat: null, lng: null, accuracy: null };

  async function tryGPS() {
    const statusEl = document.getElementById('gps-status');
    if (statusEl) statusEl.textContent = 'Detecting GPS...';

    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        if (statusEl) statusEl.textContent = 'GPS unavailable — using selected location.';
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const acc = pos.coords.accuracy;
          gpsData = { lat, lng, accuracy: acc };

          const zone = detectZone(lat, lng);
          if (zone && locationSelect) {
            for (let i = 0; i < locationSelect.options.length; i++) {
              if (locationSelect.options[i].value === zone.name) {
                locationSelect.selectedIndex = i;
                break;
              }
            }
            if (statusEl) statusEl.textContent = 'Auto-detected: ' + zone.name + ' (±' + Math.round(acc) + 'm)';
          } else if (acc > 50) {
            if (statusEl) statusEl.textContent = 'GPS signal weak (±' + Math.round(acc) + 'm) — please select location manually.';
          } else {
            if (statusEl) statusEl.textContent = 'GPS: ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ' (±' + Math.round(acc) + 'm)';
          }
          resolve(gpsData);
        },
        () => {
          gpsData = { lat: null, lng: null, accuracy: null };
          if (statusEl) statusEl.textContent = 'GPS denied — using selected location name only.';
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────────
  const video          = document.getElementById('video');
  const preview        = document.getElementById('preview');
  const placeholder    = document.getElementById('placeholder-text');
  const canvas         = document.getElementById('canvas');
  const arScanner      = document.getElementById('ar-scanner');
  const detectStatus   = document.getElementById('detect-status');
  const fileInput      = document.getElementById('file-input');
  const btnCamera      = document.getElementById('btn-camera');
  const btnUpload      = document.getElementById('btn-upload');
  const btnScan        = document.getElementById('btn-scan');
  const locationSelect = document.getElementById('location-select');
  const spinner        = document.getElementById('spinner');
  const errorMsg       = document.getElementById('error-msg');
  const scanCards      = document.getElementById('scan-cards');

  let currentImageBase64 = null;
  let currentMimeType    = 'image/jpeg';
  let cameraStream       = null;
  let cameraActive       = false;
  let frozenFrame        = null;

  // ── Camera ────────────────────────────────────────────────────────────────────
  btnCamera.addEventListener('click', async () => {
    try {
      if (cameraStream) stopCamera();
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
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
    } catch {
      showError('Camera access denied or unavailable. Please upload an image instead.');
    }
  });

  // ── File upload ───────────────────────────────────────────────────────────────
  btnUpload.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    currentMimeType = file.type || 'image/jpeg';
    stopCamera();

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

  // ── Draw a single bounding box (box_2d = [ymin,xmin,ymax,xmax] 0-1000) ───────
  function drawBox(ctx, box_2d, color, label) {
    if (!box_2d || box_2d.length < 4) return;
    const [ymin, xmin, ymax, xmax] = box_2d;
    const W = canvas.width, H = canvas.height;

    const x = xmin / 1000 * W;
    const y = ymin / 1000 * H;
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

    // Clamp label inside canvas
    const clampedLabelY = Math.min(labelY, H - 4);

    ctx.fillStyle = color;
    ctx.fillRect(x, clampedLabelY - labelH, textW + 14, labelH);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x + 7, clampedLabelY - 6);
  }

  // ── Crop an item from the frozen frame into a new canvas ──────────────────────
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
    const pad = 0.05; // 5% padding

    const x0 = Math.max(0, (xmin / 1000 - pad) * W);
    const y0 = Math.max(0, (ymin / 1000 - pad) * H);
    const x1 = Math.min(W, (xmax / 1000 + pad) * W);
    const y1 = Math.min(H, (ymax / 1000 + pad) * H);
    const cw  = x1 - x0;
    const ch  = y1 - y0;

    cropCanvas.width  = cw;
    cropCanvas.height = ch;
    const ctx2 = cropCanvas.getContext('2d');
    ctx2.drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);
    return cropCanvas;
  }

  // ── Build TikTok-style result cards ──────────────────────────────────────────
  function buildCards(items) {
    if (!scanCards) return;
    clearCards();
    if (!items || items.length === 0) return;

    scanCards.style.display = 'flex';

    items.forEach((item, idx) => {
      const color   = getCategoryColor(item.material);
      const recycled = item.recyclable;
      const badgeClass = recycled ? 'card-badge-yes' : 'card-badge-no';
      const badgeText  = recycled ? 'Recyclable' : 'Non-recyclable';

      const card = document.createElement('div');
      card.className = 'scan-item-card';
      card.style.setProperty('--accent', color);

      // Crop thumbnail
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

      // Clicking a card scrolls to the result card with that item's data
      card.addEventListener('click', () => showResult(item, idx));

      scanCards.appendChild(card);
    });

    // Auto-show the first item in the result card
    showResult(items[0], 0);
  }

  function clearCards() {
    if (!scanCards) return;
    scanCards.innerHTML = '';
    scanCards.style.display = 'none';
  }

  // ── Scan ──────────────────────────────────────────────────────────────────────
  btnScan.addEventListener('click', async () => {
    if (cameraActive) {
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
    }

    if (!frozenFrame) return;
    setLoading(true);
    clearError();
    clearCards();
    await tryGPS();

    const locationName = locationSelect ? locationSelect.value : 'Unknown';

    detectStatus.textContent   = 'Analyzing items...';
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
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Scan failed');

      const items = data.items || [];

      // Draw all bounding boxes on the canvas
      if (items.length > 0) {
        const ctx = canvas.getContext('2d');
        if (frozenFrame) ctx.putImageData(frozenFrame, 0, 0);
        items.forEach((item) => {
          const color = getCategoryColor(item.material);
          drawBox(ctx, item.box_2d, color, item.label || item.object);
        });
      }

      detectStatus.style.display = 'none';

      buildCards(items);

      // Log all items
      items.forEach((item) => addLogEntry(item, locationName));

      // Update points
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
      showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function stopCamera() {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
    video.style.display = 'none';
    arScanner.style.display = 'none';
    cameraActive = false;
  }

  function setLoading(on) {
    btnScan.disabled = on;
    spinner.classList.toggle('active', on);
  }

  function showResult(item, idx) {
    const card = document.getElementById('result-card');
    card.classList.add('visible');

    // Highlight the active scan card
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
    const guideLink = document.getElementById('res-guide-link');
    if (guideLink) guideLink.href = `/disposal.html#${materialKey}`;

    const earnedEl   = document.getElementById('points-earned');
    const earnedText = document.getElementById('points-earned-text');
    if (earnedEl && earnedText) {
      earnedText.textContent = '+10 ReGen Points earned';
      earnedEl.style.display = 'block';
    }
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

    const entry = document.createElement('div');
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
