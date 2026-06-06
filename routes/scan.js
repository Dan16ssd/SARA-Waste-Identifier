'use strict';

const express = require('express');
const router  = express.Router();
const { analyzeTrashImage } = require('../utils/gemini-lens');
const { getDb } = require('../utils/firebase-admin');

let _io          = null;
let _binState    = null;
let _updateBin   = null;
let _scanHistory = null;

function setIo(io)           { _io = io; }
function setBinState(bs)     { _binState = bs; }
function setUpdateBin(fn)    { _updateBin = fn; }
function setScanHistory(sh)  { _scanHistory = sh; }

const POINTS_PER_SCAN = 10;

router.post('/scan', async (req, res) => {
  const {
    imageBase64,
    mimeType = 'image/jpeg',
    binId = 'bin-1',
    lat,
    lng,
    gps_accuracy,
    location_name = 'Unknown',
    user_id = 'anonymous',
    probe = false,   // true = AR live-detect, skip Firestore + points
  } = req.body;

  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Gemini API key not configured' });

  try {
    // Returns an array of detected items, each with box_2d + recycling data
    const items = await analyzeTrashImage(imageBase64, mimeType);

    if (probe) return res.json({ items });

    // Use the first detected item for bin state update
    if (_updateBin && items.length > 0) _updateBin(binId, items[0].material);

    // Log each item to scan history (capped at first 5 to avoid spam)
    const toLog = items.slice(0, 5);
    if (_scanHistory) {
      const bin = _binState && _binState[binId];
      for (const item of toLog) {
        _scanHistory.unshift({
          timestamp: new Date().toISOString(),
          binId,
          binName: bin ? bin.name : binId,
          object:   item.object,
          material: item.material,
          action:   'Scanned',
        });
      }
      if (_scanHistory.length > 200) _scanHistory.length = 200;
    }

    // ── Save to Firestore ─────────────────────────────────────────────────────
    let total_points = null;
    const db = getDb();
    if (db) {
      const timestamp = new Date();
      const latVal = typeof lat === 'number' ? lat : (parseFloat(lat) || null);
      const lngVal = typeof lng === 'number' ? lng : (parseFloat(lng) || null);
      const accVal = typeof gps_accuracy === 'number' ? gps_accuracy : (parseFloat(gps_accuracy) || null);

      for (const item of toLog) {
        await db.collection('scans').add({
          item_name:    item.object,
          category:     item.material,
          location_name,
          latitude:     latVal,
          longitude:    lngVal,
          gps_accuracy: accVal,
          timestamp,
          user_id,
          regen_points: POINTS_PER_SCAN,
        });
      }

      const userRef = db.collection('users').doc(user_id);
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        const current = doc.exists ? (doc.data().total_points || 0) : 0;
        total_points  = current + POINTS_PER_SCAN;
        t.set(userRef, { total_points, last_scan: timestamp }, { merge: true });
      });
    }

    return res.json({ items, binId, regen_points: POINTS_PER_SCAN, total_points });
  } catch (err) {
    console.error('Scan error:', err);
    return res.status(500).json({ error: 'Scan failed', details: err.message });
  }
});

module.exports = { router, setIo, setBinState, setUpdateBin, setScanHistory };
