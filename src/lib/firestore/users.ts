import { doc, setDoc, getDoc, updateDoc, serverTimestamp, getFirestore } from 'firebase/firestore'
import { User } from 'firebase/auth'
import { getFirebaseApp } from '../firebase'

function db() {
  return getFirestore(getFirebaseApp())
}

export async function createUserIfNotExists(user: User) {
  const ref  = doc(db(), 'users', user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName:     user.displayName,
      email:           user.email,
      phoneWhatsApp:   null,
      isDeleted:       false,
      eventsOwned:     [],
      eventsAttending: {},
      createdAt:       serverTimestamp(),
    })
  }
}

export async function getAttendingEventIds(userId: string): Promise<string[]> {
  const snap = await getDoc(doc(db(), 'users', userId))
  if (!snap.exists()) return []
  const data = snap.data()
  const attending = (data.eventsAttending ?? {}) as Record<string, boolean>
  return Object.entries(attending).filter(([, v]) => v).map(([id]) => id)
}

export async function migrateLocalStorageToCloud(
  userId:   string,
  eventIds: string[],
): Promise<void> {
  if (eventIds.length === 0) return
  const attending: Record<string, boolean> = {}
  eventIds.forEach(id => { attending[id] = true })
  await updateDoc(doc(db(), 'users', userId), { eventsAttending: attending })
}
