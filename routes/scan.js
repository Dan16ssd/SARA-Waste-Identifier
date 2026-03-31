'use strict';

const express = require('express');
const router  = express.Router();
const { analyzeTrashImage } = require('../utils/gemini-lens');

let _io          = null;
let _binState    = null;
let _updateBin   = null;
let _scanHistory = null;

function setIo(io)           { _io = io; }
function setBinState(bs)     { _binState = bs; }
function setUpdateBin(fn)    { _updateBin = fn; }
function setScanHistory(sh)  { _scanHistory = sh; }

router.post('/scan', async (req, res) => {
  const { imageBase64, mimeType = 'image/jpeg', binId = 'bin-1' } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key not configured' });
  }

  try {
    const result = await analyzeTrashImage(imageBase64, mimeType);

    // Update bin state and broadcast
    if (_updateBin) {
      _updateBin(binId, result.material);
    }

    // Record in scan history
    if (_scanHistory) {
      const bin = _binState && _binState[binId];
      _scanHistory.unshift({
        timestamp: new Date().toISOString(),
        binId,
        binName: bin ? bin.name : binId,
        object: result.object,
        material: result.material,
        action: 'Scanned',
      });
      if (_scanHistory.length > 200) _scanHistory.length = 200;
    }

    return res.json({ ...result, binId });
  } catch (err) {
    console.error('Scan error:', err);
    return res.status(500).json({ error: 'Scan failed', details: err.message });
  }
});

module.exports = { router, setIo, setBinState, setUpdateBin, setScanHistory };
