import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminApp() {
  return getApps()[0] ?? initializeApp()
}

export function adminDb() {
  return getFirestore(getAdminApp())
}
