'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, BACKEND } from '@/lib/backend';
import { subjectNames } from '@/lib/models';
import { BookEditor } from './BookEditor';

export interface AdminBook {
  id: string;
  title: string;
  grade: number;
  subject: string;
  authors: string;
  year: number;
  portalId: number;
  file: string;
  sectionCount?: number;
  hasPdf: boolean;
  topicCount: number;
}

interface Job {
  id: string;
  bookId: string;
  status: 'running' | 'done' | 'failed';
  log: string[];
  startedAt: string;
}

interface TopicStat {
  id: string;
  title: string;
  grade: number;
  source: string;
  students: number;
  requests: string[];
  tasks: number;
}

/** Local admin page: books, their processing, sections and rules, and what students struggle with. */
export default function AdminPage() {
  const [books, setBooks] = useState<AdminBook[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [topics, setTopics] = useState<TopicStat[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, j] = await Promise.all([api<{ books: AdminBook[] }>('/api/admin/books'), api<{ jobs: Job[] }>('/api/admin/jobs')]);
      setBooks(b.books);
      setJobs(j.jobs);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Follow running jobs.
  const running = jobs.some((j) => j.status === 'running');
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [running, load]);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const remove = (b: AdminBook) => {
    if (!confirm(`Удалить «${b.title}» со всеми параграфами и правилами?`)) return;
    const topics = b.topicCount > 0 && confirm(`Из правил этой книги ученики добавили ${b.topicCount} тем. Удалить и их (с заданиями)?\nОК — удалить, Отмена — оставить темы.`);
    act(() => api(`/api/admin/books/${b.id}?topics=${topics ? 'delete' : 'keep'}`, { method: 'DELETE' }));
    if (open === b.id) setOpen(null);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <header className="flex items-center justify-between py-5">
        <div>
          <Link href="/" className="link">← Сайт</Link>
          <h1 className="mt-2 text-2xl font-semibold">Админка</h1>
          <p className="text-sm text-gray-600">Работает через локальный сервер {BACKEND}</p>
        </div>
      </header>
      {error && <p className="card text-red-700">{error}</p>}

      <section>
        <h2 className="text-lg font-medium">Учебники</h2>
        <table className="mt-2 w-full overflow-hidden rounded-xl bg-white text-sm ring-1 ring-gray-200">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr><th className="p-2">id</th><th className="p-2">Учебник</th><th className="p-2">Класс</th><th className="p-2">§</th><th className="p-2">Тем</th><th className="p-2" /></tr>
          </thead>
          <tbody>
            {books?.map((b) => (
              <tr key={b.id} className="border-t border-gray-100 align-top">
                <td className="p-2 font-mono">{b.id}</td>
                <td className="p-2">
                  {b.title}
                  <div className="text-xs text-gray-500">
                    {subjectNames[b.subject] ?? b.subject} · {b.authors} · {b.year}{b.portalId ? ` · adu.by ${b.portalId}` : ''}{b.hasPdf ? '' : ' · нет PDF в data/'}
                  </div>
                </td>
                <td className="p-2">{b.grade}</td>
                <td className="p-2">{b.sectionCount ?? 0}</td>
                <td className="p-2">{b.topicCount}</td>
                <td className="p-2 whitespace-nowrap text-right">
                  <button className="link mr-3" onClick={() => setOpen(open === b.id ? null : b.id)}>{open === b.id ? 'Закрыть' : 'Параграфы'}</button>
                  <button className="link mr-3" disabled={busy || running || !b.hasPdf} title="Повторить обработку; LLM-шаги берутся из кэша"
                    onClick={() => act(() => api(`/api/admin/books/${b.id}/process`, { method: 'POST' }))}>Обработать</button>
                  <button className="link mr-3" disabled={busy || running || !b.hasPdf} title="Очистить кэш LLM и обработать с нуля (платно)"
                    onClick={() => confirm('Обработать с нуля? Оглавление, листы и правила будут заново составлены LLM, ручные правки этой книги пропадут.') &&
                      act(() => api(`/api/admin/books/${b.id}/process?fresh=1`, { method: 'POST' }))}>С нуля</button>
                  <button className="btn-danger" disabled={busy} onClick={() => remove(b)}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {open && books?.find((b) => b.id === open) && <BookEditor book={books.find((b) => b.id === open)!} onChanged={load} />}
        <AddBook disabled={busy || running} onAdded={load} />
      </section>

      {jobs.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Обработка</h2>
          {jobs.slice(0, 5).map((j) => (
            <details key={j.id} open={j.status === 'running' || j === jobs[0]} className="card mt-2">
              <summary className="cursor-pointer">
                <span className="font-mono">{j.bookId}</span> — {j.status === 'running' ? '⏳ идёт' : j.status === 'done' ? '✅ готово' : '❌ ошибка'} ·{' '}
                {new Date(j.startedAt).toLocaleString('ru-RU')}
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-gray-700">{j.log.join('\n')}</pre>
            </details>
          ))}
        </section>
      )}

      <section className="mt-10">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium">Что вызывает трудности</h2>
          <button className="link text-sm" onClick={() => api<{ topics: TopicStat[] }>('/api/admin/topics').then((r) => setTopics(r.topics), (e) => alert(e.message))}>
            {topics ? 'обновить' : 'показать'}
          </button>
        </div>
        {topics && (
          <table className="mt-2 w-full rounded-xl bg-white text-sm ring-1 ring-gray-200">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr><th className="p-2">Правило</th><th className="p-2">Класс</th><th className="p-2">Учеников</th><th className="p-2">Заданий</th><th className="p-2">Что писали</th></tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.id} className="border-t border-gray-100 align-top">
                  <td className="p-2">{t.title}<div className="text-xs text-gray-500">{t.source}</div></td>
                  <td className="p-2">{t.grade}</td>
                  <td className="p-2">{t.students}</td>
                  <td className="p-2">{t.tasks}</td>
                  <td className="p-2 text-xs text-gray-700">{t.requests.map((r) => `«${r}»`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function AddBook({ disabled, onAdded }: { disabled: boolean; onAdded: () => void }) {
  const [f, setF] = useState({ id: '', title: '', grade: '8', subject: 'algebra', authors: '', year: String(new Date().getFullYear()), portalId: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
      await api(`/api/admin/books?${q}`, file ? { method: 'POST', body: file, headers: { 'content-type': 'application/pdf' } } : { method: 'POST' });
      setFile(null);
      setF({ ...f, id: '', title: '', authors: '', portalId: '' });
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="card mt-4">
      <summary className="cursor-pointer font-medium">+ Добавить учебник</summary>
      <form onSubmit={submit} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">id (латиница)<input className="input" placeholder="algebra8" value={f.id} onChange={set('id')} required /></label>
        <label className="text-sm">Название<input className="input" placeholder="Алгебра. 8 класс" value={f.title} onChange={set('title')} required /></label>
        <label className="text-sm">Класс<input className="input" type="number" min={5} max={11} value={f.grade} onChange={set('grade')} /></label>
        <label className="text-sm">Предмет
          <select className="input" value={f.subject} onChange={set('subject')}>
            {Object.entries(subjectNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="text-sm">Авторы<input className="input" value={f.authors} onChange={set('authors')} /></label>
        <label className="text-sm">Год<input className="input" type="number" value={f.year} onChange={set('year')} /></label>
        <label className="text-sm">id на e-padruchnik.adu.by<input className="input" placeholder="например 966" value={f.portalId} onChange={set('portalId')} /></label>
        <label className="text-sm">или PDF-файл<input className="input" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <p className="text-xs text-gray-600 sm:col-span-2">
          После добавления книга обрабатывается сразу: оглавление, параграфы, листы и правила (LLM, ключ бэкенда), затем публикуется в каталог класса.
          Новый класс сразу появится на сайте и в приложении.
        </p>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2"><button className="btn-primary" disabled={disabled || busy || (!file && !f.portalId)}>{busy ? 'Загружаю…' : 'Добавить и обработать'}</button></div>
      </form>
    </details>
  );
}
