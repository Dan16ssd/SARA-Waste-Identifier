'use strict';

const express      = require('express');
const router       = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getOrgBins, setOrgBin, deleteOrgBin } = require('../utils/firebase-admin');

let _io          = null;
let _scanHistory = null;

function setIo(io)          { _io = io; }
function setScanHistory(sh) { _scanHistory = sh; }

// GET /api/admin/bins
router.get('/bins', requireAuth, async (req, res) => {
  const org_id = req.user && req.user.org_id;
  if (!org_id) return res.status(403).json({ error: 'No organization associated with this account' });
  try {
    const bins = await getOrgBins(org_id);
    res.json(bins);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load bins' });
  }
});

// PUT /api/admin/bins/:id
router.put('/bins/:id', requireAuth, async (req, res) => {
  const org_id = req.user && req.user.org_id;
  if (!org_id) return res.status(403).json({ error: 'No organization associated with this account' });
  const { id } = req.params;

  try {
    const bins = await getOrgBins(org_id);
    const bin  = bins[id];
    if (!bin) return res.status(404).json({ error: 'Bin not found' });

    const { location, fillLevel, name } = req.body;
    if (location  !== undefined) bin.location  = location;
    if (name      !== undefined) bin.name      = name;
    if (fillLevel !== undefined) {
      bin.fillLevel = Math.max(0, Math.min(100, Number(fillLevel)));
      bin.status = bin.fillLevel > 85 ? 'full' : bin.fillLevel > 60 ? 'warning' : 'ok';
    }

    await setOrgBin(org_id, id, bin);

    if (_scanHistory) {
      _scanHistory.unshift({ timestamp: new Date().toISOString(), binId: id, binName: bin.name, material: bin.lastMaterial || '—', action: 'Admin updated' });
      if (_scanHistory.length > 200) _scanHistory.length = 200;
    }
    if (_io) _io.to(org_id).emit('bin-updated', await getOrgBins(org_id));
    res.json(bin);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update bin' });
  }
});

// DELETE /api/admin/bins/:id
router.delete('/bins/:id', requireAuth, async (req, res) => {
  const org_id = req.user && req.user.org_id;
  if (!org_id) return res.status(403).json({ error: 'No organization associated with this account' });
  const { id } = req.params;

  try {
    await deleteOrgBin(org_id, id);
    if (_io) _io.to(org_id).emit('bin-updated', await getOrgBins(org_id));
    res.json({ message: `Bin ${id} removed` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete bin' });
  }
});

// POST /api/admin/bins
router.post('/bins', requireAuth, async (req, res) => {
  const org_id = req.user && req.user.org_id;
  if (!org_id) return res.status(403).json({ error: 'No organization associated with this account' });
  const { id, name, location } = req.body;
  if (!id || !name || !location) return res.status(400).json({ error: 'id, name, and location are required' });

  try {
    const existing = await getOrgBins(org_id);
    if (existing[id]) return res.status(409).json({ error: 'Bin ID already exists' });

    const newBin = { id, name, location, fillLevel: 0, lastMaterial: null, lastScanTime: null, status: 'ok' };
    await setOrgBin(org_id, id, newBin);
    if (_io) _io.to(org_id).emit('bin-updated', await getOrgBins(org_id));
    res.status(201).json(newBin);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add bin' });
  }
});

// GET /api/admin/logs
router.get('/logs', requireAuth, (req, res) => {
  const history = _scanHistory || [];
  const today   = new Date().toDateString();
  const todayScans = history.filter(e => new Date(e.timestamp).toDateString() === today);

  const materialCounts = {};
  todayScans.forEach(e => {
    if (e.material && e.material !== '—') materialCounts[e.material] = (materialCounts[e.material] || 0) + 1;
  });

  let topMaterial = null, topCount = 0;
  Object.entries(materialCounts).forEach(([mat, cnt]) => {
    if (cnt > topCount) { topMaterial = mat; topCount = cnt; }
  });

  res.json({
    history: history.slice(0, 100),
    analytics: {
      totalScansToday: todayScans.length,
      topMaterial,
      topMaterialPercent: todayScans.length ? Math.round((topCount / todayScans.length) * 100) : 0,
      binsAtCapacity: 0,
    },
  });
});

module.exports = { router, setIo, setScanHistory };
