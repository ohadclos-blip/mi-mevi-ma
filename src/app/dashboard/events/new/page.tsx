'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Plus, X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { createEvent } from '@/lib/firestore/events'

interface Item {
  name: string
  quantity: number
}

export default function NewEventPage() {
  const { user }  = useAuth()
  const router    = useRouter()

  const [name,           setName]           = useState('')
  const [date,           setDate]           = useState('')
  const [description,    setDescription]    = useState('')
  const [mode,           setMode]           = useState<'prescribed' | 'open'>('prescribed')
  const [allowUnclaim,   setAllowUnclaim]   = useState(true)
  const [visibilityMode, setVisibilityMode] = useState<'open' | 'private'>('open')
  const [items,          setItems]          = useState<Item[]>([{ name: '', quantity: 1 }])
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState('')

  const addItem    = () => setItems(prev => [...prev, { name: '', quantity: 1 }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: keyof Item, value: string | number) =>
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (!name.trim() || !date) {
      setError('יש למלא שם ותאריך')
      return
    }
    if (mode === 'prescribed' && items.some(i => !i.name.trim())) {
      setError('יש למלא שם לכל הפריטים, או להסיר שורות ריקות')
      return
    }

    setLoading(true)
    setError('')
    try {
      const eventId = await createEvent({
        name:           name.trim(),
        date:           new Date(date),
        description:    description.trim(),
        mode,
        allowUnclaim,
        visibilityMode,
        items:          mode === 'prescribed' ? items.filter(i => i.name.trim()) : [],
        createdBy:      user.uid,
      })
      router.push(`/dashboard/events/${eventId}`)
    } catch {
      setError('אירעה שגיאה. נסה שוב.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/dashboard')}
          className="p-1 text-gray-500 hover:text-gray-700"
          aria-label="חזור"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">אירוע חדש</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <Field label="שם האירוע *">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="מסיבת סוף שנה כיתה ה'"
            className={inputClass}
          />
        </Field>

        {/* Date */}
        <Field label="תאריך *">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>

        {/* Description */}
        <Field label="תיאור (אופציונלי)">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="פרטים נוספים על האירוע..."
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </Field>

        {/* Mode */}
        <Field label="סוג רשימה">
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: 'prescribed', label: 'מוגדרת מראש', sub: 'אתה מגדיר מה צריך' },
              { value: 'open',       label: 'פתוחה',        sub: 'האורחים מוסיפים'   },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={`py-3 px-4 rounded-xl border-2 text-sm font-medium text-right transition-colors ${
                  mode === opt.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                {opt.label}
                <p className="font-normal text-xs mt-0.5 opacity-70">{opt.sub}</p>
              </button>
            ))}
          </div>
        </Field>

        {/* Settings */}
        <Field label="הגדרות">
          <label className="flex items-center justify-between py-3 px-4 bg-white border border-gray-200 rounded-xl cursor-pointer mb-2">
            <div>
              <span className="text-sm font-medium text-gray-700">אפשר ביטול בחירה</span>
              <p className="text-xs text-gray-500 mt-0.5">אורחים יוכלו לבטל את הבחירה שלהם</p>
            </div>
            <input
              type="checkbox"
              checked={allowUnclaim}
              onChange={e => setAllowUnclaim(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
          </label>
          <div className="py-3 px-4 bg-white border border-gray-200 rounded-xl">
            <span className="text-sm font-medium text-gray-700 block mb-2">נראות בחירות</span>
            <div className="space-y-2">
              {([
                { value: 'open',    label: 'כולם רואים מי בחר מה'    },
                { value: 'private', label: 'כל אחד רואה רק את שלו' },
              ] as const).map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="visibility"
                    value={opt.value}
                    checked={visibilityMode === opt.value}
                    onChange={() => setVisibilityMode(opt.value)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-600">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </Field>

        {/* Items — prescribed only */}
        {mode === 'prescribed' && (
          <Field label="פריטים">
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={item.name}
                    onChange={e => updateItem(i, 'name', e.target.value)}
                    placeholder="שם הפריט (למשל: בורקס)"
                    className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-gray-500">כמות</span>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={e => updateItem(i, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                      min={1}
                      className="w-14 px-2 py-2.5 border border-gray-300 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                      aria-label="הסר פריט"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addItem}
              className="mt-3 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              הוסף פריט
            </button>
          </Field>
        )}

        {error && (
          <p className="text-red-600 text-sm text-center bg-red-50 py-2 px-4 rounded-xl">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-2xl transition-colors"
        >
          {loading ? 'יוצר אירוע...' : 'צור אירוע'}
        </button>
      </form>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

const inputClass =
  'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400'
