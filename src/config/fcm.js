const admin = require('firebase-admin');

let initialized = false;

function initFirebaseAdmin() {
  if (initialized) return admin;
  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    } else {
      // Allow local file path via FIREBASE_SERVICE_ACCOUNT
      const svcPath = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (svcPath) {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        const serviceAccount = require(svcPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        // Inline JSON (string) credential support
        const jsonStr = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        try {
          const parsed = JSON.parse(jsonStr);
          admin.initializeApp({
            credential: admin.credential.cert(parsed),
          });
        } catch (parseErr) {
          console.warn('Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', parseErr.message);
        }
      }
    }
    initialized = true;
  } catch (e) {
    // Defer failures; sending will be skipped if not initialized
    // eslint-disable-next-line no-console
    console.warn('Firebase admin init failed:', e.message);
  }
  return admin;
}

module.exports = { admin, initFirebaseAdmin };


