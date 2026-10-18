'use client';

import { onAuthStateChanged, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { SignIn } from './SignIn';

const UserContext = createContext<User | null>(null);

/** The signed-in user; pages under it can assume one exists. */
export const useUser = () => useContext(UserContext)!;

/** Shows the sign-in form until Firebase has a user (same accounts as the app). */
export function RequireUser({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  if (user === undefined) return <p className="p-8 text-center text-gray-500">Загрузка…</p>;
  if (user === null) return <SignIn />;
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
