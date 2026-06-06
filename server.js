'use strict';

require('dotenv').config();
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors   = require('cors');
const path   = require('path');
const jwt    = require('jsonwebtoken');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { transports: ['websocket'] });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Campus bin state ──────────────────────────────────────────────────────────
const binsData = require('./data/bins.json');
const binState = {};
binsData.forEach(b => { binState[b.id] = { ...b }; });

// In-memory scan history (shared across routes)
const scanHistory = [];

// ── Bin helpers ───────────────────────────────────────────────────────────────
function updateBin(binId, material) {
  const bin = binState[binId];
  if (!bin) return;

  bin.fillLevel    = Math.min(100, bin.fillLevel + 10);
  bin.lastMaterial = material;
  bin.lastScanTime = new Date().toISOString();

  if      (bin.fillLevel > 85) bin.status = 'full';
  else if (bin.fillLevel > 60) bin.status = 'warning';
  else                         bin.status = 'ok';

  io.emit('bin-updated', binState);
}

// ── Firebase client config (safe to expose — protected by Firestore rules) ─────
app.get('/api/firebase-config', (_req, res) => {
  res.json({
    apiKey:     process.env.FIREBASE_API_KEY     || '',
    projectId:  process.env.FIREBASE_PROJECT_ID  || '',
    configured: !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_API_KEY),
  });
});

// ── Mount routes ──────────────────────────────────────────────────────────────
const recyclingGuidelines = require('./data/recycling-guidelines.json');
app.get('/api/guidelines', (_req, res) => res.json(recyclingGuidelines));
const scanRouter = require('./routes/scan');
scanRouter.setIo(io);
scanRouter.setBinState(binState);
scanRouter.setUpdateBin(updateBin);
scanRouter.setScanHistory(scanHistory);
app.use('/api', scanRouter.router);

const authRouter = require('./routes/auth');
app.use('/api', authRouter);

const adminModule = require('./routes/admin');
adminModule.setIo(io);
adminModule.setBinState(binState);
adminModule.setScanHistory(scanHistory);
app.use('/api/admin', adminModule.router);

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Optionally authenticate admin socket connections
  const token = socket.handshake.query && socket.handshake.query.token;
  if (token) {
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET || 'trashscan-secret');
    } catch {
      // Non-admin connection is fine
    }
  }

  // Push current state immediately so every page loads populated
  socket.emit('bin-updated', binState);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ── Error handlers ────────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TrashScan server running at http://localhost:${PORT}`);
});
