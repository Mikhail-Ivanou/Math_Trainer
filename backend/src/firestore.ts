import { applicationDefault, cert, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'node:fs';

export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'math-traineer';

/**
 * Admin SDK access to Firestore (bypasses security rules).
 * Credentials, first match wins:
 *  - GOOGLE_APPLICATION_CREDENTIALS / backend/service-account.json — a service account key
 *    (Firebase Console → Project settings → Service accounts → Generate new private key);
 *  - application default credentials (`gcloud auth application-default login`).
 */
export function adminFirestore(): Firestore {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? new URL('../service-account.json', import.meta.url).pathname;
  const app: App = existsSync(keyPath)
    ? initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))), projectId: PROJECT_ID })
    : initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  return getFirestore(app);
}
