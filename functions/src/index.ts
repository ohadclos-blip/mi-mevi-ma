import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { Resend } from 'resend'

initializeApp()

const resendApiKey = defineSecret('RESEND_API_KEY')

// ─── Auto-freeze past events + write notifications ────────────────────────────

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

// ─── Send contact email to organizer ─────────────────────────────────────────

export const sendContactEmail = onCall(
  { region: 'us-central1', secrets: [resendApiKey] },
  async (request) => {
    const { eventId, name, message } = request.data as {
      eventId: string; name: string; message: string
    }

    if (!eventId || !name?.trim() || !message?.trim()) {
      throw new HttpsError('invalid-argument', 'missing fields')
    }

    const db = getFirestore()

    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) throw new HttpsError('not-found', 'event not found')

    const event = eventSnap.data()!
    const userSnap = await db.collection('users').doc(event.createdBy).get()
    if (!userSnap.exists || !userSnap.data()?.email) {
      throw new HttpsError('not-found', 'organizer not found')
    }

    const organizerEmail = userSnap.data()!.email as string

    const resend = new Resend(resendApiKey.value())
    await resend.emails.send({
      from:    'מי מביא מה <onboarding@resend.dev>',
      to:      organizerEmail,
      subject: `[מי מביא מה] פנייה בנוגע לאירוע: ${event.name}`,
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#1f2937;">
          <div style="background:#3b82f6;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h1 style="color:white;margin:0;font-size:20px;">מי מביא מה</h1>
          </div>
          <div style="background:#f9fafb;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
            <p style="margin:0 0 8px;font-size:16px;font-weight:600;">פנייה חדשה לאירוע:</p>
            <p style="margin:0 0 24px;font-size:18px;font-weight:700;color:#3b82f6;">${event.name}</p>
            <p style="margin:0 0 4px;font-size:13px;color:#6b7280;font-weight:600;">שם הפונה</p>
            <p style="margin:0 0 16px;font-size:15px;">${name}</p>
            <p style="margin:0 0 4px;font-size:13px;color:#6b7280;font-weight:600;">הודעה</p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;background:white;padding:12px;border:1px solid #e5e7eb;border-radius:8px;">${message}</p>
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              <a href="https://mi-mevi-ma-b9310.web.app/dashboard/events/${eventId}" style="color:#3b82f6;">עבור לניהול האירוע</a>
            </p>
          </div>
        </div>
      `,
    })

    return { ok: true }
  },
)
