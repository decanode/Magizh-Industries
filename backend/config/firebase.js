const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
require('dotenv').config();
const isAppHosting = process.env.K_SERVICE !== undefined || process.env.FIREBASE_CONFIG !== undefined;
const usingEmulator = process.env.FIRESTORE_EMULATOR_HOST !== undefined || process.env.FIREBASE_AUTH_EMULATOR_HOST !== undefined;

// Initialize Firebase Admin
if (!admin.apps.length) {
  if (isAppHosting) {
    // Cloud environment: Use Application Default Credentials (Firebase App Hosting)
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    logger.info("Firebase Connected");
  } else if (usingEmulator) {
    // Local emulators: no credentials needed. Only demo-* project ids are allowed so nothing can reach a real project.
    const projectId = process.env.GCLOUD_PROJECT || 'demo-magizh';
    if (!projectId.startsWith('demo-')) {
      throw new Error(`Emulator mode requires a demo-* project id, got "${projectId}"`);
    }
    admin.initializeApp({ projectId });
    logger.info(`Firebase Connected (Local emulator, project ${projectId})`);
  } else {
    // Local environment (dev or prod mode): Use service account file
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    
    if (!fs.existsSync(serviceAccountPath)) {
      logger.error('add serviceAccountKey.json to backend/config/');
      process.exit(1);
    }
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    logger.info(`Firebase Connected (Local - ${process.env.NODE_ENV || 'development'} mode)`);
  }
  }
const db = admin.firestore();
const auth = admin.auth();
module.exports = { admin, db, auth };