'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { RequireUser, useUser } from '@/components/AuthProvider';
import { matchRules } from '@/lib/backend';
import { type CatalogRule, type Topic } from '@/lib/models';
import { addTopic, catalog, existingTopics, grades, prefs, savePref, similarTopic } from '@/lib/repo';

export default function AddPage() {
  return (
    <RequireUser>
      <AddTopic />
    </RequireUser>
  );
}

/** «Новая тема» (same flow as app/lib/topics/add_topic_screen.dart). */
function AddTopic() {
  const user = useUser();
  const router = useRouter();
  const [grade, setGrade] = useState<number | null>(null);
  const [gradeList, setGradeList] = useState<number[]>([5, 6, 7]);
  const [rules, setRules] = useState<CatalogRule[]>([]);
  const [existing, setExisting] = useState<Map<string, Topic>>(new Map());
  const [request, setRequest] = useState('');
  const [matches, setMatches] = useState<{ rule: CatalogRule; why: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [similar, setSimilar] = useState<{ rule: CatalogRule; topic: Topic } | null>(null);

  useEffect(() => {
    prefs(user.uid).then((p) => setGrade(p.grade ?? 5), () => setGrade(5));
    grades().then((g) => g.length && setGradeList(g), () => {});
  }, [user.uid]);
  useEffect(() => {
    if (grade === null) return;
    setMatches(null);
    Promise.all([catalog(grade), existingTopics()]).then(([c, e]) => { setRules(c); setExisting(e); }, (e) => setError(e.message));
  }, [grade]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!request.trim() || grade === null) return;
    setBusy(true);
    setError('');
    try {
      const byId = new Map(rules.map((r) => [r.id, r]));
      const { matches } = await matchRules(grade, request.trim());
      setMatches(matches.filter((m) => byId.has(m.id)).map((m) => ({ rule: byId.get(m.id)!, why: m.why })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function add(r: CatalogRule, force = false) {
    const s = !force && !existing.has(r.id) && grade !== null ? similarTopic(r, grade, existing) : undefined;
    if (s) return setSimilar({ rule: r, topic: s });
    setBusy(true);
    try {
      const t = await addTopic(r, user.uid, request);
      if (grade !== null) await savePref(user.uid, { grade });
      router.push(`/topic/${t.id}`);
    } catch (e) {
      setError(`Не удалось добавить тему: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  const byBook = useMemo(() => {
    const m = new Map<string, Map<string, CatalogRule[]>>();
    for (const r of rules) {
      const sec = `§ ${r.sectionNumber}. ${r.sectionTitle}`;
      if (!m.has(r.bookTitle)) m.set(r.bookTitle, new Map());
      const b = m.get(r.bookTitle)!;
      if (!b.has(sec)) b.set(sec, []);
      b.get(sec)!.push(r);
    }
    return m;
  }, [rules]);

  const badge = (r: CatalogRule) =>
    existing.has(r.id) ? <span className="chip shrink-0">уже в списке</span>
      : grade !== null && similarTopic(r, grade, existing) ? <span className="chip shrink-0">похожая есть</span>
        : <span className="shrink-0 text-xl text-indigo-700">+</span>;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24">
      <header className="py-5">
        <Link href="/" className="link">← Темы</Link>
        <h1 className="mt-2 text-2xl font-semibold">Новая тема</h1>
      </header>
      <div className="flex gap-2">
        {gradeList.map((g) => (
          <button key={g} className={`chip ${g === grade ? 'border-indigo-600 bg-indigo-100' : ''}`} onClick={() => setGrade(g)}>{g} класс</button>
        ))}
      </div>
      <form onSubmit={search} className="mt-4 flex gap-2">
        <input className="input" maxLength={500} placeholder="Что даётся трудно? Например: не понимаю, как складывать дроби"
          value={request} onChange={(e) => setRequest(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={busy || !request.trim()}>{busy ? 'Ищу…' : 'Найти'}</button>
      </form>
      {error && <p className="mt-3 text-red-600">{error}</p>}
      {matches && (
        <section className="mt-6">
          <h2 className="font-medium">{matches.length ? 'Нашлось в учебниках:' : `В учебниках ${grade} класса такого правила не нашлось. Сформулируйте иначе или выберите ниже.`}</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {matches.map(({ rule: r, why }) => (
              <li key={r.id}>
                <button className="card flex w-full items-center justify-between gap-3 text-left hover:ring-indigo-400" disabled={busy} onClick={() => add(r)}>
                  <div>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-sm text-gray-600">§ {r.sectionNumber}. {r.sectionTitle} · {r.bookTitle}</div>
                    {why && <div className="text-sm text-gray-500">{why}</div>}
                  </div>
                  {badge(r)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="mt-8">
        <h2 className="font-medium">Или выберите правило из учебника</h2>
        {[...byBook].map(([book, sections]) => (
          <details key={book} className="mt-2 rounded-xl bg-white ring-1 ring-gray-200">
            <summary className="cursor-pointer px-4 py-3 font-medium">{book}</summary>
            {[...sections].map(([sec, rs]) => (
              <details key={sec} className="border-t border-gray-100 pl-4">
                <summary className="cursor-pointer py-2 pr-4 text-sm">{sec}</summary>
                <ul className="pb-2 pl-3">
                  {rs.map((r) => (
                    <li key={r.id}>
                      <button className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left hover:bg-indigo-50" disabled={busy} onClick={() => add(r)}>
                        <span>{r.title}</span>
                        {badge(r)}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </details>
        ))}
      </section>
      {similar && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Похожая тема уже есть</h2>
            <p className="mt-3">
              «{similar.topic.title}» уже добавлена из § {similar.topic.sectionNumber}. {similar.topic.sectionTitle}.
              Выбранное правило — из § {similar.rule.sectionNumber}. {similar.rule.sectionTitle}. Это может быть то же самое.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-outline" onClick={() => { const r = similar.rule; setSimilar(null); add(r, true); }}>Добавить эту</button>
              <button className="btn-primary" onClick={() => router.push(`/topic/${similar.topic.id}`)}>Открыть существующую</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
