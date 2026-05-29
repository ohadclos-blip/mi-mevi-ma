import { onSchedule } from 'firebase-functions/v2/scheduler'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

initializeApp()

export const dailyEventLifecycle = onSchedule(
  { schedule: 'every 24 hours', region: 'us-central1', timeZone: 'Asia/Jerusalem' },
  async () => {
    const db  = getFirestore()
    const now = Timestamp.now()

    const snap = await db
      .collection('events')
      .where('status', '==', 'active')
      .where('date', '<', now)
      .get()

    if (snap.empty) return

    const batch = db.batch()

    for (const eventDoc of snap.docs) {
      batch.update(eventDoc.ref, { status: 'frozen' })

      const { createdBy, name } = eventDoc.data() as { createdBy: string; name: string }
      const notifRef = db
        .collection('notifications')
        .doc(createdBy)
        .collection('items')
        .doc()

      batch.set(notifRef, {
        eventId:   eventDoc.id,
        eventName: name,
        type:      'auto_frozen',
        read:      false,
        createdAt: now,
      })
    }

    await batch.commit()
    console.log(`Auto-frozen ${snap.size} event(s) and wrote notifications`)
  },
)
