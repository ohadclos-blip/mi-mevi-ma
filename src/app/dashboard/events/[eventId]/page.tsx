'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Check, ChevronRight, Copy, Pencil, Plus, Share2, X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import {
  getEvent,
  subscribeToItems,
  updateEventStatus,
  updateEvent,
  addItemToEvent,
  getItemClaims,
  getContactMessages,
  unclaimItem,
  cloneEvent,
  EventData,
  ItemData,
  ContactMessage,
} from '@/lib/firestore/events'

type ClaimEntry = { id: string; nickname: string }

export default function EventManagePage() {
  const { eventId } = useParams<{ eventId: string }>()
  const router      = useRouter()
  const { user }    = useAuth()

  const [event,         setEvent]         = useState<EventData | null>(null)
  const [items,         setItems]         = useState<ItemData[]>([])
  const [claims,        setClaims]        = useState<Record<string, ClaimEntry[]>>({})
  const [loading,       setLoading]       = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [copied,        setCopied]        = useState(false)
  const [confirmAction, setConfirmAction] = useState<string | null>(null)

  const [contacts,      setContacts]      = useState<ContactMessage[]>([])

  const [showEditEvent, setShowEditEvent] = useState(false)
  const [editName,      setEditName]      = useState('')
  const [editDate,      setEditDate]      = useState('')
  const [editDesc,      setEditDesc]      = useState('')

  const [showAddItem,   setShowAddItem]   = useState(false)
  const [newItemName,   setNewItemName]   = useState('')
  const [newItemQty,    setNewItemQty]    = useState(1)

  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/event/${eventId}` : ''

  useEffect(() => {
    if (!eventId) return
    getEvent(eventId).then(data => {
      setEvent(data)
      setLoading(false)
    })
    getContactMessages(eventId).then(setContacts)

    return subscribeToItems(eventId, async updatedItems => {
      setItems(updatedItems)
      const withClaims = updatedItems.filter(i => i.totalClaimed > 0)
      const entries    = await Promise.all(
        withClaims.map(async item => {
          const c = await getItemClaims(eventId, item.id)
          return [item.id, c] as const
        }),
      )
      setClaims(Object.fromEntries(entries))
    })
  }, [eventId])

  const handleStatus = async (status: EventData['status']) => {
    setActionLoading(status)
    try {
      await updateEventStatus(eventId, status)
      setEvent(prev => prev ? { ...prev, status } : null)
    } catch { /* ignore */ }
    finally { setActionLoading(null); setConfirmAction(null) }
  }

  const handleUnclaim = async (itemId: string, claimId: string, nickname: string) => {
    const key = `unclaim-${itemId}-${claimId}`
    setActionLoading(key)
    try {
      await unclaimItem(eventId, itemId, claimId, nickname)
    } catch { /* ignore */ }
    finally { setActionLoading(null) }
  }

  const handleClone = async () => {
    if (!user) return
    setActionLoading('clone')
    try {
      const newId = await cloneEvent(eventId, user.uid)
      router.push(`/dashboard/events/${newId}`)
    } catch { /* ignore */ }
    finally { setActionLoading(null); setConfirmAction(null) }
  }

  const openEditEvent = () => {
    if (!event) return
    setEditName(event.name)
    setEditDate(new Date(event.date.seconds * 1000).toISOString().split('T')[0])
    setEditDesc(event.description ?? '')
    setShowEditEvent(true)
  }

  const handleEditEvent = async () => {
    if (!editName.trim()) return
    setActionLoading('edit')
    try {
      await updateEvent(eventId, {
        name:        editName.trim(),
        date:        new Date(editDate),
        description: editDesc.trim(),
      })
      setEvent(prev => prev ? {
        ...prev,
        name:        editName.trim(),
        description: editDesc.trim(),
        date:        { seconds: new Date(editDate).getTime() / 1000, nanoseconds: 0 } as EventData['date'],
      } : null)
      setShowEditEvent(false)
    } catch { /* ignore */ }
    finally { setActionLoading(null) }
  }

  const handleAddItem = async () => {
    if (!newItemName.trim()) return
    setActionLoading('addItem')
    try {
      await addItemToEvent(eventId, newItemName.trim(), newItemQty)
      setNewItemName('')
      setNewItemQty(1)
      setShowAddItem(false)
    } catch { /* ignore */ }
    finally { setActionLoading(null) }
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleShare = async () => {
    const text = `היי! אני מארגן: ${event?.name}\nכנסו לקישור הזה ורשמו מה אתם מביאים:`
    if (navigator.share) {
      try {
        await navigator.share({ title: event?.name, text, url: shareUrl })
      } catch { /* user cancelled */ }
    } else {
      // Fallback — WhatsApp web
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${shareUrl}`)}`, '_blank')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!event || user?.uid !== event.createdBy) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500">
        <p>אירוע לא נמצא</p>
        <button onClick={() => router.push('/dashboard')} className="text-blue-600 text-sm">
          חזור לדשבורד
        </button>
      </div>
    )
  }

  const sortedItems = items
    .slice()
    .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))

  const totalQuantity = sortedItems.reduce((s, i) => s + i.quantity, 0)
  const totalClaimed  = sortedItems.reduce((s, i) => s + i.totalClaimed, 0)
  const progress      = totalQuantity > 0 ? Math.round((totalClaimed / totalQuantity) * 100) : 0

  const eventDate = new Date(event.date.seconds * 1000).toLocaleDateString('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const isActive  = event.status === 'active'
  const isFrozen  = event.status === 'frozen'
  const isBlocked = event.status === 'blocked'

  return (
    <main className="min-h-screen max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/dashboard')}
          className="p-1 text-gray-500 hover:text-gray-700"
          aria-label="חזור"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{event.name}</h1>
          <p className="text-sm text-gray-500">{eventDate}</p>
        </div>
        <button
          onClick={openEditEvent}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="ערוך אירוע"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <StatusBadge status={event.status} />
      </div>

      {/* Share */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">קישור לשיתוף</p>
        <div className="flex items-center gap-2 mb-3">
          <code className="flex-1 text-xs bg-gray-50 px-3 py-2.5 rounded-lg text-gray-600 overflow-hidden text-ellipsis whitespace-nowrap border border-gray-200">
            {shareUrl}
          </code>
          <button
            onClick={copyLink}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'הועתק!' : 'העתק'}
          </button>
        </div>
        <button
          onClick={handleShare}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
        >
          <Share2 className="w-4 h-4" />
          שתף
        </button>
      </div>

      {/* Progress */}
      {totalQuantity > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-semibold text-gray-700">סטטוס מילוי</span>
            <span className="text-gray-500">{totalClaimed} / {totalQuantity} פריטים</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div
              className="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5 text-left">{progress}%</p>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        {isActive && (
          <>
            <ActionButton
              label="הקפא אירוע"
              sub="בוחרים לא יוכלו לשנות"
              color="blue"
              onClick={() => setConfirmAction('frozen')}
            />
            <ActionButton
              label="חסום אירוע"
              sub="אורחים יראו הודעת חסימה"
              color="red"
              onClick={() => setConfirmAction('blocked')}
            />
          </>
        )}
        {(isFrozen || isBlocked) && (
          <ActionButton
            label="הפעל מחדש"
            sub="חזור למצב פעיל"
            color="green"
            loading={actionLoading === 'active'}
            onClick={() => handleStatus('active')}
          />
        )}
        <ActionButton
          label="שכפל אירוע"
          sub="אירוע חדש עם אותם פריטים"
          color="gray"
          loading={actionLoading === 'clone'}
          onClick={() => setConfirmAction('clone')}
        />
        <ActionButton
          label="מחק אירוע"
          sub="פעולה בלתי הפיכה"
          color="red"
          onClick={() => setConfirmAction('deleted')}
        />
      </div>

      {/* Items */}
      {(sortedItems.length > 0 || event.mode === 'prescribed') && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              פריטים
            </h2>
            {event.mode === 'prescribed' && !isBlocked && (
              <button
                onClick={() => setShowAddItem(v => !v)}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" />
                הוסף פריט
              </button>
            )}
          </div>

          {showAddItem && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">פריט חדש</p>
              <input
                type="text"
                placeholder="שם הפריט"
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                dir="rtl"
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 shrink-0">כמות:</label>
                <input
                  type="number"
                  min={1}
                  value={newItemQty}
                  onChange={e => setNewItemQty(Math.max(1, Number(e.target.value)))}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button
                  onClick={handleAddItem}
                  disabled={!newItemName.trim() || actionLoading === 'addItem'}
                  className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
                >
                  {actionLoading === 'addItem' ? '...' : 'הוסף'}
                </button>
                <button
                  onClick={() => { setShowAddItem(false); setNewItemName(''); setNewItemQty(1) }}
                  className="p-1.5 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {sortedItems.map(item => {
              const itemClaims = claims[item.id] ?? []
              return (
                <div key={item.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-gray-800">{item.name}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      item.totalClaimed >= item.quantity
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {item.totalClaimed}/{item.quantity}
                    </span>
                  </div>

                  {itemClaims.length > 0 ? (
                    <div className="space-y-1.5">
                      {itemClaims.map(claim => (
                        <div key={claim.id} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-sm text-gray-600">
                            <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                            {claim.nickname}
                          </span>
                          {isActive && (
                            <button
                              onClick={() => handleUnclaim(item.id, claim.id, claim.nickname)}
                              disabled={actionLoading === `unclaim-${item.id}-${claim.id}`}
                              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
                            >
                              <X className="w-3.5 h-3.5" /> ביטול
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">טרם נבחר</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Contact messages */}
      {contacts.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            פניות מאורחים ({contacts.length})
          </h2>
          <div className="space-y-2">
            {contacts.map(c => (
              <div key={c.id} className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-orange-800">{c.name}</p>
                  {c.createdAt && (
                    <p className="text-xs text-orange-400">
                      {new Date(c.createdAt.seconds * 1000).toLocaleDateString('he-IL', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
                <p className="text-sm text-orange-700">{c.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Edit event dialog */}
      {showEditEvent && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowEditEvent(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" dir="rtl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">עריכת אירוע</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">שם האירוע</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">תאריך</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">תיאור (אופציונלי)</label>
                <textarea
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowEditEvent(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={handleEditEvent}
                disabled={!editName.trim() || actionLoading === 'edit'}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
              >
                {actionLoading === 'edit' ? '...' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmAction && (
        <ConfirmDialog
          action={confirmAction}
          loading={!!actionLoading}
          onConfirm={() => {
            if (confirmAction === 'clone') handleClone()
            else handleStatus(confirmAction as EventData['status'])
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </main>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: EventData['status'] }) {
  const map: Record<EventData['status'], { label: string; cls: string }> = {
    active:  { label: 'פעיל',   cls: 'bg-green-100 text-green-700' },
    frozen:  { label: 'מוקפא',  cls: 'bg-blue-100 text-blue-700'  },
    blocked: { label: 'חסום',   cls: 'bg-red-100 text-red-700'    },
    deleted: { label: 'נמחק',   cls: 'bg-gray-100 text-gray-500'  },
  }
  const { label, cls } = map[status]
  return (
    <span className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${cls}`}>
      {label}
    </span>
  )
}

function ActionButton({
  label, sub, color, loading, onClick,
}: {
  label: string; sub: string; color: 'blue' | 'red' | 'green' | 'gray'
  loading?: boolean; onClick: () => void
}) {
  const cls = {
    blue:  'bg-blue-50  border-blue-200  text-blue-700',
    red:   'bg-red-50   border-red-200   text-red-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    gray:  'bg-gray-50  border-gray-200  text-gray-700',
  }[color]

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`p-3 border rounded-xl text-right transition-colors disabled:opacity-50 ${cls}`}
    >
      <p className="text-sm font-semibold">{loading ? '...' : label}</p>
      <p className="text-xs opacity-70 mt-0.5">{sub}</p>
    </button>
  )
}

function ConfirmDialog({
  action, loading, onConfirm, onCancel,
}: {
  action: string; loading: boolean; onConfirm: () => void; onCancel: () => void
}) {
  const cfg: Record<string, { title: string; body: string; btn: string; btnCls: string }> = {
    frozen:  { title: 'הקפא אירוע?',  body: 'אורחים לא יוכלו לשנות בחירות. תוכל להפעיל מחדש בכל עת.',     btn: 'הקפא',  btnCls: 'bg-blue-600 hover:bg-blue-700' },
    blocked: { title: 'חסום אירוע?',  body: 'אורחים יראו הודעת חסימה ולא יוכלו לגשת לרשימה.',             btn: 'חסום',  btnCls: 'bg-red-600 hover:bg-red-700'   },
    deleted: { title: 'מחק אירוע?',   body: 'הפעולה בלתי הפיכה. האירוע יוסר מהדשבורד.',                   btn: 'מחק',   btnCls: 'bg-red-600 hover:bg-red-700'   },
    clone:   { title: 'שכפל אירוע?',  body: 'ייווצר אירוע חדש עם אותם פריטים וכמויות, ללא בחירות קיימות.', btn: 'שכפל', btnCls: 'bg-gray-800 hover:bg-gray-900' },
  }
  const { title, body, btn, btnCls } = cfg[action] ?? cfg.clone

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-5">{body}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            ביטול
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${btnCls}`}
          >
            {loading ? '...' : btn}
          </button>
        </div>
      </div>
    </div>
  )
}
