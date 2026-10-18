'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { RequireUser, useUser } from '@/components/AuthProvider';
import { generate } from '@/lib/backend';
import { formatAnswer } from '@/lib/format';
import { difficultyLabel, levelHints, levelNames, topicSource, typeLabel, type Difficulty, type StoredTask, type Topic } from '@/lib/models';
import { addGeneratedTasks, getTopic, prefs, savePref, sectionSheet, setSolved, watchSolved, watchTasks } from '@/lib/repo';

export default function TopicPage() {
  return (
    <RequireUser>
      <TopicView />
    </RequireUser>
  );
}

/** Same as app/lib/topic_screen.dart, plus «Скачать PDF». */
function TopicView() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const [topic, setTopic] = useState<Topic | null | undefined>(undefined);
  const [tasks, setTasks] = useState<StoredTask[] | null>(null);
  const [solved, setSolvedIds] = useState<Set<string>>(new Set());
  const [hideSolved, setHideSolved] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  const [showRule, setShowRule] = useState(false);
  const [showSection, setShowSection] = useState(false);
  const [picker, setPicker] = useState(false);
  const [level, setLevel] = useState<Difficulty>('medium');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { getTopic(id).then(setTopic, () => setTopic(null)); }, [id]);
  useEffect(() => watchTasks(id, setTasks, (e) => setMessage(`Ошибка загрузки: ${e.message}`)), [id]);
  useEffect(() => watchSolved(user.uid, id, setSolvedIds), [user.uid, id]);
  useEffect(() => { prefs(user.uid).then((p) => setHideSolved(!!p.hideSolved), () => {}); }, [user.uid]);
  useEffect(() => { if (topic) sectionSheet(topic).then(setSheet, () => setSheet('')); }, [topic]);

  const unsolved = useMemo(() => (tasks ?? []).filter((t) => !solved.has(t.id)), [tasks, solved]);
  const shown = hideSolved ? unsolved : tasks ?? [];

  if (topic === undefined) return <p className="p-8 text-gray-500">Загрузка…</p>;
  if (topic === null) return <p className="p-8">Тема не найдена. <Link className="link" href="/">К темам</Link></p>;

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setMessage('');
    try {
      await action();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const doGenerate = () => run('generate', async () => {
    setPicker(false);
    const r = await generate(topic, sheet ?? '', level);
    if (!r.tasks.length) return setMessage('Модель не дала ни одного верного задания, попробуйте ещё раз');
    await addGeneratedTasks(topic.id, r.tasks, user.uid, r.model);
    setMessage(`Добавлено заданий: ${r.tasks.length}${r.rejected.length ? ` (отброшено с ошибками: ${r.rejected.length})` : ''}`);
  });

  const doPdf = () => run('pdf', async () => {
    const { downloadTopicPdf } = await import('@/lib/pdf'); // react-pdf is big: load it only when needed
    await downloadTopicPdf(topic, unsolved);
  });

  const toggleHide = () => {
    setHideSolved(!hideSolved);
    savePref(user.uid, { hideSolved: !hideSolved });
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24">
      <header className="py-5">
        <Link href="/" className="link">← Темы</Link>
        <h1 className="mt-2 text-2xl font-semibold">{topic.title}</h1>
        <p className="text-sm text-gray-600">{topic.bookTitle} · {topicSource(topic)}</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button className="btn-outline" onClick={() => setShowRule(!showRule)}>{showRule ? 'Скрыть правило' : 'Правило'}</button>
        <button className="btn-primary" disabled={!!busy} onClick={() => setPicker(true)}>{busy === 'generate' ? 'Генерирую…' : '✨ Новые задания'}</button>
        <button className="btn-outline" disabled={!!busy || !unsolved.length} onClick={doPdf}>
          {busy === 'pdf' ? 'Готовлю PDF…' : `Скачать PDF (${unsolved.length})`}
        </button>
      </div>
      {message && <p className="mt-3 text-sm text-indigo-800">{message}</p>}

      {showRule && (
        <section className="card mt-4">
          <p className="whitespace-pre-line">{topic.rule}</p>
          {!showSection ? (
            <button className="link mt-3 text-sm" onClick={() => setShowSection(true)}>▾ Весь параграф</button>
          ) : (
            <div className="mt-4 border-t pt-3">
              <h3 className="font-medium">{topicSource(topic)}</h3>
              <p className="mt-2 whitespace-pre-line text-sm">{sheet === null ? 'Загрузка…' : sheet || 'Не удалось загрузить параграф'}</p>
            </div>
          )}
        </section>
      )}

      <div className="mt-6 flex items-center justify-between">
        <span className="font-medium">Решено {(tasks?.length ?? 0) - unsolved.length} из {tasks?.length ?? 0}</span>
        <button className={`chip ${hideSolved ? 'border-indigo-600 bg-indigo-100' : ''}`} onClick={toggleHide}>
          {hideSolved ? '✓ ' : ''}Скрыть решённые
        </button>
      </div>

      {tasks === null ? <p className="mt-4 text-gray-500">Загрузка…</p> : !tasks.length ? (
        <p className="mt-8 text-center text-gray-600">Заданий пока нет. Нажмите «Новые задания», чтобы составить их по теме.</p>
      ) : !shown.length ? (
        <p className="mt-8 text-center text-gray-600">Все задания решены! Нажмите «Новые задания», чтобы получить ещё.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {shown.map((t) => <TaskCard key={t.id} task={t} solved={solved.has(t.id)} onSolved={(v) => setSolved(user.uid, topic.id, t.id, v)} />)}
        </ul>
      )}

      {picker && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Уровень заданий</h2>
            {(['medium', 'hard', 'expert'] as Difficulty[]).map((l) => (
              <label key={l} className="mt-3 flex cursor-pointer gap-3">
                <input type="radio" name="level" checked={level === l} onChange={() => setLevel(l)} className="mt-1" />
                <span><span className="font-medium">{levelNames[l]}</span><br /><span className="text-sm text-gray-600">{levelHints[l]}</span></span>
              </label>
            ))}
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setPicker(false)}>Отмена</button>
              <button className="btn-primary" onClick={doGenerate}>Составить задания</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function TaskCard({ task, solved, onSolved }: { task: StoredTask; solved: boolean; onSolved: (v: boolean) => void }) {
  const [show, setShow] = useState(false);
  return (
    <li className={`card ${solved ? 'bg-indigo-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs text-gray-600">{typeLabel[task.type]} · {difficultyLabel[task.difficulty]}</span>
        <input type="checkbox" className="h-5 w-5" checked={solved} onChange={(e) => onSolved(e.target.checked)} aria-label="Решено" />
      </div>
      <p className="mt-1 text-lg">{task.question}</p>
      <div className="mt-2 flex items-center gap-3">
        <button className="link text-sm" onClick={() => setShow(!show)}>{show ? 'Скрыть ответ' : 'Показать ответ'}</button>
        {show && <span className="font-medium">{formatAnswer(task.answer, task.unit)}</span>}
      </div>
    </li>
  );
}
