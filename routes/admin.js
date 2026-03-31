'use strict';

const express      = require('express');
const router       = express.Router();
const { requireAuth } = require('../middleware/auth');

let _io        = null;
let _binState  = null;
let _scanHistory = null;

function setIo(io)              { _io = io; }
function setBinState(bs)        { _binState = bs; }
function setScanHistory(sh)     { _scanHistory = sh; }

// GET /api/admin/bins — list all bins
router.get('/bins', requireAuth, (req, res) => {
  res.json(_binState);
});

// PUT /api/admin/bins/:id — update a bin
router.put('/bins/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const bin = _binState[id];
  if (!bin) return res.status(404).json({ error: 'Bin not found' });

  const { location, fillLevel, name } = req.body;
  if (location  !== undefined) bin.location  = location;
  if (name      !== undefined) bin.name      = name;
  if (fillLevel !== undefined) {
    bin.fillLevel = Math.max(0, Math.min(100, Number(fillLevel)));
    if (bin.fillLevel > 85)      bin.status = 'full';
    else if (bin.fillLevel > 60) bin.status = 'warning';
    else                         bin.status = 'ok';
  }

  // Log admin update
  if (_scanHistory) {
    _scanHistory.unshift({
      timestamp: new Date().toISOString(),
      binId: id,
      binName: bin.name,
      material: bin.lastMaterial || '—',
      action: 'Admin updated',
    });
    if (_scanHistory.length > 200) _scanHistory.length = 200;
  }

  if (_io) _io.emit('bin-updated', _binState);
  res.json(bin);
});

// DELETE /api/admin/bins/:id — remove a bin
router.delete('/bins/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  if (!_binState[id]) return res.status(404).json({ error: 'Bin not found' });
  delete _binState[id];
  if (_io) _io.emit('bin-updated', _binState);
  res.json({ message: `Bin ${id} removed` });
});

// POST /api/admin/bins — add a new bin
router.post('/bins', requireAuth, (req, res) => {
  const { id, name, location } = req.body;
  if (!id || !name || !location) {
    return res.status(400).json({ error: 'id, name, and location are required' });
  }
  if (_binState[id]) return res.status(409).json({ error: 'Bin ID already exists' });

  _binState[id] = { id, name, location, fillLevel: 0, lastMaterial: null, lastScanTime: null, status: 'ok' };
  if (_io) _io.emit('bin-updated', _binState);
  res.status(201).json(_binState[id]);
});

// GET /api/admin/logs — scan history + analytics
router.get('/logs', requireAuth, (req, res) => {
  const history = _scanHistory || [];

  // Analytics
  const today = new Date().toDateString();
  const todayScans = history.filter(e => new Date(e.timestamp).toDateString() === today);

  const materialCounts = {};
  todayScans.forEach(e => {
    if (e.material && e.material !== '—') {
      materialCounts[e.material] = (materialCounts[e.material] || 0) + 1;
    }
  });

  let topMaterial = null;
  let topCount = 0;
  Object.entries(materialCounts).forEach(([mat, cnt]) => {
    if (cnt > topCount) { topMaterial = mat; topCount = cnt; }
  });

  const binsAtCapacity = Object.values(_binState || {}).filter(b => b.fillLevel > 85).length;

  res.json({
    history: history.slice(0, 100),
    analytics: {
      totalScansToday: todayScans.length,
      topMaterial,
      topMaterialPercent: todayScans.length
        ? Math.round((topCount / todayScans.length) * 100)
        : 0,
      binsAtCapacity,
    },
  });
});

module.exports = { router, setIo, setBinState, setScanHistory };
