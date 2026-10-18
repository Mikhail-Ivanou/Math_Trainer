'use client';

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { useState } from 'react';
import { auth } from '@/lib/firebase';

/** Russian messages for Firebase error codes (same as app/lib/auth/auth_service.dart). */
export function authMessage(e: unknown): string {
  const code = e instanceof FirebaseError ? e.code.replace('auth/', '') : '';
  switch (code) {
    case 'invalid-email': return 'Неверный формат email';
    case 'user-disabled': return 'Аккаунт заблокирован';
    case 'user-not-found':
    case 'wrong-password':
    case 'invalid-credential':
      return 'Неверный email или пароль. Если вы входили через Google, войдите через Google и задайте пароль в меню аккаунта — или нажмите «Забыли пароль?»';
    case 'email-already-in-use': return 'Аккаунт с таким email уже есть — войдите';
    case 'weak-password': return 'Слишком простой пароль: нужно не меньше 6 символов';
    case 'too-many-requests': return 'Слишком много попыток, попробуйте позже';
    case 'network-request-failed': return 'Нет соединения с интернетом';
    case 'popup-closed-by-user':
    case 'cancelled-popup-request': return '';
    case 'requires-recent-login': return 'Для смены пароля выйдите и войдите заново';
    case 'credential-already-in-use':
    case 'provider-already-linked': return 'Этот способ входа уже привязан к аккаунту';
    default: return e instanceof Error ? e.message : String(e);
  }
}

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await action();
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) return setError('Введите email');
    if (password.length < 6) return setError('Пароль — не меньше 6 символов');
    run(() => (register ? createUserWithEmailAndPassword : signInWithEmailAndPassword)(auth, email.trim(), password));
  };

  return (
    <main className="mx-auto mt-20 max-w-sm px-4">
      <h1 className="text-center text-3xl font-semibold">Math Trainer</h1>
      <p className="mt-2 text-center text-gray-600">{register ? 'Создайте аккаунт' : 'Войдите, чтобы решать примеры'}</p>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
        <input className="input" type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" type="password" placeholder="Пароль" autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-indigo-700">{info}</p>}
        <button className="btn-primary" disabled={busy}>{register ? 'Зарегистрироваться' : 'Войти'}</button>
      </form>
      <div className="mt-3 flex flex-col items-center gap-1 text-sm">
        <button className="link" onClick={() => setRegister(!register)}>{register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}</button>
        {!register && (
          <button
            className="link"
            onClick={() => (email.includes('@')
              ? run(() => sendPasswordResetEmail(auth, email.trim()).then(() => setInfo('Письмо для сброса пароля отправлено')))
              : setError('Введите email, чтобы сбросить пароль'))}
          >
            Забыли пароль?
          </button>
        )}
      </div>
      <div className="my-6 flex items-center gap-3 text-sm text-gray-500"><hr className="flex-1" />или<hr className="flex-1" /></div>
      <button className="btn-outline w-full" disabled={busy} onClick={() => run(() => signInWithPopup(auth, new GoogleAuthProvider()))}>
        Войти через Google
      </button>
    </main>
  );
}
