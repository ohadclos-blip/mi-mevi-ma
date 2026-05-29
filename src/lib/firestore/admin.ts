import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  getFirestore,
  Timestamp,
} from 'firebase/firestore'
import { getFirebaseApp } from '../firebase'

function db() {
  return getFirestore(getFirebaseApp())
}

export interface AdminUserData {
  uid:         string
  displayName: string | null
  email:       string | null
  isDeleted:   boolean
  createdAt:   { seconds: number } | null
}

export interface AuditEntry {
  id:         string
  action:     string
  adminUid:   string
  adminEmail: string | null
  targetId:   string
  details:    string
  createdAt:  Timestamp
}

export async function isAdmin(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db(), 'admins', uid))
  return snap.exists()
}

export async function getAllEvents() {
  const snap = await getDocs(query(collection(db(), 'events'), orderBy('createdAt', 'desc')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() })) as Array<{
    id: string; name: string; status: string
    date: { seconds: number }; createdBy: string; createdAt: { seconds: number }; mode: string
  }>
}

export async function getAllUsers(): Promise<AdminUserData[]> {
  const snap = await getDocs(query(collection(db(), 'users'), orderBy('createdAt', 'desc')))
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }) as AdminUserData)
}

export async function getAuditLog(count = 100): Promise<AuditEntry[]> {
  const snap = await getDocs(
    query(collection(db(), 'audit_log'), orderBy('createdAt', 'desc'), limit(count))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as AuditEntry)
}

async function writeAuditLog(
  adminUid: string,
  adminEmail: string | null,
  action: string,
  targetId: string,
  details: string,
) {
  await addDoc(collection(db(), 'audit_log'), {
    action, adminUid, adminEmail, targetId, details,
    createdAt: serverTimestamp(),
  })
}

export async function adminSetUserDeleted(
  uid: string, isDeleted: boolean,
  adminUid: string, adminEmail: string | null,
): Promise<void> {
  await updateDoc(doc(db(), 'users', uid), { isDeleted })
  await writeAuditLog(adminUid, adminEmail, isDeleted ? 'user_deleted' : 'user_restored', uid, '')
}

export async function adminSetEventStatus(
  eventId: string, status: string,
  adminUid: string, adminEmail: string | null,
): Promise<void> {
  await updateDoc(doc(db(), 'events', eventId), { status })
  await writeAuditLog(adminUid, adminEmail, `event_${status}`, eventId, '')
}
