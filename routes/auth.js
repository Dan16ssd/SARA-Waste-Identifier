'use strict';

const express  = require('express');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const router   = express.Router();
const { createOrg, getOrg, findOrgByJoinCode } = require('../utils/firebase-admin');

function genJoinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ── Legacy admin login (global admin, no org) ──────────────────────────────────
router.post('/login', async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password is required' });

  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  if (password !== adminPassword) return res.status(401).json({ error: 'Invalid password' });

  const secret = process.env.JWT_SECRET || 'trashscan-secret';
  const token  = jwt.sign({ role: 'admin' }, secret, { expiresIn: '24h' });
  return res.json({ token });
});

router.post('/logout', (_req, res) => res.json({ message: 'Logged out' }));

// ── Org registration ──────────────────────────────────────────────────────────
router.post('/orgs/register', async (req, res) => {
  const { name, locationName, lat, lng, password } = req.body || {};
  if (!name || !password) return res.status(400).json({ error: 'name and password are required' });

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const joinCode     = genJoinCode();
    const org_id       = await createOrg({ name, locationName: locationName || name, lat, lng, passwordHash, joinCode });
    return res.status(201).json({ org_id, joinCode });
  } catch (err) {
    console.error('Org register error:', err);
    return res.status(500).json({ error: 'Failed to create organization' });
  }
});

// ── Org admin login ───────────────────────────────────────────────────────────
router.post('/orgs/login', async (req, res) => {
  const { org_id, password } = req.body || {};
  if (!org_id || !password) return res.status(400).json({ error: 'org_id and password are required' });

  try {
    const org = await getOrg(org_id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const valid = await bcrypt.compare(password, org.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });

    const secret = process.env.JWT_SECRET || 'trashscan-secret';
    const token  = jwt.sign({ role: 'admin', org_id: org.id, org_name: org.name }, secret, { expiresIn: '24h' });
    return res.json({ token, org_name: org.name, org_id: org.id });
  } catch (err) {
    console.error('Org login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ── Org join by code ──────────────────────────────────────────────────────────
router.post('/orgs/join', async (req, res) => {
  const { joinCode } = req.body || {};
  if (!joinCode) return res.status(400).json({ error: 'joinCode is required' });

  try {
    const org = await findOrgByJoinCode(joinCode);
    if (!org) return res.status(404).json({ error: 'Invalid join code' });

    return res.json({
      org_id:   org.id,
      org_name: org.name,
      location: org.location || null,
    });
  } catch (err) {
    console.error('Org join error:', err);
    return res.status(500).json({ error: 'Join failed' });
  }
});

// ── Org public info (for dashboard centering) ─────────────────────────────────
router.get('/orgs/:id', async (req, res) => {
  try {
    const org = await getOrg(req.params.id);
    if (!org) return res.status(404).json({ error: 'Not found' });
    return res.json({ org_id: org.id, name: org.name, location: org.location || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load org' });
  }
});

module.exports = router;
