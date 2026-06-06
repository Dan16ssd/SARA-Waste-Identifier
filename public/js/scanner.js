(function () {
  'use strict';

  // ── User identity (persisted across sessions) ────────────────────────────────
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

  // ── Points badge ──────────────────────────────────────────────────────────────
  function updatePointsBadge(pts) {
    const badge = document.getElementById('points-badge');
    if (badge) badge.textContent = pts + ' pts';
  }

  updatePointsBadge(getStoredPoints());

  // ── Campus geofencing zones ───────────────────────────────────────────────────
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

  let currentImageBase64 = null;
  let currentMimeType    = 'image/jpeg';
  let cameraStream       = null;
  let cameraActive       = false;
  let frozenFrame        = null; // ImageData snapshot for redrawing when updating box color

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
        clearError();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  // ── Category color by material type ──────────────────────────────────────────
  function getCategoryColor(category) {
    const c = (category || '').toLowerCase();
    if (c.includes('plastic'))                            return '#e63946';
    if (c.includes('metal'))                              return '#f4a261';
    if (c.includes('glass'))                              return '#9c27b0';
    if (c.includes('paper') || c.includes('cardboard'))  return '#2196f3';
    if (c.includes('organic') || c.includes('food'))     return '#4caf50';
    if (c.includes('ewaste') || c.includes('electronic')) return '#607d8b';
    return '#40916c';
  }

  // ── Draw bounding box onto canvas ─────────────────────────────────────────────
  function drawBoundingBox(detection, color, label) {
    if (!detection || !detection.box) return;
    const ctx = canvas.getContext('2d');

    if (frozenFrame) ctx.putImageData(frozenFrame, 0, 0);

    const { xmin, ymin, xmax, ymax } = detection.box;
    const boxW = xmax - xmin;
    const boxH = ymax - ymin;
    const lw   = Math.max(2, Math.round(canvas.width / 240));

    ctx.strokeStyle = color;
    ctx.lineWidth   = lw;
    ctx.strokeRect(xmin, ymin, boxW, boxH);

    const displayLabel = label || detection.label || 'Object';
    const fontSize     = Math.max(12, Math.round(canvas.width / 55));
    ctx.font = `bold ${fontSize}px Segoe UI, system-ui, sans-serif`;
    const textW   = ctx.measureText(displayLabel).width;
    const labelH  = fontSize + 10;
    const labelY  = ymin > labelH ? ymin : ymin + boxH + labelH;

    ctx.fillStyle = color;
    ctx.fillRect(xmin, labelY - labelH, textW + 14, labelH);
    ctx.fillStyle = '#fff';
    ctx.fillText(displayLabel, xmin + 7, labelY - 6);
  }

  // ── Scan ──────────────────────────────────────────────────────────────────────
  btnScan.addEventListener('click', async () => {
    // If camera is live, freeze the frame first
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

    if (!currentImageBase64) return;
    setLoading(true);
    clearError();
    await tryGPS();
    const locationName = locationSelect ? locationSelect.value : 'Unknown';

    // ── Step 1: HuggingFace object detection ──────────────────────────────────
    let detection = null;
    detectStatus.textContent  = 'Detecting object...';
    detectStatus.style.display = 'block';

    try {
      const hfResp = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: currentImageBase64, mimeType: currentMimeType }),
      });
      if (hfResp.ok) {
        const hfData = await hfResp.json();
        detection = hfData.detection || null;
      }
    } catch (hfErr) {
      console.warn('HF detection skipped:', hfErr.message);
    }

    if (detection) drawBoundingBox(detection, '#40916c');

    // ── Step 2: Gemini waste identification ───────────────────────────────────
    detectStatus.textContent = 'Identifying material...';

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

      // Update bounding box color and label from Gemini category
      if (detection) {
        const color = getCategoryColor(data.category || data.material);
        drawBoundingBox(detection, color, data.material || detection.label);
      }

      detectStatus.style.display = 'none';

      showResult(data);
      addLogEntry(data, locationName);

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

  function showResult(data) {
    document.getElementById('result-card').classList.add('visible');
    const icon = data.icon ? data.icon + ' ' : '';
    document.getElementById('res-object').textContent   = data.object   || '—';
    document.getElementById('res-material').textContent = icon + (data.material || '—');
    document.getElementById('res-category').textContent = data.category || '—';
    document.getElementById('res-disposal').textContent = data.disposalInstructions || '—';

    const recycEl = document.getElementById('res-recyclable');
    if (data.recyclable === true) {
      recycEl.innerHTML = '<span class="badge badge-yes">Yes</span>';
    } else if (data.recyclable === false) {
      recycEl.innerHTML = '<span class="badge badge-no">No</span>';
    } else {
      recycEl.textContent = '—';
    }

    const guidelinesList = document.getElementById('res-guidelines-list');
    if (data.guidelines && data.guidelines.length) {
      guidelinesList.innerHTML = data.guidelines.map(g => `<li style="margin-bottom:4px;">${escHtml(g)}</li>`).join('');
    } else {
      guidelinesList.innerHTML = '<li style="color:var(--muted);">No specific guidelines available.</li>';
    }

    const materialKey = (data.material || '').toLowerCase().replace(/[^a-z]/g, '');
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

  function addLogEntry(data, locationName) {
    const logEl = document.getElementById('scan-log');
    const ph    = logEl.querySelector('p');
    if (ph) ph.remove();

    const recycled = data.recyclable ? 'Recyclable' : 'Not recyclable';
    const time     = new Date().toLocaleTimeString();

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML =
      '<span class="log-time">' + time + '</span>' +
      '<span class="log-msg"> — <strong>' + escHtml(data.object || data.material) + '</strong>' +
      ' at <strong>' + escHtml(locationName) + '</strong>' +
      ' — ' + escHtml(data.material) + ' — ' + recycled + '</span>';
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
