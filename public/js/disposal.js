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
    { key: 'all',       label: '🗂️ All' },
    { key: 'recycle',   label: '♻️ Recyclable' },
    { key: 'special',   label: '⚠️ Special Disposal' },
  ];

  filters.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (f.key === 'all' ? 'btn-primary' : 'btn-secondary');
    btn.textContent = f.label;
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
      ? '<span class="badge badge-yes">✅ Recyclable</span>'
      : '<span class="badge badge-no">❌ Special Disposal</span>';

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
          🗑️ Dispose in: <strong>${bin.label}</strong>
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
