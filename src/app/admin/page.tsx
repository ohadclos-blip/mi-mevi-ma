'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import {
  isAdmin,
  getAllEvents,
  getAllUsers,
  adminSetUserDeleted,
  adminSetEventStatus,
  AdminUserData,
} from '@/lib/firestore/admin'

type EventRow = {
  id: string; name: string; status: string
  date: { seconds: number }; createdBy: string
  createdAt: { seconds: number }; mode: string
}

type Tab = 'events' | 'users'

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active:  { label: 'פעיל',   cls: 'bg-green-100 text-green-700' },
  frozen:  { label: 'מוקפא',  cls: 'bg-blue-100 text-blue-700'  },
  blocked: { label: 'חסום',   cls: 'bg-red-100 text-red-700'    },
  deleted: { label: 'נמחק',   cls: 'bg-gray-100 text-gray-500'  },
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [adminChecked, setAdminChecked] = useState(false)
  const [hasAccess,    setHasAccess]    = useState(false)
  const [tab,          setTab]          = useState<Tab>('events')
  const [events,       setEvents]       = useState<EventRow[]>([])
  const [users,        setUsers]        = useState<AdminUserData[]>([])
  const [dataLoading,  setDataLoading]  = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [actionKey,    setActionKey]    = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/'); return }
    isAdmin(user.uid).then(ok => {
      setHasAccess(ok)
      setAdminChecked(true)
      if (ok) {
        Promise.all([getAllEvents(), getAllUsers()]).then(([evts, usrs]) => {
          setEvents(evts)
          setUsers(usrs)
          setDataLoading(false)
        })
      }
    })
  }, [user, authLoading, router])

  const handleEventStatus = async (eventId: string, status: string) => {
    setActionKey(`event-${eventId}`)
    try {
      await adminSetEventStatus(eventId, status)
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, status } : e))
    } finally { setActionKey(null) }
  }

  const handleToggleUser = async (uid: string, isDeleted: boolean) => {
    setActionKey(`user-${uid}`)
    try {
      await adminSetUserDeleted(uid, !isDeleted)
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, isDeleted: !isDeleted } : u))
    } finally { setActionKey(null) }
  }

  if (!adminChecked || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-gray-500">
        <p className="text-4xl">🔒</p>
        <p className="font-semibold">אין גישה</p>
        <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600">
          חזור לדשבורד
        </button>
      </div>
    )
  }

  const filteredEvents = statusFilter === 'all'
    ? events
    : events.filter(e => e.status === statusFilter)

  const activeUsers  = users.filter(u => !u.isDeleted).length
  const totalEvents  = events.length
  const activeEvents = events.filter(e => e.status === 'active').length

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 py-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{user?.email}</p>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          חזור
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'סה"כ אירועים', value: totalEvents },
          { label: 'אירועים פעילים', value: activeEvents },
          { label: 'משתמשים פעילים', value: activeUsers },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit">
        {(['events', 'users'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'events' ? `אירועים (${events.length})` : `משתמשים (${users.length})`}
          </button>
        ))}
      </div>

      {dataLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-6 w-6 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : tab === 'events' ? (
        <section>
          {/* Status filter */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {['all', 'active', 'frozen', 'blocked', 'deleted'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  statusFilter === s
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
              >
                {s === 'all' ? 'הכל' : STATUS_LABELS[s]?.label ?? s}
                {s !== 'all' && ` (${events.filter(e => e.status === s).length})`}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredEvents.map(event => {
              const { label, cls } = STATUS_LABELS[event.status] ?? { label: event.status, cls: 'bg-gray-100 text-gray-500' }
              const isLoading = actionKey === `event-${event.id}`
              return (
                <div key={event.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900 truncate">{event.name}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cls}`}>
                          {label}
                        </span>
                        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                          {event.mode === 'prescribed' ? 'רשימה' : 'פתוח'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(event.date.seconds * 1000).toLocaleDateString('he-IL', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                        {' · '}
                        נוצר {new Date(event.createdAt.seconds * 1000).toLocaleDateString('he-IL')}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      {event.status !== 'active' && event.status !== 'deleted' && (
                        <button
                          onClick={() => handleEventStatus(event.id, 'active')}
                          disabled={!!isLoading}
                          className="text-xs px-2.5 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-40"
                        >
                          {isLoading ? '...' : 'הפעל'}
                        </button>
                      )}
                      {event.status !== 'deleted' && (
                        <button
                          onClick={() => handleEventStatus(event.id, 'deleted')}
                          disabled={!!isLoading}
                          className="text-xs px-2.5 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-40"
                        >
                          {isLoading ? '...' : 'מחק'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {filteredEvents.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">אין אירועים</p>
            )}
          </div>
        </section>
      ) : (
        <section>
          <div className="space-y-2">
            {users.map(user => {
              const isLoading = actionKey === `user-${user.uid}`
              return (
                <div
                  key={user.uid}
                  className={`bg-white border rounded-2xl p-4 ${user.isDeleted ? 'opacity-50 border-gray-100' : 'border-gray-200'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">
                        {user.displayName ?? '—'}
                        {user.isDeleted && (
                          <span className="mr-2 text-xs text-gray-400 font-normal">(מחוק)</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{user.email}</p>
                    </div>
                    <button
                      onClick={() => handleToggleUser(user.uid, user.isDeleted)}
                      disabled={!!isLoading}
                      className={`flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
                        user.isDeleted
                          ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                          : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                      }`}
                    >
                      {isLoading ? '...' : user.isDeleted ? 'שחזר' : 'מחק'}
                    </button>
                  </div>
                </div>
              )
            })}
            {users.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">אין משתמשים</p>
            )}
          </div>
        </section>
      )}
    </main>
  )
}
