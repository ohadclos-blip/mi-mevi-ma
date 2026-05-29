'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Check, Plus, X } from 'lucide-react'
import { getAuth, signInWithPopup } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp, googleProvider } from '@/lib/firebase'
import {
  getEvent,
  EventData,
  ItemData,
  subscribeToItems,
  claimItem,
  unclaimItem,
  addOpenItem,
  addContactMessage,
} from '@/lib/firestore/events'
import {
  getNickname,
  setNickname as saveNickname,
  getClaimedItems,
  addClaimedItem,
  removeClaimedItem,
  getAllEventIdsWithClaims,
} from '@/lib/localStorage'
import { createUserIfNotExists, migrateLocalStorageToCloud } from '@/lib/firestore/users'

export default function EventPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const router      = useRouter()

  const [event,              setEvent]              = useState<EventData | null>(null)
  const [items,              setItems]              = useState<ItemData[]>([])
  const [loading,            setLoading]            = useState(true)
  const [nickname,           setNickname]           = useState<string | null>(null)
  const [showPrompt,         setShowPrompt]         = useState(false)
  const [nicknameInput,      setNicknameInput]      = useState('')
  const [claimedItems,       setClaimedItems]       = useState<Record<string, string>>({})
  const [claimingId,         setClaimingId]         = useState<string | null>(null)
  const [claimError,         setClaimError]         = useState<string | null>(null)
  const [newItemName,        setNewItemName]        = useState('')
  const [addingItem,         setAddingItem]         = useState(false)
  const [showUpgradePrompt,  setShowUpgradePrompt]  = useState(false)
  const [upgradeLoading,     setUpgradeLoading]     = useState(false)

  useEffect(() => {
    if (!eventId) return
    const saved = getNickname(eventId)
    setNickname(saved)
    if (!saved) setShowPrompt(true)
    setClaimedItems(getClaimedItems(eventId))

    getEvent(eventId).then(data => {
      setEvent(data)
      setLoading(false)
    })

    return subscribeToItems(eventId, setItems)
  }, [eventId])

  const openNicknamePrompt = () => {
    setNicknameInput(nickname ?? '')
    setShowPrompt(true)
  }

  const submitNickname = () => {
    const n = nicknameInput.trim()
    if (!n) return
    saveNickname(eventId, n)
    setNickname(n)
    setShowPrompt(false)
  }

  const handleClaim = async (itemId: string) => {
    if (!nickname) { openNicknamePrompt(); return }
    if (claimingId) return
    setClaimingId(itemId)
    setClaimError(null)
    try {
      const claimId = await claimItem(eventId, itemId, nickname)
      addClaimedItem(eventId, itemId, claimId)
      setClaimedItems(getClaimedItems(eventId))
      // Show upgrade prompt once per session after first claim
      if (!sessionStorage.getItem('mmm_upgrade_shown')) {
        sessionStorage.setItem('mmm_upgrade_shown', '1')
        setTimeout(() => setShowUpgradePrompt(true), 800)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      setClaimError(msg === 'item-taken' ? 'הפריט כבר נתפס, בחר אחר' : 'שגיאה, נסה שוב')
      setTimeout(() => setClaimError(null), 3000)
    } finally {
      setClaimingId(null)
    }
  }

  const handleUnclaim = async (itemId: string) => {
    if (!nickname || claimingId) return
    const claimId = claimedItems[itemId]
    if (!claimId) return
    setClaimingId(itemId)
    try {
      await unclaimItem(eventId, itemId, claimId, nickname)
      removeClaimedItem(eventId, itemId)
      setClaimedItems(getClaimedItems(eventId))
    } catch { /* ignore */ }
    finally { setClaimingId(null) }
  }

  const handleAddOpenItem = async () => {
    const name = newItemName.trim()
    if (!name) return
    if (!nickname) { openNicknamePrompt(); return }
    setAddingItem(true)
    try {
      const { itemId, claimId } = await addOpenItem(eventId, name, nickname)
      addClaimedItem(eventId, itemId, claimId)
      setClaimedItems(getClaimedItems(eventId))
      setNewItemName('')
    } catch { /* ignore */ }
    finally { setAddingItem(false) }
  }

  const handleUpgrade = async () => {
    setUpgradeLoading(true)
    try {
      const auth   = getAuth(getFirebaseApp())
      const result = await signInWithPopup(auth, googleProvider)
      await createUserIfNotExists(result.user)
      await migrateLocalStorageToCloud(result.user.uid, getAllEventIdsWithClaims())
      router.push('/dashboard')
    } catch { /* user cancelled popup */ }
    finally { setUpgradeLoading(false) }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!event || event.status === 'deleted') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-5xl">🔍</p>
        <h1 className="text-xl font-bold text-gray-800">האירוע לא נמצא</h1>
        <p className="text-sm text-gray-500">
          יתכן שהאירוע נמחק או שהקישור שגוי.
        </p>
      </div>
    )
  }

  if (event.status === 'blocked') {
    return <BlockedScreen event={event} eventId={eventId} />
  }

  const isFrozen  = event.status === 'frozen'
  const eventDate = new Date(event.date.seconds * 1000).toLocaleDateString('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const sortedItems = items
    .slice()
    .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))

  return (
    <main className="min-h-screen max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <img src="/logo.png" alt="מי מביא מה" className="w-10 h-10 object-contain mb-3" />
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-bold text-gray-900">{event.name}</h1>
          {isFrozen && (
            <span className="flex-shrink-0 text-xs font-medium px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full mt-1">
              הסתיים
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-1">{eventDate}</p>
        {event.description && (
          <p className="text-sm text-gray-600 mt-2">{event.description}</p>
        )}
      </div>

      {/* Nickname banner */}
      {!isFrozen && (
        <button
          onClick={openNicknamePrompt}
          className="w-full flex items-center justify-between bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-5 text-right"
        >
          <div>
            <p className="text-xs text-blue-600 font-medium">אתה מגיע כ:</p>
            <p className="text-sm font-semibold text-blue-800">
              {nickname ?? 'לחץ להוסיף שם ✏️'}
            </p>
          </div>
          {nickname && <span className="text-blue-400 text-xs">עריכה</span>}
        </button>
      )}

      {/* Error */}
      {claimError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4 text-center">
          {claimError}
        </div>
      )}

      {/* Items */}
      {event.mode === 'prescribed' ? (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            מה צריך לאירוע
          </h2>
          <div className="space-y-2">
            {sortedItems.map(item => (
              <PrescribedItem
                key={item.id}
                item={item}
                isClaimed={!!claimedItems[item.id]}
                isFrozen={isFrozen}
                visibilityMode={event.visibilityMode}
                allowUnclaim={event.allowUnclaim}
                isLoading={claimingId === item.id}
                onClaim={() => handleClaim(item.id)}
                onUnclaim={() => handleUnclaim(item.id)}
              />
            ))}
          </div>
        </section>
      ) : (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            מי מביא מה
          </h2>

          {!isFrozen && (
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddOpenItem()}
                placeholder="מה אתה מביא?"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
              />
              <button
                onClick={handleAddOpenItem}
                disabled={addingItem || !newItemName.trim()}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}

          <div className="space-y-2">
            {sortedItems.map(item => (
              <OpenItem
                key={item.id}
                item={item}
                isClaimed={!!claimedItems[item.id]}
                isFrozen={isFrozen}
                visibilityMode={event.visibilityMode}
                allowUnclaim={event.allowUnclaim}
                isLoading={claimingId === item.id}
                onClaim={() => handleClaim(item.id)}
                onUnclaim={() => handleUnclaim(item.id)}
              />
            ))}
            {sortedItems.length === 0 && !isFrozen && (
              <p className="text-center text-gray-400 text-sm py-8">
                עדיין אין פריטים. הוסף את הראשון!
              </p>
            )}
          </div>
        </section>
      )}

      {/* Upgrade bottom sheet */}
      {showUpgradePrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowUpgradePrompt(false)} />
          <div className="relative bg-white rounded-t-3xl w-full max-w-lg p-6 pb-10">
            <button
              onClick={() => setShowUpgradePrompt(false)}
              className="absolute top-4 left-4 text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center mb-5">
              <p className="text-3xl mb-3">🗂️</p>
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                רוצה לשמור את הבחירות שלך?
              </h3>
              <p className="text-sm text-gray-500">
                התחבר עם Google כדי לראות את כל האירועים שהשתתפת בהם במקום אחד.
              </p>
            </div>
            <button
              onClick={handleUpgrade}
              disabled={upgradeLoading}
              className="w-full flex items-center justify-center gap-3 py-3.5 bg-white border border-gray-300 rounded-2xl shadow-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 mb-3"
            >
              <GoogleIcon />
              {upgradeLoading ? 'מתחבר...' : 'התחבר עם Google'}
            </button>
            <button
              onClick={() => setShowUpgradePrompt(false)}
              className="w-full py-2.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              אולי אחר כך
            </button>
          </div>
        </div>
      )}

      {/* Nickname bottom sheet */}
      {showPrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => nickname && setShowPrompt(false)}
          />
          <div className="relative bg-white rounded-t-3xl w-full max-w-lg p-6 pb-10">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-gray-900">מה שמך?</h3>
              {nickname && (
                <button onClick={() => setShowPrompt(false)} className="text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            <p className="text-sm text-gray-500 mb-4">
              השם יוצג למארגן ולמשתתפים
            </p>
            <input
              type="text"
              value={nicknameInput}
              onChange={e => setNicknameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitNickname()}
              placeholder="שם פרטי / כינוי"
              autoFocus
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm mb-4"
            />
            <button
              onClick={submitNickname}
              disabled={!nicknameInput.trim()}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-xl transition-colors"
            >
              המשך
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

function BlockedScreen({ event, eventId }: { event: EventData; eventId: string }) {
  const [name,        setName]        = useState('')
  const [message,     setMessage]     = useState('')
  const [sending,     setSending]     = useState(false)
  const [sent,        setSent]        = useState(false)
  const [contactError, setContactError] = useState(false)

  const handleSend = async () => {
    if (!name.trim() || !message.trim()) return
    setSending(true)
    setContactError(false)
    try {
      await addContactMessage(eventId, name, message)
      // Fire-and-forget email via Cloud Function
      const fn = httpsCallable(getFunctions(getFirebaseApp()), 'sendContactEmail')
      fn({ eventId, name, message }).catch(() => {})
      setSent(true)
    } catch {
      setContactError(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-12 flex flex-col items-center">
      <p className="text-4xl mb-4">🚫</p>
      <h1 className="text-xl font-bold text-gray-800 mb-1">{event.name}</h1>
      <p className="text-sm text-gray-500 mb-8 text-center">
        האירוע הזה חסום כרגע על ידי המארגן.
      </p>

      {sent ? (
        <div className="w-full bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <p className="text-2xl mb-2">✅</p>
          <p className="font-semibold text-green-800">ההודעה נשלחה!</p>
          <p className="text-sm text-green-600 mt-1">המארגן יראה את פנייתך בהקדם.</p>
        </div>
      ) : (
        <div className="w-full bg-white border border-gray-200 rounded-2xl p-5" dir="rtl">
          <p className="font-semibold text-gray-800 mb-1">שלח הודעה למארגן</p>
          <p className="text-xs text-gray-400 mb-4">המארגן יראה את ההודעה בדף הניהול.</p>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="שמך"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <div>
              <textarea
                placeholder="מה תרצה לשאול?"
                value={message}
                onChange={e => setMessage(e.target.value.slice(0, 300))}
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <p className="text-xs text-gray-400 text-left mt-0.5">{message.length}/300</p>
            </div>
            {contactError && (
              <p className="text-xs text-red-500">שגיאה בשליחה, נסה שוב.</p>
            )}
            <button
              onClick={handleSend}
              disabled={!name.trim() || !message.trim() || sending}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-40"
            >
              {sending ? 'שולח...' : 'שלח הודעה'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

// ─── Item components ──────────────────────────────────────────────────────────

interface ItemProps {
  item:           ItemData
  isClaimed:      boolean
  isFrozen:       boolean
  visibilityMode: 'open' | 'private'
  allowUnclaim:   boolean
  isLoading:      boolean
  onClaim:        () => void
  onUnclaim:      () => void
}

function PrescribedItem({
  item, isClaimed, isFrozen, visibilityMode, allowUnclaim, isLoading, onClaim, onUnclaim,
}: ItemProps) {
  const remaining = item.quantity - item.totalClaimed
  const isFull    = remaining <= 0

  return (
    <div className={`flex items-center justify-between p-4 bg-white border rounded-2xl transition-colors ${
      isClaimed ? 'border-blue-300 bg-blue-50' :
      isFull    ? 'border-gray-200 bg-gray-50 opacity-60' :
                  'border-gray-200'
    }`}>
      <div className="min-w-0 flex-1">
        <p className={`font-medium truncate ${isFull && !isClaimed ? 'text-gray-400' : 'text-gray-800'}`}>
          {item.name}
        </p>
        {item.quantity > 1 && (
          <p className="text-xs text-gray-500 mt-0.5">
            נדרש: {item.quantity} · נלקח: {item.totalClaimed}
          </p>
        )}
        {visibilityMode === 'open' && item.claimedByNicknames?.length > 0 && (
          <p className="text-xs text-gray-400 mt-0.5">
            {item.claimedByNicknames.join(', ')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 mr-3">
        {isClaimed ? (
          <>
            <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 px-2.5 py-1 rounded-full">
              <Check className="w-3 h-3" /> בחרתי
            </span>
            {!isFrozen && allowUnclaim && (
              <button
                onClick={onUnclaim}
                disabled={isLoading}
                className="text-gray-300 hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </>
        ) : isFull ? (
          <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
            תפוס
          </span>
        ) : !isFrozen ? (
          <button
            onClick={onClaim}
            disabled={isLoading}
            className="text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            {isLoading ? '...' : 'בחר'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function OpenItem({
  item, isClaimed, isFrozen, visibilityMode, allowUnclaim, isLoading, onClaim, onUnclaim,
}: ItemProps) {
  return (
    <div className={`flex items-center justify-between p-4 bg-white border rounded-2xl transition-colors ${
      isClaimed ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
    }`}>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-800 truncate">{item.name}</p>
        {visibilityMode === 'open' && (
          <p className="text-xs text-gray-400 mt-0.5">
            {[
              item.addedByNickname && `הוסף על ידי ${item.addedByNickname}`,
              item.claimedByNicknames?.filter(n => n !== item.addedByNickname).join(', '),
            ].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 mr-3">
        {isClaimed ? (
          <>
            <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 px-2.5 py-1 rounded-full">
              <Check className="w-3 h-3" /> אני מביא
            </span>
            {!isFrozen && allowUnclaim && (
              <button
                onClick={onUnclaim}
                disabled={isLoading}
                className="text-gray-300 hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </>
        ) : !isFrozen ? (
          <button
            onClick={onClaim}
            disabled={isLoading}
            className="text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            {isLoading ? '...' : 'גם אני מביא'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
