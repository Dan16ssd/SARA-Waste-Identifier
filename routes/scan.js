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
  } = req.body;

  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Gemini API key not configured' });

  try {
    const result = await analyzeTrashImage(imageBase64, mimeType);

    if (_updateBin) _updateBin(binId, result.material);

    if (_scanHistory) {
      const bin = _binState && _binState[binId];
      _scanHistory.unshift({
        timestamp: new Date().toISOString(),
        binId,
        binName: bin ? bin.name : binId,
        object:   result.object,
        material: result.material,
        action:   'Scanned',
      });
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
      await db.collection('scans').add({
        item_name:     result.object,
        category:      result.material,
        location_name,
        latitude:      latVal,
        longitude:     lngVal,
        gps_accuracy:  accVal,
        timestamp,
        user_id,
        regen_points:  POINTS_PER_SCAN,
      });

      const userRef = db.collection('users').doc(user_id);
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        const current = doc.exists ? (doc.data().total_points || 0) : 0;
        total_points  = current + POINTS_PER_SCAN;
        t.set(userRef, { total_points, last_scan: timestamp }, { merge: true });
      });
    }

    return res.json({ ...result, binId, regen_points: POINTS_PER_SCAN, total_points });
  } catch (err) {
    console.error('Scan error:', err);
    return res.status(500).json({ error: 'Scan failed', details: err.message });
  }
});

const WASTE_LABELS = new Set([
  'bottle', 'cup', 'bowl', 'vase', 'can',
  'book', 'scissors', 'toothbrush', 'cell phone',
  'banana', 'apple', 'orange', 'carrot', 'sandwich', 'pizza', 'donut', 'cake',
  'fork', 'knife', 'spoon',
]);

router.post('/detect', async (req, res) => {
  const { imageBase64, mimeType = 'image/jpeg' } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
  if (!process.env.HF_TOKEN) return res.status(500).json({ error: 'HF_TOKEN not configured' });

  const imageBuffer = Buffer.from(imageBase64, 'base64');

  let hfRes;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      hfRes = await fetch(
        'https://api-inference.huggingface.co/models/facebook/detr-resnet-50',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.HF_TOKEN}`,
            'Content-Type': mimeType,
          },
          body: imageBuffer,
          signal: AbortSignal.timeout(15000),
        }
      );
      break;
    } catch (fetchErr) {
      const isTransient =
        fetchErr.name === 'TimeoutError' ||
        fetchErr.cause?.code === 'ENOTFOUND' ||
        fetchErr.cause?.code === 'ECONNRESET';

      if (isTransient && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      // Network unavailable after retry — degrade gracefully, scan still runs via Gemini
      return res.json({ detection: null });
    }
  }

  try {
    if (hfRes.status === 503 || hfRes.status === 429) {
      return res.json({ detection: null, warming: true });
    }

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      console.error('HuggingFace error:', hfRes.status, errText.slice(0, 200));
      return res.json({ detection: null });
    }

    const detections = await hfRes.json();
    if (!Array.isArray(detections)) return res.json({ detection: null });

    const wasteItems = detections.filter(d =>
      WASTE_LABELS.has((d.label || '').toLowerCase()) && d.score > 0.5
    );

    return res.json({ detection: wasteItems[0] || null });
  } catch (err) {
    console.error('Detect error:', err);
    return res.json({ detection: null });
  }
});

module.exports = { router, setIo, setBinState, setUpdateBin, setScanHistory };
