'use strict';

let _db = null;

function getDb() {
  if (_db) return _db;
  if (!process.env.FIREBASE_PROJECT_ID) return null;

  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
      });
    }
    _db = admin.firestore();
  } catch (e) {
    console.error('Firebase Admin init failed:', e.message);
    return null;
  }
  return _db;
}

async function createOrg({ name, locationName, lat, lng, passwordHash, joinCode }) {
  const db = getDb();
  if (!db) throw new Error('Firestore not available');
  const ref = await db.collection('organizations').add({
    name,
    joinCode,
    passwordHash,
    location: { name: locationName || name, lat: lat || null, lng: lng || null },
    createdAt: new Date(),
  });
  return ref.id;
}

async function getOrg(orgId) {
  const db = getDb();
  if (!db) return null;
  const doc = await db.collection('organizations').doc(orgId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function findOrgByJoinCode(code) {
  const db = getDb();
  if (!db) return null;
  const snap = await db.collection('organizations')
    .where('joinCode', '==', code.toUpperCase())
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getOrgBins(orgId) {
  const db = getDb();
  if (!db) return {};
  const snap = await db.collection('organizations').doc(orgId).collection('bins').get();
  const bins = {};
  snap.forEach(doc => { bins[doc.id] = { id: doc.id, ...doc.data() }; });
  return bins;
}

async function setOrgBin(orgId, binId, data) {
  const db = getDb();
  if (!db) throw new Error('Firestore not available');
  await db.collection('organizations').doc(orgId).collection('bins').doc(binId).set(data, { merge: true });
}

async function deleteOrgBin(orgId, binId) {
  const db = getDb();
  if (!db) throw new Error('Firestore not available');
  await db.collection('organizations').doc(orgId).collection('bins').doc(binId).delete();
}

module.exports = { getDb, createOrg, getOrg, findOrgByJoinCode, getOrgBins, setOrgBin, deleteOrgBin };
