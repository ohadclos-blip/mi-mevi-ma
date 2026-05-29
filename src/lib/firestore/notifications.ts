import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  getFirestore,
  Timestamp,
} from 'firebase/firestore'
import { getFirebaseApp } from '../firebase'

function db() {
  return getFirestore(getFirebaseApp())
}

export interface NotificationData {
  id:        string
  eventId:   string
  eventName: string
  type:      'auto_frozen'
  read:      boolean
  createdAt: Timestamp
}

export async function getUnreadNotifications(uid: string): Promise<NotificationData[]> {
  const snap = await getDocs(
    query(
      collection(db(), 'notifications', uid, 'items'),
      where('read', '==', false),
    )
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as NotificationData)
}

export async function markNotificationRead(uid: string, notifId: string): Promise<void> {
  await updateDoc(doc(db(), 'notifications', uid, 'items', notifId), { read: true })
}
