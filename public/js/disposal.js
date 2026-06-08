(async function () {
  const grid      = document.getElementById('guide-grid');
  const filterRow = document.getElementById('filter-row');

  // Bin colour labels
  const binColor = {
    plastic:   { label: 'Blue Recycling Bin',  color: '#1565c0', bg: '#e3f2fd' },
    metal:     { label: 'Blue Recycling Bin',  color: '#1565c0', bg: '#e3f2fd' },
    glass:     { label: 'Green Glass Bin',     color: '#2e7d32', bg: '#e8f5e9' },
    paper:     { label: 'Brown Paper Bin',     color: '#5d4037', bg: '#efebe9' },
    organic:   { label: 'Brown Compost Bin',   color: '#4e342e', bg: '#efebe9' },
    ewaste:    { label: 'E-Waste Drop-off',    color: '#6a1b9a', bg: '#f3e5f5' },
    hazardous: { label: 'Facilities Office',   color: '#b71c1c', bg: '#ffebee' },
    mixed:     { label: 'General Waste Bin',   color: '#37474f', bg: '#eceff1' },
  };

  let guidelines = {};

  try {
    const resp = await fetch('/recycling-guidelines.json');
    if (!resp.ok) throw new Error('not found');
    guidelines = await resp.json();
  } catch (e) {
    grid.innerHTML = '<p style="color:var(--red);">Could not load guidelines. Make sure the server is running.</p>';
    return;
  }

  // Check if a specific material was linked to (e.g. from scanner)
  const hash = window.location.hash.replace('#', '');

  // Build filter buttons
  const filters = [
    { key: 'all',       label: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px; margin-right:4px;"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>All' },
    { key: 'recycle',   label: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px; margin-right:4px;"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M16.24 7.76l-8.48 8.48" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7.76 7.76l8.48 8.48" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>Recyclable' },
    { key: 'special',   label: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px; margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Special Disposal' },
  ];

  filters.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (f.key === 'all' ? 'btn-primary' : 'btn-secondary');
    btn.innerHTML = f.label;
    btn.dataset.filter = f.key;
    btn.addEventListener('click', () => {
      filterRow.querySelectorAll('button').forEach(b => {
        b.className = 'btn btn-secondary';
      });
      btn.className = 'btn btn-primary';
      applyFilter(f.key);
    });
    filterRow.appendChild(btn);
  });

  function applyFilter(key) {
    grid.querySelectorAll('.guide-card').forEach(card => {
      const recyclable = card.dataset.recyclable === 'true';
      if (key === 'all')     card.style.display = '';
      else if (key === 'recycle')  card.style.display = recyclable ? '' : 'none';
      else if (key === 'special')  card.style.display = !recyclable ? '' : 'none';
    });
  }

  // Build material cards
  Object.entries(guidelines).forEach(([key, mat]) => {
    const bin    = binColor[key] || binColor.mixed;
    const recBadge = mat.recyclable
      ? '<span class="badge badge-yes"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px; margin-right:3px;"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>Recyclable</span>'
      : '<span class="badge badge-no"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px; margin-right:3px;"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Special Disposal</span>';

    const card = document.createElement('div');
    card.className = 'guide-card';
    card.dataset.recyclable = mat.recyclable;
    card.id = 'material-' + key;

    card.innerHTML = `
      <div class="guide-card-header" onclick="this.parentElement.classList.toggle('open')">
        <span class="guide-icon">${mat.icon}</span>
        <span class="guide-name">${mat.name}</span>
        <span class="guide-badges">${recBadge}</span>
        <span class="guide-chevron">▼</span>
      </div>
      <div class="guide-card-body">
        <div class="bin-tag" style="background:${bin.bg}; color:${bin.color};">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px; margin-right:4px;"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Dispose in: <strong>${bin.label}</strong>
        </div>
        <p style="font-weight:600; margin-bottom:8px; color:var(--green-dark);">Step-by-step instructions:</p>
        <ol class="guide-steps">
          ${mat.guidelines.map(g => `<li>${g}</li>`).join('')}
        </ol>
      </div>
    `;

    grid.appendChild(card);
  });

  // Auto-open and scroll if linked from scanner
  if (hash) {
    const target = document.getElementById('material-' + hash);
    if (target) {
      target.classList.add('open');
      setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }
})();
