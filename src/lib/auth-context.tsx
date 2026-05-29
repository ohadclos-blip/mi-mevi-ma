'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { getFirebaseApp, googleProvider } from './firebase'
import { createUserIfNotExists } from './firestore/users'

interface AuthContextType {
  user: User | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // getAuth() is only called here — inside useEffect — so never runs on server
    const auth = getAuth(getFirebaseApp())
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try { await createUserIfNotExists(firebaseUser) } catch {}
      }
      setUser(firebaseUser)
      setLoading(false)
    })
  }, [])

  const signInWithGoogle = async () => {
    const auth = getAuth(getFirebaseApp())
    await signInWithPopup(auth, googleProvider)
  }

  const signOut = async () => {
    const auth = getAuth(getFirebaseApp())
    await firebaseSignOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

const safeDefault: AuthContextType = {
  user:            null,
  loading:         true,
  signInWithGoogle: async () => {},
  signOut:          async () => {},
}

export function useAuth() {
  return useContext(AuthContext) ?? safeDefault
}
