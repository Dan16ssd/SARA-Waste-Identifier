(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────────
  let allScans            = [];
  let currentPeriod       = 'today';
  let viewMode            = 'markers';
  let pollInterval        = null;
  let lastScanCount       = 0;

  // ── Org context (from localStorage or URL param) ───────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  const orgId     = urlParams.get('org') || localStorage.getItem('sara_org_id') || null;
  const orgName   = localStorage.getItem('sara_org_name') || null;

  // ── Leaflet refs ──────────────────────────────────────────────────────────────
  let leafletMap, clusterGroup, heatLayer, trailLayer;
  let counterEl, lastScanEl;

  // ── Chart ─────────────────────────────────────────────────────────────────────
  let pieChart = null;

  // ── Heatmap data buffer ───────────────────────────────────────────────────────
  let heatData = [];

  // ── Scan trails: user_id → [{lat,lng,ts}] ─────────────────────────────────────
  const userTrails = {};

  // ── Colour map ────────────────────────────────────────────────────────────────
  function colourFor(cat) {
    const k = (cat || '').toLowerCase();
    if (k.includes('plastic'))                              return '#e63946';
    if (k.includes('paper') || k.includes('cardboard'))    return '#1d8cf8';
    if (k.includes('organic') || k.includes('food'))       return '#40916c';
    if (k.includes('metal') || k.includes('aluminum') || k.includes('steel')) return '#f4a261';
    if (k.includes('glass'))                               return '#9b59b6';
    if (k.includes('ewaste') || k.includes('electron'))    return '#fd7e14';
    if (k.includes('hazard'))                              return '#dc3545';
    return '#6c757d';
  }

  // ── Fetch scans from server API (Admin SDK, bypasses Firestore client rules) ──
  async function fetchScans() {
    try {
      const params = new URLSearchParams({ period: currentPeriod });
      if (orgId) params.set('org_id', orgId);
      const resp = await fetch('/api/scans?' + params.toString());
      const data = await resp.json();
      if (data.error) {
        console.warn('Scan fetch warning:', data.error);
        const warn = document.getElementById('firebase-warning');
        if (warn) {
          warn.style.display = 'block';
          warn.querySelector('p').textContent = data.error;
        }
        return;
      }
      const scans = (data.scans || []).map(parseScan);

      // Detect new scans (for animations)
      const newScans = lastScanCount === 0 ? [] : scans.filter(s => {
        const ts = s.timestamp instanceof Date ? s.timestamp.getTime() : new Date(s.timestamp).getTime();
        return ts > (Date.now() - 120000); // last 2 min
      });
      lastScanCount = scans.length;

      // Clear and rebuild
      allScans = [];
      heatData = [];
      clusterGroup.clearLayers();
      clearTrails();
      if (leafletMap.hasLayer(heatLayer)) heatLayer.setLatLngs([]);

      scans.forEach(scan => {
        allScans.push(scan);
        const isNew = newScans.some(ns => ns.id === scan.id);
        if (scan.latitude && scan.longitude) {
          heatData.push([scan.latitude, scan.longitude, 1]);
          const marker = createMarker(scan, isNew);
          if (marker) clusterGroup.addLayer(marker);
          pushTrail(scan);
        }
      });

      redrawTrails();
      if (leafletMap.hasLayer(heatLayer)) heatLayer.setLatLngs(heatData);

      const coords = allScans.filter(s => s.latitude && s.longitude).map(s => [s.latitude, s.longitude]);
      if (coords.length && lastScanCount < 2) leafletMap.fitBounds(coords, { padding: [40, 40], maxZoom: 18 });

      renderStats();
      updateCounter(allScans[0] || null);

      // Hide warning if data loaded
      const warn = document.getElementById('firebase-warning');
      if (warn && lastScanCount > 0) warn.style.display = 'none';

    } catch (err) {
      console.error('Fetch scans error:', err);
      const warn = document.getElementById('firebase-warning');
      if (warn) {
        warn.style.display = 'block';
        warn.querySelector('p').textContent = 'Could not connect to server. Is the backend running?';
      }
    }
  }

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    fetchScans();
    pollInterval = setInterval(fetchScans, 15000); // poll every 15s
  }

  // ── Map init ──────────────────────────────────────────────────────────────────
  async function initMap() {
    if (leafletMap) return;

    // Default world view; will be overridden by org location or scan data
    let centerLat = 20, centerLng = 0, zoom = 2;

    if (orgId) {
      try {
        const resp = await fetch('/api/orgs/' + orgId);
        if (resp.ok) {
          const org = await resp.json();
          if (org.location && org.location.lat && org.location.lng) {
            centerLat = org.location.lat;
            centerLng = org.location.lng;
            zoom      = 15;
          }
          // Update page title with org name
          const h1 = document.querySelector('h1');
          if (h1 && org.name) h1.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-5px; margin-right:6px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="var(--leaf)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="12" cy="9" r="2.5" fill="var(--leaf)"/></svg>' + org.name + ' \u2014 Waste Intelligence';
        }
      } catch { /* fall back to world view */ }
    }

    leafletMap = L.map('map').setView([centerLat, centerLng], zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(leafletMap);

    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const n    = cluster.getChildCount();
        const size = n > 50 ? 44 : n > 10 ? 38 : 32;
        return L.divIcon({
          html: '<div class="cluster-dot" style="width:' + size + 'px;height:' + size + 'px;">' + n + '</div>',
          className: '',
          iconSize: L.point(size, size),
        });
      },
    });
    clusterGroup.addTo(leafletMap);

    heatLayer = L.heatLayer([], { radius: 40, blur: 30, max: 1, minOpacity: 0.4, gradient: {
      0.3: '#74c69d',
      0.6: '#f4a261',
      1.0: '#e63946',
    }});

    trailLayer = L.layerGroup().addTo(leafletMap);

    const LiveCtrl = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const div = L.DomUtil.create('div', 'live-counter-ctrl');
        div.innerHTML =
          '<span class="blink-dot"></span> <strong>LIVE</strong>&nbsp;&nbsp;' +
          '<span id="live-scan-count">0</span> scans<br/>' +
          '<small id="live-last-scan">waiting…</small>';
        L.DomEvent.disableClickPropagation(div);
        return div;
      },
    });
    new LiveCtrl().addTo(leafletMap);
    counterEl  = document.getElementById('live-scan-count');
    lastScanEl = document.getElementById('live-last-scan');
  }

  // ── Marker factory ────────────────────────────────────────────────────────────
  function createMarker(scan, isNew) {
    if (!scan.latitude || !scan.longitude) return null;
    const colour  = colourFor(scan.category);
    const cls     = isNew ? 'scan-dot new-marker' : 'scan-dot';
    const opacity = scan.approx ? '0.5' : '1';
    const icon    = L.divIcon({
      className: '',
      html: '<div class="' + cls + '" style="background:' + colour + ';opacity:' + opacity + ';"></div>',
      iconSize: [14,14], iconAnchor: [7,7], popupAnchor: [0,-7],
    });
    const marker = L.marker([scan.latitude, scan.longitude], { icon });
    marker.bindPopup(
      '<strong>' + escHtml(scan.item_name || scan.category) + '</strong><br/>' +
      'Category: ' + escHtml(scan.category) + '<br/>' +
      'Location: ' + escHtml(scan.location_name) +
      (scan.gps_accuracy ? '<br/>Accuracy: ±' + Math.round(scan.gps_accuracy) + 'm' : '') + '<br/>' +
      '+' + (scan.regen_points || 10) + ' ReGen pts'
    );
    return marker;
  }

  // ── Scan trails ───────────────────────────────────────────────────────────────
  function pushTrail(scan) {
    if (!scan.latitude || !scan.longitude) return;
    const uid = scan.user_id || 'anon';
    if (!userTrails[uid]) userTrails[uid] = [];
    userTrails[uid].push({ lat: scan.latitude, lng: scan.longitude,
      ts: scan.timestamp instanceof Date ? scan.timestamp : new Date(scan.timestamp || 0) });
    userTrails[uid].sort((a,b) => a.ts - b.ts);
    if (userTrails[uid].length > 5) userTrails[uid] = userTrails[uid].slice(-5);
  }

  function redrawTrails() {
    trailLayer.clearLayers();
    Object.values(userTrails).forEach((pts) => {
      if (pts.length < 2) return;
      L.polyline(pts.map(p => [p.lat, p.lng]), { color: '#74c69d', weight: 2, opacity: 0.5, dashArray: '5 5' })
        .addTo(trailLayer);
    });
  }

  function clearTrails() {
    Object.keys(userTrails).forEach(k => delete userTrails[k]);
    trailLayer.clearLayers();
  }

  // ── View mode toggle ──────────────────────────────────────────────────────────
  function setViewMode(mode) {
    viewMode = mode;
    document.querySelectorAll('.map-toggle-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode)
    );
    if (mode === 'markers') {
      leafletMap.addLayer(clusterGroup);
      leafletMap.addLayer(trailLayer);
      if (leafletMap.hasLayer(heatLayer)) leafletMap.removeLayer(heatLayer);
    } else {
      if (leafletMap.hasLayer(clusterGroup)) leafletMap.removeLayer(clusterGroup);
      if (leafletMap.hasLayer(trailLayer))   leafletMap.removeLayer(trailLayer);
      heatLayer.setLatLngs(heatData);
      leafletMap.addLayer(heatLayer);
    }
  }

  // ── Live counter ──────────────────────────────────────────────────────────────
  function updateCounter(latestScan) {
    if (counterEl) counterEl.textContent = allScans.length;
    if (lastScanEl && latestScan) {
      const ts = latestScan.timestamp instanceof Date
        ? latestScan.timestamp : new Date(latestScan.timestamp || 0);
      lastScanEl.textContent = 'Last: ' + timeAgo(ts);
    }
  }

  function timeAgo(date) {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60)   return s + 's ago';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    return Math.floor(s/3600) + 'h ago';
  }

  // ── Stats + Pie + Hotspot ──────────────────────────────────────────────────────
  function renderStats() {
    document.getElementById('stat-scans').textContent = allScans.length;
    const totalPts = allScans.reduce((a,s) => a + (Number(s.regen_points)||10), 0);
    document.getElementById('stat-points').textContent = totalPts + ' pts';
    const cats = {};
    allScans.forEach(s => { const c = s.category||'Other'; cats[c]=(cats[c]||0)+1; });
    const topCat = Object.entries(cats).sort((a,b) => b[1]-a[1])[0];
    document.getElementById('stat-top').textContent = topCat ? topCat[0] : '—';
    const locs = new Set(allScans.map(s => s.location_name).filter(Boolean));
    document.getElementById('stat-locations').textContent = locs.size || '—';
    renderPie(cats);
    renderHotspot();
  }

  function renderPie(cats) {
    const labels  = Object.keys(cats);
    const data    = labels.map(l => cats[l]);
    const colors  = labels.map(l => colourFor(l));
    const canvasEl = document.getElementById('pie-chart');
    const emptyEl  = document.getElementById('chart-empty');
    if (!labels.length) {
      canvasEl.style.display = 'none';
      emptyEl.style.display  = 'block';
      if (pieChart) { pieChart.destroy(); pieChart = null; }
      return;
    }
    canvasEl.style.display = 'block';
    emptyEl.style.display  = 'none';
    if (pieChart) pieChart.destroy();
    pieChart = new Chart(canvasEl, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: '#fff', borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 12 } },
          tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + ctx.raw + ' scans' } },
        },
      },
    });
  }

  function renderHotspot() {
    const card = document.getElementById('hotspot-card');
    const text = document.getElementById('hotspot-text');
    const locs  = {};
    allScans.forEach(s => { const l = s.location_name||'Unknown'; locs[l]=(locs[l]||0)+1; });
    const sorted = Object.entries(locs).sort((a,b) => b[1]-a[1]);
    if (!sorted[0] || sorted[0][1] < 2) { card.style.display = 'none'; return; }
    const label = { today:'today', week:'this week', month:'this month' }[currentPeriod];
    card.style.display = 'flex';
    text.textContent = sorted[0][0] + ' — ' + sorted[0][1] + ' scans ' + label;
  }

  function parseScan(raw) {
    const ts  = raw.timestamp ? new Date(raw.timestamp) : new Date();
    const lat = typeof raw.latitude  === 'number' ? raw.latitude  : null;
    const lng = typeof raw.longitude === 'number' ? raw.longitude : null;
    return {
      id:            raw.id || '',
      item_name:     raw.item_name     || '',
      category:      raw.category      || '',
      location_name: raw.location_name || '',
      latitude:      lat,
      longitude:     lng,
      approx:        false,
      gps_accuracy:  raw.gps_accuracy  || null,
      regen_points:  raw.regen_points  || 10,
      user_id:       raw.user_id       || 'anon',
      timestamp:     ts,
    };
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  async function init() {
    const pts   = parseInt(localStorage.getItem('sara_points') || '0', 10);
    const badge = document.getElementById('points-badge');
    if (badge) badge.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px; margin-right:3px;"><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5a4 4 0 0 0 4 4c1.1 0 2.1-.45 2.83-1.17" stroke="var(--leaf)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>' + pts + ' pts';

    await initMap();

    // Show org context in header
    const h1 = document.querySelector('h1');
    if (orgId && orgName && h1 && !h1.textContent.includes(orgName)) {
      h1.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-5px; margin-right:6px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="var(--leaf)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="12" cy="9" r="2.5" fill="var(--leaf)"/></svg>' + orgName + ' \u2014 Waste Intelligence';
    } else if (!orgId && h1) {
      h1.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-5px; margin-right:6px;"><circle cx="12" cy="12" r="10" stroke="var(--leaf)" stroke-width="1.5" fill="none"/><ellipse cx="12" cy="12" rx="4" ry="10" stroke="var(--leaf)" stroke-width="1.5" fill="none"/><line x1="2" y1="12" x2="22" y2="12" stroke="var(--leaf)" stroke-width="1.5"/></svg>Global Public Scan Map';
    }

    // Hide Firebase warning — using server API now
    const warn = document.getElementById('firebase-warning');
    if (warn) warn.style.display = 'none';

    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPeriod = btn.dataset.period;
        lastScanCount = 0;
        fetchScans();
      });
    });

    document.querySelectorAll('.map-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => setViewMode(btn.dataset.mode));
    });

    startPolling();
  }

  init();
})();
