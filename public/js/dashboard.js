(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────────
  let db                  = null;
  let unsubscribeListener = null;
  let allScans            = [];
  let currentPeriod       = 'today';
  let viewMode            = 'markers';

  // ── Leaflet refs ──────────────────────────────────────────────────────────────
  let leafletMap, clusterGroup, heatLayer, trailLayer;
  let counterEl, lastScanEl;

  // ── Chart ─────────────────────────────────────────────────────────────────────
  let pieChart = null;

  // ── Heatmap data buffer (survives layer hide/show) ────────────────────────────
  let heatData = [];

  // ── Scan trails: user_id → [{lat,lng,ts}] (max 5) ────────────────────────────
  const userTrails = {};

  // ─────────────────────────────────────────────────────────────────────────────
  // Colour map
  // ─────────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Firebase init
  // ─────────────────────────────────────────────────────────────────────────────
  async function initFirebase() {
    try {
      const resp = await fetch('/api/firebase-config');
      const cfg  = await resp.json();
      if (!cfg.configured || !cfg.projectId || cfg.projectId === 'your-project-id') return false;

      if (!firebase.apps.length) {
        firebase.initializeApp({ apiKey: cfg.apiKey, projectId: cfg.projectId });
      }
      db = firebase.firestore();
      return true;
    } catch (e) {
      console.error('Firebase init failed:', e);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Time filter
  // ─────────────────────────────────────────────────────────────────────────────
  function periodStart() {
    const now = new Date();
    if (currentPeriod === 'today') {
      const d = new Date(now); d.setHours(0, 0, 0, 0); return d;
    }
    if (currentPeriod === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 7); return d;
    }
    const d = new Date(now); d.setDate(d.getDate() - 30); return d;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Map init
  // ─────────────────────────────────────────────────────────────────────────────
  function initMap() {
    if (leafletMap) return;

    // Default centre: NUOL campus, Vientiane
    leafletMap = L.map('map').setView([17.9644, 102.6214], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(leafletMap);

    // ── Cluster group ─────────────────────────────────────────────────────────
    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const n = cluster.getChildCount();
        const size = n > 50 ? 44 : n > 10 ? 38 : 32;
        return L.divIcon({
          html: '<div class="cluster-dot" style="width:' + size + 'px;height:' + size + 'px;">' + n + '</div>',
          className: '',
          iconSize: L.point(size, size),
        });
      },
    });
    clusterGroup.addTo(leafletMap);

    // ── Heatmap layer (hidden initially) ─────────────────────────────────────
    heatLayer = L.heatLayer([], { radius: 28, blur: 20, maxZoom: 17, gradient: {
      0.2: '#74c69d',
      0.5: '#f4a261',
      1.0: '#e63946',
    }});

    // ── Trail layer ───────────────────────────────────────────────────────────
    trailLayer = L.layerGroup().addTo(leafletMap);

    // ── Live counter Leaflet control ──────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Marker factory
  // ─────────────────────────────────────────────────────────────────────────────
  function createMarker(scan, isNew) {
    if (!scan.latitude || !scan.longitude) return null;

    const colour = colourFor(scan.category);
    const cls    = isNew ? 'scan-dot new-marker' : 'scan-dot';
    const icon   = L.divIcon({
      className: '',
      html: '<div class="' + cls + '" style="background:' + colour + ';"></div>',
      iconSize:   [14, 14],
      iconAnchor: [7, 7],
      popupAnchor:[0, -7],
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Scan trail
  // ─────────────────────────────────────────────────────────────────────────────
  function pushTrail(scan) {
    if (!scan.latitude || !scan.longitude) return;
    const uid = scan.user_id || 'anon';
    if (!userTrails[uid]) userTrails[uid] = [];
    userTrails[uid].push({
      lat: scan.latitude, lng: scan.longitude,
      ts: scan.timestamp instanceof Date ? scan.timestamp : new Date(scan.timestamp || 0),
    });
    userTrails[uid].sort((a, b) => a.ts - b.ts);
    if (userTrails[uid].length > 5) userTrails[uid] = userTrails[uid].slice(-5);
  }

  function redrawTrails() {
    trailLayer.clearLayers();
    Object.values(userTrails).forEach((pts) => {
      if (pts.length < 2) return;
      L.polyline(pts.map(p => [p.lat, p.lng]), {
        color: '#74c69d', weight: 2, opacity: 0.5, dashArray: '5 5',
      }).addTo(trailLayer);
    });
  }

  function clearTrails() {
    Object.keys(userTrails).forEach(k => delete userTrails[k]);
    trailLayer.clearLayers();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // View mode toggle: Markers ↔ Heatmap
  // ─────────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Live counter
  // ─────────────────────────────────────────────────────────────────────────────
  function updateCounter(latestScan) {
    if (counterEl)  counterEl.textContent = allScans.length;
    if (lastScanEl) {
      if (latestScan) {
        const ts = latestScan.timestamp instanceof Date
          ? latestScan.timestamp : new Date(latestScan.timestamp || 0);
        lastScanEl.textContent = 'Last: ' + timeAgo(ts);
      }
    }
  }

  function timeAgo(date) {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60)   return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    return Math.floor(s / 3600) + 'h ago';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Stats + Pie + Hotspot
  // ─────────────────────────────────────────────────────────────────────────────
  function renderStats() {
    document.getElementById('stat-scans').textContent = allScans.length;

    const totalPts = allScans.reduce((a, s) => a + (Number(s.regen_points) || 10), 0);
    document.getElementById('stat-points').textContent = totalPts + ' pts';

    const cats = {};
    allScans.forEach(s => { const c = s.category || 'Other'; cats[c] = (cats[c] || 0) + 1; });
    const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('stat-top').textContent = topCat ? topCat[0] : '—';

    const locs = new Set(allScans.map(s => s.location_name).filter(Boolean));
    document.getElementById('stat-locations').textContent = locs.size || '—';

    renderPie(cats);
    renderHotspot();
  }

  function renderPie(cats) {
    const labels = Object.keys(cats);
    const data   = labels.map(l => cats[l]);
    const colors = labels.map(l => colourFor(l));
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
        responsive: true,
        maintainAspectRatio: true,
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
    const locs = {};
    allScans.forEach(s => { const l = s.location_name || 'Unknown'; locs[l] = (locs[l] || 0) + 1; });
    const sorted = Object.entries(locs).sort((a, b) => b[1] - a[1]);
    if (!sorted[0] || sorted[0][1] < 2) { card.style.display = 'none'; return; }
    const label = { today: 'today', week: 'this week', month: 'this month' }[currentPeriod];
    card.style.display = 'flex';
    text.textContent = sorted[0][0] + ' — ' + sorted[0][1] + ' scans ' + label;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Real-time Firestore listener
  // ─────────────────────────────────────────────────────────────────────────────
  function subscribe() {
    if (unsubscribeListener) unsubscribeListener();

    // Clear everything
    allScans  = [];
    heatData  = [];
    clusterGroup.clearLayers();
    clearTrails();
    if (leafletMap.hasLayer(heatLayer)) heatLayer.setLatLngs([]);

    const since = firebase.firestore.Timestamp.fromDate(periodStart());
    let initialDone = false;
    const batch     = [];

    const q = db.collection('scans')
      .where('timestamp', '>=', since)
      .orderBy('timestamp', 'desc')
      .limit(500);

    unsubscribeListener = q.onSnapshot(
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const scan = parseScan(change.doc.data());

          if (!initialDone) {
            batch.push(scan);
          } else {
            // ── LIVE NEW SCAN ── animate it ──────────────────────────────────
            allScans.push(scan);
            if (scan.latitude && scan.longitude) {
              heatData.push([scan.latitude, scan.longitude, 1]);
              if (leafletMap.hasLayer(heatLayer)) heatLayer.setLatLngs(heatData);
            }
            const marker = createMarker(scan, true);
            if (marker) {
              clusterGroup.addLayer(marker);
              // Pan to new scan
              leafletMap.panTo([scan.latitude, scan.longitude], { animate: true });
            }
            pushTrail(scan);
            redrawTrails();
            renderStats();
            updateCounter(scan);
          }
        });

        if (!initialDone) {
          initialDone = true;
          allScans = batch.slice();

          // Build trails + heat data from initial batch
          batch.forEach(scan => {
            const marker = createMarker(scan, false);
            if (marker) clusterGroup.addLayer(marker);
            if (scan.latitude && scan.longitude) {
              heatData.push([scan.latitude, scan.longitude, 1]);
              pushTrail(scan);
            }
          });
          redrawTrails();
          if (leafletMap.hasLayer(heatLayer)) heatLayer.setLatLngs(heatData);

          // Fit map to all markers
          const coords = allScans.filter(s => s.latitude && s.longitude).map(s => [s.latitude, s.longitude]);
          if (coords.length) leafletMap.fitBounds(coords, { padding: [40, 40], maxZoom: 18 });

          renderStats();
          updateCounter(allScans[0] || null);
        }
      },
      (err) => {
        console.error('onSnapshot error:', err.message);
        if (err.code === 'permission-denied') {
          document.getElementById('firebase-warning').style.display = 'block';
          document.getElementById('firebase-warning').querySelector('p').textContent =
            'Firestore permission denied. Check your security rules (allow read: if true for /scans).';
        }
      }
    );
  }

  function parseScan(raw) {
    const ts = raw.timestamp && raw.timestamp.toDate ? raw.timestamp.toDate() : new Date(raw.timestamp || 0);
    return {
      item_name:     raw.item_name     || '',
      category:      raw.category      || '',
      location_name: raw.location_name || '',
      latitude:      typeof raw.latitude  === 'number' ? raw.latitude  : null,
      longitude:     typeof raw.longitude === 'number' ? raw.longitude : null,
      gps_accuracy:  raw.gps_accuracy  || null,
      regen_points:  raw.regen_points  || 10,
      user_id:       raw.user_id       || 'anon',
      timestamp:     ts,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────────────────────
  async function init() {
    // Points badge from localStorage
    const pts = parseInt(localStorage.getItem('sara_points') || '0', 10);
    const badge = document.getElementById('points-badge');
    if (badge) badge.textContent = '🌱 ' + pts + ' pts';

    initMap();

    // Tab listeners
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPeriod = btn.dataset.period;
        if (db) subscribe();
      });
    });

    // View mode toggle
    document.querySelectorAll('.map-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => setViewMode(btn.dataset.mode));
    });

    const ok = await initFirebase();
    if (!ok) {
      document.getElementById('firebase-warning').style.display = 'block';
      return;
    }

    subscribe();
  }

  init();
})();
