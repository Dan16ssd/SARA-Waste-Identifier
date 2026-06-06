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

module.exports = { getDb };
