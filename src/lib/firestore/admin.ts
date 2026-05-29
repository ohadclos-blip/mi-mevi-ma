import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  getFirestore,
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

export async function adminSetUserDeleted(uid: string, isDeleted: boolean): Promise<void> {
  await updateDoc(doc(db(), 'users', uid), { isDeleted })
}

export async function adminSetEventStatus(eventId: string, status: string): Promise<void> {
  await updateDoc(doc(db(), 'events', eventId), { status })
}
