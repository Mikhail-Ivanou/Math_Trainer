/** Calls to the local server (backend/src/app.ts): LLM for the site, everything for the admin page. */
import { auth } from './firebase';
import type { Difficulty, MathTask, Topic } from './models';

export const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://127.0.0.1:3101';

export async function api<T>(path: string, init: RequestInit = {}, withToken = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body === 'string') headers.set('content-type', 'application/json');
  if (withToken) {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  let r: Response;
  try {
    r = await fetch(`${BACKEND}${path}`, { ...init, headers });
  } catch {
    throw new Error(`Локальный сервер не отвечает (${BACKEND}). Запустите: cd backend && npm run server`);
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `сервер ответил ${r.status}`);
  return body as T;
}

export const matchRules = (grade: number, request: string) =>
  api<{ matches: { id: string; why: string }[] }>('/api/match', { method: 'POST', body: JSON.stringify({ grade, request }) }, true);

export const generate = (t: Topic, context: string, level: Difficulty) =>
  api<{ tasks: MathTask[]; rejected: { reason: string }[]; model: string }>(
    '/api/generate',
    { method: 'POST', body: JSON.stringify({ topicTitle: t.title, rule: t.rule, context, grade: t.grade, subject: t.subject, level }) },
    true,
  );
