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

// In-memory scan history (shared across routes)
const scanHistory = [];

// ── Firebase client config ────────────────────────────────────────────────────
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
scanRouter.setScanHistory(scanHistory);
app.use('/api', scanRouter.router);

const authRouter = require('./routes/auth');
app.use('/api', authRouter);

const adminModule = require('./routes/admin');
adminModule.setIo(io);
adminModule.setScanHistory(scanHistory);
app.use('/api/admin', adminModule.router);

const chatRouter = require('./routes/chat');
app.use('/api', chatRouter);

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  const token = socket.handshake.query && socket.handshake.query.token;
  if (token) {
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET || 'trashscan-secret');
      socket.user = user;
      // Join org room so bin updates only reach the right org's clients
      if (user.org_id) {
        socket.join(user.org_id);
        console.log(`Socket ${socket.id} joined org room: ${user.org_id}`);
      }
    } catch {
      // Non-admin or invalid token — still connected, just no org room
    }
  }

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
  console.log(`SARA server running at http://localhost:${PORT}`);
});
