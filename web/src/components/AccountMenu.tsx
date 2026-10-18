'use client';

import { EmailAuthProvider, linkWithCredential, signOut, updatePassword } from 'firebase/auth';
import { useState } from 'react';
import { auth } from '@/lib/firebase';
import { useUser } from './AuthProvider';
import { authMessage } from './SignIn';

/** Email, «Задать пароль» (keeps Google and password sign-in together) and «Выйти». */
export function AccountMenu() {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(false);
  const hasPassword = user.providerData.some((p) => p.providerId === 'password');
  return (
    <div className="relative">
      <button className="chip" onClick={() => setOpen(!open)}>{user.email ?? 'Аккаунт'} ▾</button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-60 rounded-lg bg-white p-1 shadow-lg ring-1 ring-gray-200">
          <button className="block w-full rounded px-3 py-2 text-left hover:bg-gray-100" onClick={() => { setDialog(true); setOpen(false); }}>
            {hasPassword ? 'Сменить пароль' : 'Задать пароль для входа'}
          </button>
          <a className="block rounded px-3 py-2 hover:bg-gray-100" href="/admin">Админка</a>
          <button className="block w-full rounded px-3 py-2 text-left hover:bg-gray-100" onClick={() => signOut(auth)}>Выйти</button>
        </div>
      )}
      {dialog && <PasswordDialog hasPassword={hasPassword} onClose={() => setDialog(false)} />}
    </div>
  );
}

function PasswordDialog({ hasPassword, onClose }: { hasPassword: boolean; onClose: () => void }) {
  const user = useUser();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function save() {
    if (p1.length < 6) return setError('Не меньше 6 символов');
    if (p1 !== p2) return setError('Пароли не совпадают');
    try {
      // Firebase drops an unverified password when the same gmail signs in with Google; linking it again keeps both.
      await (hasPassword ? updatePassword(user, p1) : linkWithCredential(user, EmailAuthProvider.credential(user.email!, p1)));
      await user.reload();
      setDone(true);
    } catch (e) {
      setError(authMessage(e));
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">{hasPassword ? 'Сменить пароль' : 'Пароль для входа'}</h2>
        {done ? (
          <p className="mt-3">Пароль сохранён: теперь можно входить и через Google, и по паролю.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {!hasPassword && <p className="text-sm text-gray-600">Задайте пароль, чтобы входить и через Google, и по email с паролем.</p>}
            <input className="input" type="password" placeholder="Новый пароль" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
            <input className="input" type="password" placeholder="Повторите пароль" value={p2} onChange={(e) => setP2(e.target.value)} />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-outline" onClick={onClose}>{done ? 'Готово' : 'Отмена'}</button>
          {!done && <button className="btn-primary" onClick={save}>Сохранить</button>}
        </div>
      </div>
    </div>
  );
}
