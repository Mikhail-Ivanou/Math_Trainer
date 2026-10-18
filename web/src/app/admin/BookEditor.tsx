'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/backend';
import type { AdminBook } from './page';

interface AdminRule {
  id: string;
  order: number;
  title: string;
  rule: string;
  keywords: string[];
  isTopic: boolean;
}

interface AdminSection {
  id: string;
  chapter: number;
  chapterTitle: string;
  number: number;
  title: string;
  rule: string;
  rules: AdminRule[];
  canResplit: boolean;
}

/** Paragraphs and rules of one book: edit, delete, add, split again with the LLM. */
export function BookEditor({ book, onChanged }: { book: AdminBook; onChanged: () => void }) {
  const [sections, setSections] = useState<AdminSection[] | null>(null);
  const [error, setError] = useState('');
  const base = `/api/admin/books/${book.id}/sections`;

  const load = useCallback(() => {
    api<{ sections: AdminSection[] }>(base).then((r) => setSections(r.sections), (e) => setError(e.message));
  }, [base]);
  useEffect(() => { load(); }, [load]);

  const call = async (path: string, init: RequestInit) => {
    await api(path, init);
    load();
    onChanged();
  };

  if (error) return <p className="card mt-3 text-red-700">{error}</p>;
  if (!sections) return <p className="mt-3 text-gray-500">Загрузка параграфов…</p>;
  return (
    <div className="mt-3 rounded-xl bg-indigo-50/50 p-3 ring-1 ring-indigo-200">
      <h3 className="font-medium">{book.title}: {sections.length} §, {sections.reduce((n, s) => n + s.rules.length, 0)} правил</h3>
      {sections.map((s, i) => (
        <div key={s.id}>
          {(i === 0 || sections[i - 1].chapter !== s.chapter) && <h4 className="mt-4 text-sm font-semibold text-gray-700">Глава {s.chapter}. {s.chapterTitle}</h4>}
          <SectionEditor section={s} base={`${base}/${s.id}`} call={call} />
        </div>
      ))}
    </div>
  );
}

type Call = (path: string, init: RequestInit) => Promise<void>;

function SectionEditor({ section: s, base, call }: { section: AdminSection; base: string; call: Call }) {
  const [title, setTitle] = useState(s.title);
  const [sheet, setSheet] = useState(s.rule);
  const [busy, setBusy] = useState('');
  const dirty = title !== s.title || sheet !== s.rule;

  const run = async (label: string, path: string, init: RequestInit) => {
    setBusy(label);
    try {
      await call(path, init);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const topics = s.rules.filter((r) => r.isTopic).length;
  return (
    <details className="card mt-2">
      <summary className="cursor-pointer">
        § {s.number}. {s.title} <span className="text-sm text-gray-500">· {s.rules.length} правил{topics ? ` · ${topics} в темах` : ''}</span>
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        <label className="text-sm">Название параграфа<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="text-sm">Лист параграфа («Весь параграф» в теме)
          <textarea className="input h-40 font-mono text-xs" value={sheet} onChange={(e) => setSheet(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!dirty || !!busy} onClick={() => run('save', base, { method: 'PATCH', body: JSON.stringify({ title, rule: sheet }) })}>
            {busy === 'save' ? 'Сохраняю…' : 'Сохранить параграф'}
          </button>
          <button className="btn-outline" disabled={!s.canResplit || !!busy} title={s.canResplit ? '' : 'Нет текста параграфа: обработайте книгу'}
            onClick={() => confirm(`Разбить § ${s.number} на правила заново (LLM)? Текущие правила заменятся${topics ? `; ${topics} тем останутся со старым текстом` : ''}.`) &&
              run('resplit', `${base}/resplit`, { method: 'POST' })}>
            {busy === 'resplit' ? 'Разбиваю…' : 'Разбить на правила заново'}
          </button>
          <button className="btn-danger" disabled={!!busy} onClick={() => confirm(`Удалить § ${s.number} со всеми правилами?`) && run('del', base, { method: 'DELETE' })}>
            Удалить параграф
          </button>
        </div>
        <h5 className="mt-3 text-sm font-semibold">Правила</h5>
        {s.rules.map((r) => <RuleEditor key={`${r.id}:${r.title}:${r.rule}`} rule={r} base={`${base}/rules/${r.id}`} call={call} />)}
        <NewRule base={`${base}/rules`} call={call} />
      </div>
    </details>
  );
}

function RuleEditor({ rule: r, base, call }: { rule: AdminRule; base: string; call: Call }) {
  const [title, setTitle] = useState(r.title);
  const [text, setText] = useState(r.rule);
  const [keywords, setKeywords] = useState(r.keywords.join(', '));
  const [busy, setBusy] = useState(false);
  const dirty = title !== r.title || text !== r.rule || keywords !== r.keywords.join(', ');

  const run = async (init: RequestInit) => {
    setBusy(true);
    try {
      await call(base, init);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
        <span className="font-mono">{r.id}</span>
        {r.isTopic && <span className="chip text-xs">тема у учеников — правки попадут и в неё</span>}
      </div>
      <input className="input mt-1 font-medium" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input mt-2 h-28 text-sm" value={text} onChange={(e) => setText(e.target.value)} />
      <input className="input mt-2 text-sm" placeholder="ключевые слова через запятую" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
      <div className="mt-2 flex gap-2">
        <button className="btn-primary text-sm" disabled={!dirty || busy}
          onClick={() => run({ method: 'PATCH', body: JSON.stringify({ title, rule: text, keywords: keywords.split(',') }) })}>Сохранить</button>
        <button className="btn-danger" disabled={busy}
          onClick={() => confirm(`Удалить правило «${r.title}»?${r.isTopic ? ' Тема у учеников останется.' : ''}`) && run({ method: 'DELETE' })}>Удалить</button>
      </div>
    </div>
  );
}

function NewRule({ base, call }: { base: string; call: Call }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [keywords, setKeywords] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <details className="rounded-lg border border-dashed border-gray-300 p-3">
      <summary className="cursor-pointer text-sm text-indigo-700">+ Добавить правило</summary>
      <input className="input mt-2" placeholder="Название, например «Распределительный закон умножения»" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input mt-2 h-24 text-sm" placeholder="Формулировка и пример с решением" value={text} onChange={(e) => setText(e.target.value)} />
      <input className="input mt-2 text-sm" placeholder="ключевые слова через запятую" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
      <button className="btn-primary mt-2 text-sm" disabled={busy || !title.trim() || text.trim().length < 20}
        onClick={async () => {
          setBusy(true);
          try {
            await call(base, { method: 'POST', body: JSON.stringify({ title, rule: text, keywords: keywords.split(',') }) });
            setTitle('');
            setText('');
            setKeywords('');
          } catch (e) {
            alert((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}>Добавить</button>
    </details>
  );
}
