import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  Timestamp,
  getFirestore,
  query,
  where,
  onSnapshot,
  runTransaction,
  increment,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore'
import { getFirebaseApp } from '../firebase'

function db() {
  return getFirestore(getFirebaseApp())
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EventItem {
  name:     string
  quantity: number
}

export interface CreateEventData {
  name:           string
  date:           Date
  description:    string
  mode:           'prescribed' | 'open'
  allowUnclaim:   boolean
  visibilityMode: 'open' | 'private'
  items:          EventItem[]
  createdBy:      string
}

export interface EventData {
  id:                  string
  name:                string
  date:                Timestamp
  description:         string
  mode:                'prescribed' | 'open'
  status:              'active' | 'frozen' | 'blocked' | 'deleted'
  allowUnclaim:        boolean
  visibilityMode:      'open' | 'private'
  clonedFromEventId:   string | null
  lifecycleNotifiedAt: Timestamp | null
  createdBy:           string
  createdAt:           Timestamp
}

export interface ItemData {
  id:                  string
  name:                string
  quantity:            number
  addedBy:             string | null
  addedByNickname:     string | null
  totalClaimed:        number
  claimedByNicknames:  string[]
  createdAt:           Timestamp
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function createEvent(data: CreateEventData): Promise<string> {
  const { items, ...eventFields } = data

  const eventRef = await addDoc(collection(db(), 'events'), {
    ...eventFields,
    date:                Timestamp.fromDate(data.date),
    status:              'active',
    clonedFromEventId:   null,
    lifecycleNotifiedAt: null,
    createdAt:           serverTimestamp(),
  })

  if (data.mode === 'prescribed') {
    for (const item of items.filter(i => i.name.trim())) {
      await addDoc(collection(db(), 'events', eventRef.id, 'items'), {
        name:               item.name.trim(),
        quantity:           item.quantity,
        addedBy:            null,
        addedByNickname:    null,
        totalClaimed:       0,
        claimedByNicknames: [],
        createdAt:          serverTimestamp(),
      })
    }
  }

  await updateDoc(doc(db(), 'users', data.createdBy), {
    eventsOwned: arrayUnion(eventRef.id),
  })

  return eventRef.id
}

export async function getEvent(eventId: string): Promise<EventData | null> {
  const snap = await getDoc(doc(db(), 'events', eventId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as EventData
}

export async function getEventsByIds(ids: string[]): Promise<EventData[]> {
  if (ids.length === 0) return []
  const snaps = await Promise.all(ids.map(id => getDoc(doc(db(), 'events', id))))
  return snaps
    .filter(s => s.exists())
    .map(s => ({ id: s.id, ...s.data() }) as EventData)
    .filter(e => e.status !== 'deleted')
    .sort((a, b) => (b.date?.seconds ?? 0) - (a.date?.seconds ?? 0))
}

export async function getEventsByOwner(userId: string): Promise<EventData[]> {
  const q    = query(collection(db(), 'events'), where('createdBy', '==', userId))
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as EventData)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
}

// ─── Items ────────────────────────────────────────────────────────────────────

export function subscribeToItems(
  eventId: string,
  callback: (items: ItemData[]) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db(), 'events', eventId, 'items'),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ItemData)),
  )
}

export async function claimItem(
  eventId:  string,
  itemId:   string,
  nickname: string,
): Promise<string> {
  const itemRef  = doc(db(), 'events', eventId, 'items', itemId)
  const claimRef = doc(collection(db(), 'events', eventId, 'items', itemId, 'claims'))
  const claimId  = claimRef.id

  await runTransaction(db(), async tx => {
    const snap = await tx.get(itemRef)
    if (!snap.exists()) throw new Error('item-not-found')
    const item = snap.data()
    if (item.totalClaimed >= item.quantity) throw new Error('item-taken')

    tx.update(itemRef, {
      totalClaimed:       item.totalClaimed + 1,
      claimedByNicknames: arrayUnion(nickname),
    })
    tx.set(claimRef, { nickname, claimedAt: serverTimestamp() })
  })

  return claimId
}

export async function unclaimItem(
  eventId:  string,
  itemId:   string,
  claimId:  string,
  nickname: string,
): Promise<void> {
  const itemRef  = doc(db(), 'events', eventId, 'items', itemId)
  const claimRef = doc(db(), 'events', eventId, 'items', itemId, 'claims', claimId)

  await runTransaction(db(), async tx => {
    const snap = await tx.get(itemRef)
    if (!snap.exists()) return
    tx.update(itemRef, {
      totalClaimed:       increment(-1),
      claimedByNicknames: arrayRemove(nickname),
    })
    tx.delete(claimRef)
  })
}

// ─── Event management ─────────────────────────────────────────────────────────

export async function updateEventStatus(
  eventId: string,
  status:  EventData['status'],
): Promise<void> {
  await updateDoc(doc(db(), 'events', eventId), { status })
}

export async function getItemClaims(
  eventId: string,
  itemId:  string,
): Promise<{ id: string; nickname: string }[]> {
  const snap = await getDocs(collection(db(), 'events', eventId, 'items', itemId, 'claims'))
  return snap.docs.map(d => ({ id: d.id, nickname: d.data().nickname as string }))
}

export async function cloneEvent(sourceId: string, userId: string): Promise<string> {
  const source = await getEvent(sourceId)
  if (!source) throw new Error('event-not-found')

  const itemsSnap = await getDocs(collection(db(), 'events', sourceId, 'items'))
  const items = itemsSnap.docs.map(d => ({
    name:     d.data().name     as string,
    quantity: d.data().quantity as number,
  }))

  return createEvent({
    name:           `${source.name} (עותק)`,
    date:           new Date(source.date.seconds * 1000),
    description:    source.description,
    mode:           source.mode,
    allowUnclaim:   source.allowUnclaim,
    visibilityMode: source.visibilityMode,
    items,
    createdBy:      userId,
  })
}

export async function updateEvent(
  eventId: string,
  fields: { name?: string; date?: Date; description?: string },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (fields.name        !== undefined) update.name        = fields.name
  if (fields.description !== undefined) update.description = fields.description
  if (fields.date        !== undefined) update.date        = Timestamp.fromDate(fields.date)
  if (Object.keys(update).length === 0) return
  await updateDoc(doc(db(), 'events', eventId), update)
}

export async function addItemToEvent(
  eventId:  string,
  name:     string,
  quantity: number,
): Promise<void> {
  await addDoc(collection(db(), 'events', eventId, 'items'), {
    name:               name.trim(),
    quantity,
    addedBy:            null,
    addedByNickname:    null,
    totalClaimed:       0,
    claimedByNicknames: [],
    createdAt:          serverTimestamp(),
  })
}

// ─── Open items ───────────────────────────────────────────────────────────────

// ─── Contact messages ─────────────────────────────────────────────────────────

export interface ContactMessage {
  id:        string
  name:      string
  message:   string
  createdAt: Timestamp
}

export async function addContactMessage(
  eventId: string,
  name:    string,
  message: string,
): Promise<void> {
  await addDoc(collection(db(), 'events', eventId, 'contacts'), {
    name:      name.trim(),
    message:   message.trim(),
    createdAt: serverTimestamp(),
  })
}

export async function getContactMessages(eventId: string): Promise<ContactMessage[]> {
  const snap = await getDocs(collection(db(), 'events', eventId, 'contacts'))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as ContactMessage)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
}

// ─── Open items ───────────────────────────────────────────────────────────────

export async function addOpenItem(
  eventId:  string,
  name:     string,
  nickname: string,
): Promise<{ itemId: string; claimId: string }> {
  const itemRef  = doc(collection(db(), 'events', eventId, 'items'))
  const claimRef = doc(collection(db(), 'events', eventId, 'items', itemRef.id, 'claims'))
  const batch    = writeBatch(db())

  batch.set(itemRef, {
    name:               name.trim(),
    quantity:           1,
    addedBy:            null,
    addedByNickname:    nickname,
    totalClaimed:       1,
    claimedByNicknames: [nickname],
    createdAt:          serverTimestamp(),
  })
  batch.set(claimRef, { nickname, claimedAt: serverTimestamp() })

  await batch.commit()
  return { itemId: itemRef.id, claimId: claimRef.id }
}
