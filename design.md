# Design: מי מביא מה (BringIt)
## מסמך תכנון טכני — גרסה 1.0

---

## 1. סקירת ארכיטקטורה

```
┌──────────────────────────────────────────────────────┐
│                    Client (Browser)                  │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  Guest View │  │  My Board    │  │Admin Panel  │ │
│  │ /event/:id  │  │  /dashboard  │  │   /admin    │ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                │                  │        │
│         └────────────────┴──────────────────┘        │
│                          │                           │
│              ┌───────────┴────────────┐              │
│              │    Next.js App Router  │              │
│              │  (React Server + RSC)  │              │
│              └───────────┬────────────┘              │
└──────────────────────────┼───────────────────────────┘
                           │
          ┌────────────────┼──────────────────┐
          │                │                  │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌───────▼──────┐
   │  Firestore  │  │Firebase Auth│  │  API Routes  │
   │  (Realtime) │  │ (Google OAuth)  │  (Next.js)   │
   └─────────────┘  └─────────────┘  └───────┬──────┘
                                             │
                                     ┌───────▼──────┐
                                     │  Resend API  │
                                     │  (אימייל)   │
                                     └──────────────┘
                                     
   ┌─────────────────────────────────────────────────┐
   │         Firebase Cloud Functions (Scheduled)    │
   │  · בדיקת אירועים שפג תוקפם → שליחת התראה     │
   │  · הקפאה אוטומטית אחרי 7 ימים ללא פעולה       │
   └─────────────────────────────────────────────────┘
```

### עקרונות מרכזיים
- **Serverless-first:** אין שרת מסורתי. כל לוגיקה עסקית רצה ב-Cloud Functions, Next.js API Routes, ו-Firestore Security Rules.
- **Real-time by default:** כל מסך אורח מאזין ל-Firestore listener — אין polling, אין refresh ידני.
- **LocalStorage כ-identity layer אנונימי:** אין session לאורחים — זהותם חיה רק בדפדפן.

---

## 2. טכנולוגיות ובחירות

| שכבה | טכנולוגיה | נימוק |
|------|-----------|-------|
| Framework | **Next.js 15 (App Router)** | SSR לטעינה מהירה, API Routes לצד שרת, Vercel deployment קל |
| Styling | **Tailwind CSS** | Mobile-first מהיר, אין CSS files לנהל |
| State | **Firestore onSnapshot + useState** | הנתונים מגיעים real-time, אין צורך ב-state manager חיצוני |
| Database | **Firebase Firestore** | Real-time listeners מובנים, Security Rules כ-authorization layer |
| Auth | **Firebase Auth (Google Provider)** | OAuth מוכן, UID קבוע, אינטגרציה עם Firestore Rules |
| Email | **Resend** | API פשוט, חינמי עד 3,000 מיילים/חודש |
| Cron | **Firebase Cloud Functions (v2 scheduled)** | בדיקת lifecycle יומית ללא תשתית נוספת |
| Hosting | **Vercel** | פריסה אוטומטית מ-Git, Edge Network, preview URLs |
| Icons | **Lucide React** | קל, tree-shakeable |

---

## 3. מבנה הפרויקט

```
bringit/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout + Firebase init
│   ├── page.tsx                  # Landing page
│   ├── event/
│   │   └── [eventId]/
│   │       └── page.tsx          # Guest event view
│   ├── dashboard/
│   │   ├── layout.tsx            # Auth guard — redirect if not logged in
│   │   ├── page.tsx              # My Board
│   │   └── events/
│   │       ├── new/
│   │       │   └── page.tsx      # Create event form
│   │       └── [eventId]/
│   │           └── page.tsx      # Organizer event management
│   └── admin/
│       ├── layout.tsx            # Admin guard — UID check
│       └── page.tsx              # Admin dashboard
│
├── api/                          # Next.js API Routes (server-side)
│   ├── contact-organizer/
│   │   └── route.ts              # שליחת מייל מאורח למארגן
│   └── admin/
│       └── actions/
│           └── route.ts          # פעולות אדמין עם audit log
│
├── components/
│   ├── event/
│   │   ├── EventHeader.tsx
│   │   ├── ItemList.tsx
│   │   ├── ItemRow.tsx           # prescribed mode
│   │   ├── OpenItemEntry.tsx     # open mode — הוספת פריט
│   │   ├── ClaimButton.tsx
│   │   ├── BlockedEventScreen.tsx
│   │   └── FrozenEventScreen.tsx
│   ├── dashboard/
│   │   ├── MyEventsSection.tsx
│   │   ├── AttendingSection.tsx
│   │   └── EventCard.tsx
│   ├── forms/
│   │   ├── CreateEventForm.tsx
│   │   ├── NicknamePrompt.tsx
│   │   └── ContactOrganizerForm.tsx
│   └── admin/
│       ├── EventsTable.tsx
│       ├── UsersTable.tsx
│       └── ItemsStats.tsx
│
├── lib/
│   ├── firebase.ts               # Firebase app init (client)
│   ├── firebase-admin.ts         # Firebase Admin SDK (server)
│   ├── firestore/
│   │   ├── events.ts             # CRUD + listeners לאירועים
│   │   ├── items.ts              # CRUD + claim transactions
│   │   └── users.ts             # user operations
│   ├── localStorage.ts           # abstraction לכל גישת LocalStorage
│   ├── email.ts                  # Resend wrapper
│   └── admin-guard.ts            # בדיקת UID אדמין
│
├── functions/                    # Firebase Cloud Functions
│   └── src/
│       ├── lifecycle.ts          # scheduled: בדיקת אירועים שפג תוקפם
│       └── index.ts
│
├── firestore.rules               # Firestore Security Rules
└── .env.local
    # NEXT_PUBLIC_FIREBASE_*
    # ADMIN_UID=<google uid של האדמין>
    # RESEND_API_KEY=
```

---

## 4. מסד הנתונים — Firestore Schema מפורט

### אוסף: `events`

```
events/{eventId}
  name:               string       // "מסיבת סוף שנה כיתה ה'"
  date:               Timestamp    // תאריך האירוע
  description:        string       // תיאור קצר, אופציונלי
  mode:               "prescribed" | "open"
  status:             "active" | "frozen" | "blocked" | "deleted"
  allowUnclaim:       boolean      // האם אורחים יכולים לבטל בחירה
  visibilityMode:     "open" | "private"
  clonedFromEventId:  string | null
  createdBy:          string       // Firebase Auth UID
  createdAt:          Timestamp
  lifecycleNotifiedAt: Timestamp | null  // מתי נשלחה התראת סיום
  autoFreezeAt:       Timestamp | null   // מועד הקפאה אוטומטית (date + 7 ימים)
```

### תת-אוסף: `events/{eventId}/items`

```
items/{itemId}
  name:           string       // "עוגת שוקולד"
  quantity:       number       // כמות כוללת (prescribed: מוגדר ע"י מארגן, open: 1)
  addedBy:        string | null  // UID של מי שהוסיף (null = מארגן ב-prescribed)
  addedByNickname: string | null // כינוי של אורח שהוסיף ב-open list
  createdAt:      Timestamp
  totalClaimed:   number       // denormalized — סכום כל הבחירות, לחישוב מהיר
```

### תת-אוסף: `events/{eventId}/items/{itemId}/claims`

```
claims/{claimId}
  userId:     string | null  // UID אם רשום, null אם אנונימי
  nickname:   string         // שם תצוגה תמיד
  amount:     number         // כמה יחידות מהפריט הזה
  claimedAt:  Timestamp
  sessionKey: string         // מפתח LocalStorage — לזיהוי אנונימי חוזר
```

### אוסף: `users`

```
users/{userId}
  displayName:    string
  email:          string
  phoneWhatsApp:  string | null  // אופציונלי — לכפתור "פנה בוואטסאפ"
  createdAt:      Timestamp
  isDeleted:      boolean        // soft delete ע"י אדמין
  eventsOwned:    string[]       // [eventId, ...] — denormalized לטעינה מהירה
  eventsAttending: {             // map — eventId → פרטי השתתפות
    [eventId]: {
      itemIds:  string[]
      amounts:  { [itemId]: number }
      joinedAt: Timestamp
    }
  }
```

### אוסף: `audit_log`

```
audit_log/{logId}
  adminUserId:  string
  action:       "freeze_event" | "block_event" | "delete_event" | "delete_user" | "unclaim_item"
  targetType:   "event" | "user" | "item"
  targetId:     string
  details:      object   // context חופשי (שם אירוע, מייל משתמש וכו')
  timestamp:    Timestamp
```

### אוסף: `notifications` (פנימי — למארגנים)

```
notifications/{notifId}
  userId:     string       // המארגן שמקבל
  eventId:    string
  type:       "event_expired"
  message:    string
  isRead:     boolean
  createdAt:  Timestamp
```

---

## 5. אימות והרשאות

### שלושה סוגי זהות

```
┌─────────────────────────────────────────────────────────┐
│ אנונימי                                                 │
│  · אין Firebase Auth session                            │
│  · מזוהה ע"י sessionKey (UUID שנוצר ב-LocalStorage)    │
│  · יכול: לצפות, לבחור פריט, להוסיף פריט (open list)   │
│  · לא יכול: ליצור אירוע, לראות My Board               │
├─────────────────────────────────────────────────────────┤
│ רשום (Firebase Auth)                                    │
│  · יש Firebase Auth UID                                 │
│  · יכול: הכל שאנונימי יכול + יצירת אירוע + My Board   │
│  · מארגן: שולט על הגדרות האירועים שלו                 │
├─────────────────────────────────────────────────────────┤
│ אדמין                                                   │
│  · Firebase Auth UID === process.env.ADMIN_UID          │
│  · גישה ל-/admin בלבד (server-side check)              │
│  · יכול: לקרוא הכל, לשנות status, למחוק משתמשים       │
└─────────────────────────────────────────────────────────┘
```

### זרימת Google OAuth

```
משתמש לוחץ "התחבר עם Google"
    → Firebase signInWithPopup (GoogleAuthProvider)
    → Firebase מחזיר UserCredential עם UID
    → בדיקה: האם users/{UID} קיים?
        כן → טעינת פרופיל קיים
        לא → יצירת document חדש ב-users/{UID}
             + הפעלת מיזוג LocalStorage
    → הפניה ל-/dashboard
```

### מיזוג LocalStorage לענן (Data Migration)

```typescript
// lib/localStorage.ts
async function mergeLocalStorageToCloud(userId: string) {
  const local = getLocalEvents() // { [eventId]: { nickname, claimedItems } }
  
  for (const [eventId, data] of Object.entries(local)) {
    const event = await getEvent(eventId)
    if (!event || event.status === 'deleted') continue
    
    // עדכון claims — החלפת sessionKey בـ userId
    for (const itemId of data.claimedItems) {
      await migrateClaimToUser(eventId, itemId, userId, data.nickname)
    }
    
    // עדכון users/{userId}.eventsAttending
    await addEventToUserProfile(userId, eventId, data)
  }
  
  clearLocalEvents() // ניקוי LocalStorage לאחר מיזוג מוצלח
}
```

---

## 6. סנכרון בזמן אמת ונעילה אופטימיסטית

### Real-time Listener לדף אירוע

```typescript
// lib/firestore/items.ts
export function subscribeToEventItems(
  eventId: string,
  onUpdate: (items: Item[]) => void
) {
  const q = collection(db, 'events', eventId, 'items')
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    onUpdate(items)
  })
}
// הפונקציה מחזירה unsubscribe — קוראים לה ב-useEffect cleanup
```

### Optimistic Locking לבחירת פריט

בחירת פריט מתבצעת תמיד בתוך **Firestore Transaction** שמבטיחה atomicity:

```typescript
async function claimItem(eventId: string, itemId: string, claim: ClaimData) {
  await runTransaction(db, async (tx) => {
    const itemRef = doc(db, 'events', eventId, 'items', itemId)
    const itemSnap = await tx.get(itemRef)
    const item = itemSnap.data()

    // בדיקת זמינות בתוך הטרנזקציה
    if (item.totalClaimed >= item.quantity) {
      throw new Error('ITEM_ALREADY_TAKEN')
    }

    // כתיבת ה-claim
    const claimRef = doc(collection(db, 'events', eventId, 'items', itemId, 'claims'))
    tx.set(claimRef, { ...claim, claimedAt: serverTimestamp() })

    // עדכון totalClaimed (denormalized counter)
    tx.update(itemRef, { totalClaimed: increment(claim.amount) })
  })
}
// אם שני משתמשים קוראים לפונקציה בו-זמנית — רק אחד יצליח
// השני יקבל Error('ITEM_ALREADY_TAKEN') → UI מציג "פריט נתפס, בחר אחר"
```

---

## 7. LocalStorage — מבנה ומפתחות

```typescript
// lib/localStorage.ts

const KEYS = {
  NICKNAME: 'bringit_nickname',
  SESSION:  'bringit_session_key',   // UUID קבוע לזיהוי אנונימי
  EVENTS:   'bringit_events',
}

// מבנה הנתונים השמורים:
interface LocalData {
  nickname: string          // "דני"
  sessionKey: string        // "a1b2c3d4-..." — נוצר פעם אחת, לא משתנה
  events: {
    [eventId: string]: {
      nickname:     string      // הכינוי שנרשם לאירוע הספציפי
      claimedItems: string[]    // [itemId, ...]
      joinedAt:     string      // ISO timestamp
    }
  }
}
```

**הערת Safari / ITP:** Safari מוחק LocalStorage לאחר 7 ימים אם הגישה לאתר הייתה רק דרך cross-site navigation (כמו קישור מוואטסאפ). פתרון: ביקור ישיר ב-bringit.app מאפס את ה-timer. זו מגבלה ידועה שאינה מחייבת פתרון ב-V1 — רוב האירועים קצרים מ-7 ימים.

---

## 8. API Routes (Server-Side)

### `POST /api/contact-organizer`

שליחת מייל מאורח למארגן של אירוע חסום. מבוצע בשרת כדי לא לחשוף את כתובת המארגן ללקוח.

```typescript
// Input
{ eventId: string, senderName: string, message: string }

// לוגיקה:
// 1. שליפת אירוע מ-Firestore (Admin SDK) לאימות שהוא אכן חסום
// 2. שליפת אימייל המארגן מ-users/{createdBy}
// 3. שליחה דרך Resend API
// 4. החזרת { success: true }

// Rate limiting: מקסימום 3 פניות לאירוע בשעה (לפי IP)
```

### `POST /api/admin/actions`

פעולות אדמין עם כתיבת audit log אטומית.

```typescript
// Input
{ action: AdminAction, targetId: string, details?: object }

// לוגיקה:
// 1. אימות שה-UID של הקורא === process.env.ADMIN_UID (Firebase Admin SDK)
// 2. ביצוע הפעולה (שינוי status, soft-delete וכו')
// 3. כתיבת רשומת audit_log ב-Firestore
// 4. החזרת { success: true }
```

---

## 9. ארכיטקטורת ממשק המשתמש

### עקרונות

- **Mobile-first:** breakpoints `sm:` ומעלה בלבד — עיצוב הבסיס הוא 375px
- **RTL:** כל הממשק בעברית + `dir="rtl"` על ה-`<html>`
- **Touch targets:** כל כפתור בגובה מינימלי 48px
- **אין modals מרובי שלבים לאורח:** כל פעולת אורח מסתיימת תוך לחיצה אחת

### עץ רכיבים מרכזי

```
app/event/[eventId]/page.tsx
  └── EventPage (Server Component — שליפת initial data)
        ├── EventHeader (שם, תאריך, סטטוס)
        ├── NicknamePrompt (אם אין שם ב-LocalStorage)
        │     └── מוצג כ-bottom sheet, לא modal מלא
        └── ItemList (Client Component — מאזין ל-onSnapshot)
              ├── [prescribed mode]
              │     └── ItemRow × N
              │           ├── שם פריט + כמות
              │           ├── ClaimButton (אם פנוי)
              │           └── ClaimedBadge (אם תפוס)
              └── [open mode]
                    ├── OpenItemEntry (הוספת פריט חדש)
                    └── ItemRow × N (פריטים קיימים)
```

---

## 10. מפת מסכים

### מסך 1: דף אירוע — אורח (`/event/:id`)

```
┌─────────────────────────────┐
│  מסיבת סוף שנה כיתה ה'     │
│  יום שישי, 30.5 | פעיל      │
│                             │
│  ┌─────────────────────┐    │
│  │  מה שמך?            │    │ ← מוצג רק בפעם הראשונה
│  │  [_______________]  │    │
│  │     [ המשך ]        │    │
│  └─────────────────────┘    │
│                             │
│  בורקס (2 מגשים)            │
│  ✓ דני ● [בחר גם אני]      │
│                             │
│  קולה (4 בקבוקים)           │
│  [   בחר   ]               │ ← כפתור גדול, touch-friendly
│                             │
│  עוגה (1)                  │
│  ✓ מירה ● תפוס             │
│                             │
│  ─────────────────────      │
│  [ שתף לוואטסאפ ]          │
└─────────────────────────────┘
```

### מסך 2: אירוע חסום

```
┌─────────────────────────────┐
│                             │
│         🔒                  │
│   האירוע הזה נחסם           │
│   על ידי המארגן             │
│                             │
│  ┌─────────────────────┐    │
│  │  שלח שאלה למארגן   │    │
│  └─────────────────────┘    │
│                             │
│  ← חזור                    │
└─────────────────────────────┘

--- לאחר לחיצה על "שלח שאלה" ---

┌─────────────────────────────┐
│  פניה למארגן האירוע         │
│                             │
│  שמך: [_______________]     │
│                             │
│  הודעה:                     │
│  [                     ]    │
│  [  (עד 300 תווים)     ]    │
│                             │
│       [ שלח ]               │
└─────────────────────────────┘
```

### מסך 3: My Board (`/dashboard`)

```
┌─────────────────────────────┐
│  שלום, דני 👋               │
│  [ + אירוע חדש ]            │
│                             │
│  אירועים שאני מנהל          │
│  ────────────────           │
│  מסיבת סוף שנה              │
│  30.5 | 8/12 פריטים נלקחו  │
│  [ נהל ] [ שתף ]            │
│                             │
│  אירועים שאני משתתף         │
│  ────────────────           │
│  פיקניק שכונתי              │
│  15.6 | מביא: עוגה ×1      │
└─────────────────────────────┘
```

### מסך 4: יצירת אירוע (`/dashboard/events/new`)

```
┌─────────────────────────────┐
│  אירוע חדש                  │
│                             │
│  שם האירוע *                │
│  [___________________________]│
│                             │
│  תאריך *                    │
│  [  DD/MM/YYYY  ]           │
│                             │
│  תיאור (אופציונלי)          │
│  [___________________________]│
│                             │
│  סוג רשימה                  │
│  ◉ מוגדרת מראש              │
│  ○ פתוחה (אורחים מוסיפים)   │
│                             │
│  הגדרות                     │
│  □ אפשר ביטול בחירה         │
│  ◉ כולם רואים מי בחר מה     │
│  ○ כל אחד רואה רק את שלו   │
│                             │
│  פריטים (prescribed בלבד)   │
│  [+ הוסף פריט]              │
│  · בורקס    כמות: [2]  [x]  │
│  · קולה     כמות: [4]  [x]  │
│                             │
│       [ צור אירוע ]         │
└─────────────────────────────┘
```

### מסך 5: ניהול אירוע (`/dashboard/events/:id`)

```
┌─────────────────────────────┐
│  מסיבת סוף שנה ← חזור      │
│  30.5 | פעיל                │
│                             │
│  [ שתף לוואטסאפ ]  [ שכפל ]│
│                             │
│  סטטוס: [ הקפא ] [ חסום ] [ מחק ]│
│                             │
│  8 מתוך 12 פריטים נלקחו    │
│  ████████░░ 67%             │
│                             │
│  פריטים                     │
│  ─────────                  │
│  בורקס (2/2) ✓ דני, מירה   │
│  קולה (2/4) ● דוד           │
│  עוגה (0/1) [ בטל נעילה ]  │ ← אדמין האירוע יכול תמיד
│                             │
│  התראות                     │
│  🔔 האירוע עבר — בחר פעולה │
└─────────────────────────────┘
```

### מסך 6: Admin Dashboard (`/admin`)

```
┌─────────────────────────────────────────────────────┐
│  BringIt Admin                              [ יציאה ]│
│                                                     │
│  [ אירועים ] [ משתמשים ] [ פריטים ] [ Audit Log ]  │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  אירועים (247)          [ חפש ] [ סנן: הכל ▼ ]    │
│  ──────────────────────────────────────────────     │
│  שם          | תאריך | סטטוס  | מארגן  | פעולות   │
│  מסיבת סוף.. | 30.5  | active | dani@  | [⚙]      │
│  פיקניק ..   | 15.6  | frozen | miri@  | [⚙]      │
│                                                     │
│  משתמשים (89)                                       │
│  ──────────────────────────────────────────────     │
│  שם    | אימייל  | נרשם    | אירועים | פעולות      │
│  דני   | dani@.. | 1.3.26  | 5       | [מחק]       │
└─────────────────────────────────────────────────────┘
```

---

## 11. Firestore Security Rules — עקרונות

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // פונקציות עזר
    function isSignedIn() {
      return request.auth != null;
    }
    function isOwner(eventData) {
      return isSignedIn() && request.auth.uid == eventData.createdBy;
    }
    function isAdmin() {
      // ADMIN_UID מוגדר כ-custom claim ב-Firebase Auth
      return isSignedIn() && request.auth.token.admin == true;
    }
    function eventIsAccessible(eventData) {
      return eventData.status in ['active', 'frozen'];
    }

    // אירועים
    match /events/{eventId} {
      // קריאה: כל אחד יכול לראות active/frozen. blocked/deleted — רק מארגן ואדמין
      allow read: if resource.data.status in ['active', 'frozen']
                  || isOwner(resource.data)
                  || isAdmin();

      // יצירה: רק משתמשים מחוברים
      allow create: if isSignedIn()
                    && request.resource.data.createdBy == request.auth.uid;

      // עדכון: רק המארגן או אדמין
      allow update: if isOwner(resource.data) || isAdmin();

      // מחיקה: אסורה ישירות — רק דרך שינוי status ל-deleted
      allow delete: if false;
    }

    // פריטים
    match /events/{eventId}/items/{itemId} {
      // קריאה: לפי הרשאת האירוע האב
      allow read: if get(/databases/$(database)/documents/events/$(eventId))
                    .data.status in ['active', 'frozen'];

      // יצירה: active בלבד; prescribed — מארגן בלבד; open — כל אחד
      allow create: if eventIsAccessible(
                        get(/databases/$(database)/documents/events/$(eventId)).data
                      );

      // עדכון: מארגן תמיד; אחרים — רק לעדכון totalClaimed (דרך transaction)
      allow update: if isOwner(
                        get(/databases/$(database)/documents/events/$(eventId)).data
                      ) || isAdmin();
    }

    // Claims — כתיבה חופשית לכל אחד (הטרנזקציה בקוד מגנה על הלוגיקה)
    match /events/{eventId}/items/{itemId}/claims/{claimId} {
      allow read: if true;
      allow create: if eventIsAccessible(
                        get(/databases/$(database)/documents/events/$(eventId)).data
                      );
      allow delete: if isSignedIn() || isAdmin(); // ביטול בחירה
    }

    // משתמשים — כל משתמש רואה ועורך רק את שלו; אדמין רואה הכל
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId || isAdmin();
    }

    // Audit log — כתיבה רק דרך Admin SDK (server-side)
    match /audit_log/{logId} {
      allow read: if isAdmin();
      allow write: if false; // רק Admin SDK
    }

    // התראות — כל משתמש רואה את שלו
    match /notifications/{notifId} {
      allow read: if resource.data.userId == request.auth.uid;
      allow update: if resource.data.userId == request.auth.uid; // סימון כנקרא
      allow write:  if false; // רק Cloud Functions
    }
  }
}
```

---

## 12. State Machine — מחזור חיי אירוע

```
                    ┌─────────┐
           יצירה   │         │
         ──────────►  active  │
                    │         │
                    └────┬────┘
                         │  תאריך עבר → התראה למארגן
                         ▼
                    ┌─────────┐
                    │ pending │  (active + lifecycleNotifiedAt != null)
                    │ action  │
                    └────┬────┘
          ┌──────────────┼──────────────┐
          │              │              │
     הקפא │         חסום │        מחק  │
          ▼              ▼              ▼
     ┌────────┐     ┌─────────┐   ┌─────────┐
     │ frozen │     │ blocked │   │ deleted │
     │(קריאה  │     │(חסום +  │   │(404)    │
     │ בלבד)  │     │ פניה)   │   │         │
     └────┬───┘     └─────────┘   └─────────┘
          │
          │  שכפול
          ▼
     ┌─────────┐
     │  active │  (אירוע חדש)
     └─────────┘

  7 ימים ללא פעולה אחרי התראה → מעבר אוטומטי ל-frozen
```

**מימוש:** לא בודקים status בכל בקשה — Cloud Function רצה כל יום בחצות ומעדכן.

---

## 13. Firebase Cloud Functions — Lifecycle Automation

```typescript
// functions/src/lifecycle.ts
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

export const dailyEventLifecycle = onSchedule('every 24 hours', async () => {
  const db = getFirestore()
  const now = Timestamp.now()
  const sevenDaysAgo = Timestamp.fromMillis(now.toMillis() - 7 * 24 * 60 * 60 * 1000)

  // 1. אירועים שתאריכם עבר ועדיין active → שלח התראה
  const expiredQuery = db.collection('events')
    .where('status', '==', 'active')
    .where('date', '<', now)
    .where('lifecycleNotifiedAt', '==', null)

  const expiredSnap = await expiredQuery.get()
  for (const doc of expiredSnap.docs) {
    await doc.ref.update({ lifecycleNotifiedAt: now })
    await db.collection('notifications').add({
      userId:    doc.data().createdBy,
      eventId:   doc.id,
      type:      'event_expired',
      message:   `האירוע "${doc.data().name}" הסתיים. בחר: הקפא / חסום / מחק`,
      isRead:    false,
      createdAt: now,
    })
  }

  // 2. אירועים שהתראה נשלחה לפני 7+ ימים ועדיין active → הקפאה אוטומטית
  const autoFreezeQuery = db.collection('events')
    .where('status', '==', 'active')
    .where('lifecycleNotifiedAt', '<', sevenDaysAgo)

  const autoFreezeSnap = await autoFreezeQuery.get()
  for (const doc of autoFreezeSnap.docs) {
    await doc.ref.update({ status: 'frozen', frozenAt: now })
  }
})
```

---

## 14. מנגנון האדמין

### הגדרת אדמין
ה-UID של האדמין מוגדר בשתי דרכים מקבילות:
1. **`process.env.ADMIN_UID`** — ב-Next.js API Routes לאימות server-side
2. **Firebase Custom Claim `admin: true`** — להגנה ב-Security Rules

הגדרת ה-custom claim מתבצעת פעם אחת דרך Firebase Admin SDK:
```typescript
// סקריפט חד-פעמי — לא חלק מהאפליקציה
await admin.auth().setCustomUserClaims(ADMIN_UID, { admin: true })
```

### guard ב-Next.js layout

```typescript
// app/admin/layout.tsx
import { getServerSession } from 'next-auth'

export default async function AdminLayout({ children }) {
  const session = await getServerSession()
  if (!session || session.user.uid !== process.env.ADMIN_UID) {
    redirect('/') // שקט — לא חושפים שהנתיב קיים
  }
  return <>{children}</>
}
```

### Audit Log — כל פעולת כתיבה

כל POST ל-`/api/admin/actions` כותב ל-`audit_log` לפני ביצוע הפעולה. אם הפעולה נכשלת — הlog לא נכתב (transaction).

---

## 15. תשתית וסביבות

### משתני סביבה

```bash
# .env.local
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Server-side only
FIREBASE_ADMIN_PRIVATE_KEY=
FIREBASE_ADMIN_CLIENT_EMAIL=
ADMIN_UID=                     # Google UID של האדמין
RESEND_API_KEY=
```

### סביבות פריסה

| סביבה | Branch | URL |
|-------|--------|-----|
| Production | `main` | `bringit.app` |
| Preview | כל PR | `*.vercel.app` (אוטומטי) |
| Development | local | `localhost:3000` |

---

*גרסה 1.0 — נוצר ב-2026-05-27*
