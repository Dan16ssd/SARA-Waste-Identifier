(function () {
  const binsGrid    = document.getElementById('bins-grid');
  const activityLog = document.getElementById('activity-log');
  const liveDot     = document.getElementById('live-dot');
  const liveStatus  = document.getElementById('live-status');
  const lastUpdated = document.getElementById('last-updated');

  const socket = io({ transports: ['websocket'] });

  socket.on('connect', () => {
    liveDot.classList.add('connected');
    liveStatus.textContent = '🟢 Live';
  });

  socket.on('disconnect', () => {
    liveDot.classList.remove('connected');
    liveStatus.textContent = '🔴 Disconnected';
  });

  socket.on('bin-updated', (binState) => {
    renderBins(binState);
    lastUpdated.textContent = new Date().toLocaleTimeString();
  });

  let previousState = {};

  function renderBins(binState) {
    binsGrid.innerHTML = '';

    Object.values(binState).forEach((bin) => {
      const prev  = previousState[bin.id];
      const isNew = prev && prev.lastScanTime !== bin.lastScanTime && bin.lastScanTime;

      const card = document.createElement('div');
      card.className = `bin-card ${bin.status}`;
      if (isNew) {
        card.style.animation = 'none';
        card.style.outline = '2px solid var(--green-mid)';
        setTimeout(() => { card.style.outline = ''; }, 1500);
      }

      const fill       = Math.max(0, Math.min(100, bin.fillLevel));
      const barClass   = bin.status === 'full' ? 'fill-bar full' : bin.status === 'warning' ? 'fill-bar warning' : 'fill-bar';
      const scanTime   = bin.lastScanTime ? new Date(bin.lastScanTime).toLocaleTimeString() : 'Never';
      const material   = bin.lastMaterial || 'No scan yet';

      card.innerHTML = `
        <div class="bin-name">📍 ${escHtml(bin.name)}</div>
        <div class="bin-location">${escHtml(bin.location)}</div>
        <div class="fill-bar-bg"><div class="${barClass}" style="width:${fill}%"></div></div>
        <div class="fill-label">${fill}% full ${statusEmoji(bin.status)}</div>
        <div class="bin-meta">
          <span>Last material: <strong>${escHtml(material)}</strong></span>
          <span>Last scan: <strong>${scanTime}</strong></span>
        </div>
      `;

      binsGrid.appendChild(card);

      // Log new scans
      if (isNew) {
        addLogEntry(`Bin <strong>${escHtml(bin.name)}</strong> scanned: ${escHtml(material)} (${fill}% full)`);
      }
    });

    previousState = JSON.parse(JSON.stringify(binState));
  }

  function addLogEntry(html) {
    const noActivity = activityLog.querySelector('p');
    if (noActivity) noActivity.remove();

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
      <span class="log-time">${new Date().toLocaleTimeString()}</span>
      <span class="log-msg">— ${html}</span>
    `;
    activityLog.insertBefore(entry, activityLog.firstChild);

    // Keep log to 50 entries
    while (activityLog.children.length > 50) {
      activityLog.removeChild(activityLog.lastChild);
    }
  }

  function statusEmoji(status) {
    if (status === 'full')    return '⚠️ FULL';
    if (status === 'warning') return '🟡';
    return '✅';
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
