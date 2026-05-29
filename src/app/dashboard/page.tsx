'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Plus, X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { getEventsByOwner, getEventsByIds, EventData } from '@/lib/firestore/events'
import { getAttendingEventIds } from '@/lib/firestore/users'
import { getUnreadNotifications, markNotificationRead, NotificationData } from '@/lib/firestore/notifications'

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const router = useRouter()

  const [ownedEvents,    setOwnedEvents]    = useState<EventData[]>([])
  const [attendingEvents, setAttendingEvents] = useState<EventData[]>([])
  const [loading,        setLoading]        = useState(true)
  const [notifications,  setNotifications]  = useState<NotificationData[]>([])

  useEffect(() => {
    if (!user) return
    Promise.all([
      getEventsByOwner(user.uid),
      getAttendingEventIds(user.uid).then(ids => getEventsByIds(ids)),
      getUnreadNotifications(user.uid),
    ]).then(([owned, attending, notifs]) => {
      setOwnedEvents(owned)
      setAttendingEvents(attending.filter(e => e.createdBy !== user.uid))
      setNotifications(notifs)
      setLoading(false)
    })
  }, [user])

  const dismissNotification = async (notif: NotificationData) => {
    await markNotificationRead(user!.uid, notif.id)
    setNotifications(prev => prev.filter(n => n.id !== notif.id))
  }

  const handleSignOut = async () => {
    await signOut()
    router.replace('/')
  }

  return (
    <main className="min-h-screen max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="לוגו" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              שלום, {user?.displayName?.split(' ')[0]}
            </h1>
            <p className="text-xs text-gray-500">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          יציאה
        </button>
      </div>

      {/* Notification banners */}
      {notifications.length > 0 && (
        <div className="space-y-2 mb-6">
          {notifications.map(notif => (
            <div
              key={notif.id}
              className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-800">האירוע הוקפא אוטומטית</p>
                <p className="text-xs text-blue-600 mt-0.5 truncate">
                  &ldquo;{notif.eventName}&rdquo; — התאריך עבר
                </p>
                <Link
                  href={`/dashboard/events/${notif.eventId}`}
                  className="text-xs font-medium text-blue-700 underline mt-1 inline-block"
                  onClick={() => dismissNotification(notif)}
                >
                  צפה באירוע
                </Link>
              </div>
              <button
                onClick={() => dismissNotification(notif)}
                className="text-blue-400 hover:text-blue-600 flex-shrink-0 mt-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/dashboard/events/new"
        className="flex items-center justify-center gap-2 w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl shadow-sm transition-colors mb-8"
      >
        <Plus className="w-5 h-5" />
        אירוע חדש
      </Link>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin h-6 w-6 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Events I manage */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              אירועים שאני מנהל
            </h2>
            {ownedEvents.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <p className="text-3xl mb-2">🎉</p>
                <p className="text-sm">אין עדיין אירועים. צור את הראשון!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {ownedEvents.map(event => (
                  <Link
                    key={event.id}
                    href={`/dashboard/events/${event.id}`}
                    className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl hover:border-blue-300 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{event.name}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {new Date(event.date.seconds * 1000).toLocaleDateString('he-IL', {
                          day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 mr-2">
                      <StatusBadge status={event.status} />
                      <ChevronLeft className="w-4 h-4 text-gray-400" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Events I attend */}
          {attendingEvents.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                אירועים שאני משתתף
              </h2>
              <div className="space-y-2">
                {attendingEvents.map(event => (
                  <Link
                    key={event.id}
                    href={`/event/${event.id}`}
                    className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl hover:border-green-300 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{event.name}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {new Date(event.date.seconds * 1000).toLocaleDateString('he-IL', {
                          day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 mr-2">
                      <StatusBadge status={event.status} />
                      <ChevronLeft className="w-4 h-4 text-gray-400" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  )
}

function StatusBadge({ status }: { status: EventData['status'] }) {
  const map: Record<EventData['status'], { label: string; cls: string }> = {
    active:  { label: 'פעיל',   cls: 'bg-green-100 text-green-700' },
    frozen:  { label: 'מוקפא',  cls: 'bg-blue-100 text-blue-700'  },
    blocked: { label: 'חסום',   cls: 'bg-red-100 text-red-700'    },
    deleted: { label: 'נמחק',   cls: 'bg-gray-100 text-gray-500'  },
  }
  const { label, cls } = map[status]
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  )
}
