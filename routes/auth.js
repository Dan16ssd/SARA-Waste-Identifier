'use strict';

const express = require('express');
const jwt     = require('jsonwebtoken');
const router  = express.Router();

router.post('/login', async (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  if (password !== adminPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const secret = process.env.JWT_SECRET || 'trashscan-secret';
  const token  = jwt.sign({ role: 'admin' }, secret, { expiresIn: '24h' });
  return res.json({ token });
});

router.post('/logout', (_req, res) => {
  // JWT is stateless — client removes token; server just acknowledges
  return res.json({ message: 'Logged out' });
});

module.exports = router;
