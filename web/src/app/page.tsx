'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AccountMenu } from '@/components/AccountMenu';
import { RequireUser } from '@/components/AuthProvider';
import { subjectNames, topicSource, type Topic } from '@/lib/models';
import { watchTopics } from '@/lib/repo';

export default function HomePage() {
  return (
    <RequireUser>
      <Home />
    </RequireUser>
  );
}

/** Topics students added, grouped by grade (same as app/lib/home_screen.dart). */
function Home() {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => watchTopics(setTopics, (e) => setError(e.message)), []);

  const grades = [...new Set((topics ?? []).map((t) => t.grade))];
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24">
      <header className="flex items-center justify-between py-5">
        <h1 className="text-2xl font-semibold">Math Trainer</h1>
        <AccountMenu />
      </header>
      <Link href="/add" className="btn-primary inline-block">+ Добавить тему</Link>
      {error && <p className="mt-6 text-red-600">Не удалось загрузить темы: {error}</p>}
      {topics === null && !error && <p className="mt-6 text-gray-500">Загрузка…</p>}
      {topics?.length === 0 && (
        <p className="mt-10 text-center text-gray-600">
          Тем пока нет. Нажмите «Добавить тему» и напишите, что даётся трудно — найдём это в учебнике и составим задания.
        </p>
      )}
      {grades.map((g) => (
        <section key={g} className="mt-8">
          <h2 className="mb-2 text-lg font-medium">{g} класс</h2>
          <ul className="divide-y divide-gray-200 rounded-xl bg-white ring-1 ring-gray-200">
            {topics!.filter((t) => t.grade === g).map((t) => (
              <li key={t.id}>
                <Link href={`/topic/${t.id}`} className="block px-4 py-3 hover:bg-indigo-50">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-sm text-gray-600">{subjectNames[t.subject] ?? t.subject} · {topicSource(t)}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
