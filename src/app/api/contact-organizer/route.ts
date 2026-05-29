import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { adminDb } from '@/lib/firebase-admin'

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    const { eventId, name, message } = await req.json()

    if (!eventId || !name?.trim() || !message?.trim()) {
      return NextResponse.json({ error: 'missing fields' }, { status: 400 })
    }

    const db = adminDb()

    const [eventSnap, ] = await Promise.all([
      db.collection('events').doc(eventId).get(),
    ])

    if (!eventSnap.exists) {
      return NextResponse.json({ error: 'event not found' }, { status: 404 })
    }

    const event = eventSnap.data()!
    const userSnap = await db.collection('users').doc(event.createdBy).get()

    if (!userSnap.exists || !userSnap.data()?.email) {
      return NextResponse.json({ error: 'organizer not found' }, { status: 404 })
    }

    const organizerEmail = userSnap.data()!.email as string

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
            <p style="margin:0 0 8px 0;font-size:16px;font-weight:600;">פנייה חדשה לאירוע:</p>
            <p style="margin:0 0 24px 0;font-size:18px;font-weight:700;color:#3b82f6;">${event.name}</p>

            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:12px 16px;background:white;border:1px solid #e5e7eb;border-radius:8px 8px 0 0;font-size:13px;color:#6b7280;font-weight:600;">שם הפונה</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;background:white;border:1px solid #e5e7eb;border-top:none;font-size:15px;">${name}</td>
              </tr>
            </table>

            <table style="width:100%;border-collapse:collapse;margin-top:12px;">
              <tr>
                <td style="padding:12px 16px;background:white;border:1px solid #e5e7eb;border-radius:8px 8px 0 0;font-size:13px;color:#6b7280;font-weight:600;">הודעה</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;background:white;border:1px solid #e5e7eb;border-top:none;font-size:15px;line-height:1.6;">${message}</td>
              </tr>
            </table>

            <p style="margin:24px 0 0 0;font-size:12px;color:#9ca3af;text-align:center;">
              נשלח דרך מי מביא מה · <a href="https://mi-mevi-ma-b9310.web.app/dashboard/events/${eventId}" style="color:#3b82f6;">עבור לניהול האירוע</a>
            </p>
          </div>
        </div>
      `,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[contact-organizer]', err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
