import { chatJson } from '../llm.js';
import { SUBJECTS, isMathLike, subjectGenitive, type BookConfig } from './books.js';
import type { Section, TocEntry } from './structure.js';

interface RawTocEntry extends TocEntry {
  kind: 'topic' | 'other';
}

/**
 * Turns the mangled TOC text into entries. The extracted TOC has split page
 * numbers ("2\n2"), detached first letters ("С\nтепень"), clipped titles and
 * UPPERCASE chapter names; the model restores them. Non-topic entries (tests,
 * «Математика вокруг нас», «Итоговая самооценка», answers…) are dropped.
 */
export async function parseToc(book: BookConfig, tocText: string): Promise<TocEntry[]> {
  const system = `Ты разбираешь оглавление школьного учебника, извлечённое из PDF с искажениями: номера страниц бывают разорваны переносом строки («2\\n2» = 22), первая буква названия оторвана («С\\nтепень» = «Степень»), названия глав бывают ЗАГЛАВНЫМИ, конец длинного названия может быть обрезан. Восстанови структуру. Верни только JSON.`;
  const user = `Учебник: «${book.title}».
Оглавление:
<<<
${tocText}
>>>

Верни {"entries": [{"chapter": 1, "chapterTitle": "Натуральные числа", "number": 1, "title": "Как решать задачу", "bookPage": 10, "kind": "topic"}]}
- chapter — номер главы арабскими цифрами (I → 1); chapterTitle — название главы в обычном регистре («ДЕСЯТИЧНЫЕ ДРОБИ» → «Десятичные дроби»);
- number — номер параграфа после «§» как в оглавлении (в каждой главе может начинаться с 1);
- title — полное название параграфа без номера, переносов и точек-заполнителей; если конец обрезан, допиши по смыслу коротко;
- bookPage — номер страницы, если он есть, иначе null;
- kind: "topic" для параграфов с учебным материалом; "other" для тестов, «Тест для самопроверки», «Математика вокруг нас», «Практическая математика», «Итоговая самооценка», «Увлекательная математика», «Это интересно» и исторических справок, повторения материала прошлых классов, введения, ответов, «Базы знаний», приложений и таблиц.
Включи все пункты с «§» в порядке оглавления.`;
  const { data } = await chatJson<{ entries: RawTocEntry[] }>(system, user, { maxTokens: 12000 });
  return data.entries
    .filter((e) => e.kind === 'topic')
    .map(({ kind: _, ...e }) => ({ ...e, bookPage: e.bookPage ?? undefined }));
}

/** How to write formulas for this subject. */
function notation(book: BookConfig): string {
  const common = 'В PDF знаки иногда пропадают («10 4» вместо «10 · 4») — восстанови по смыслу.';
  if (isMathLike(book.subject)) return `Знаки действий: +, −, ·, :, дроби a/b, степени x², корни √. ${common}`;
  if (book.subject === 'chemistry') return `Химические формулы с нижними индексами (H₂O, CO₂), уравнения реакций со стрелкой →, величины с единицами (моль, г/моль). ${common}`;
  return `Формулы с обозначениями величин и единицами СИ (v = s / t, м/с), степени 10³, знаки ·, −. ${common}`;
}

export interface BookMeta {
  title: string;
  subject: string;
  subjectName: string;
  grade: number;
  part: number | null;
  authors: string;
  year: number;
}

/**
 * Title, subject, grade, part, authors and year from the title page (first
 * pages with text) and the imprint at the end of the book.
 */
export async function bookMeta(pages: string[]): Promise<BookMeta> {
  const text = (p: string) => p.replace(/\s+/g, ' ').trim();
  const first = pages.map(text).filter((p) => p.length > 40).slice(0, 2);
  const last = pages.slice(-3).map(text).filter((p) => /Учебное издание|ISBN|УДК/.test(p));
  const codes = Object.entries(SUBJECTS).map(([k, v]) => `${k} — ${v.name}`).join(', ');
  const { data } = await chatJson<BookMeta>(
    'Ты определяешь выходные данные школьного учебника по его титульным страницам и выходным данным. Текст извлечён из PDF: слова могут идти не по порядку, буквы — в разном регистре. Верни только JSON.',
    `Титульные страницы:
<<<
${first.join('\n---\n').slice(0, 4000)}
>>>
Выходные данные:
<<<
${last.join('\n---\n').slice(0, 3000)}
>>>

Верни {"title": "Геометрия. 7 класс", "subject": "geometry", "subjectName": "Геометрия", "grade": 7, "part": null, "authors": "Казаков В. В.", "year": 2022}
- subject — код предмета: ${codes}; для другого предмета придумай короткий латинский код;
- title — «Предмет. N класс» и «. Часть K», если книга в частях;
- part — номер части или null; authors — фамилии с инициалами через запятую; year — год издания.`,
    { maxTokens: 1000 },
  );
  if (!data.title || !Number(data.grade)) throw new Error('не удалось определить учебник по титульным страницам');
  return { ...data, subject: String(data.subject).toLowerCase().replace(/[^a-z]/g, '') || 'other', grade: Number(data.grade), year: Number(data.year) || 0 };
}

/** math5-1, physics8, chemistry9-2…; a suffix is added when the id is taken. */
export function bookId(meta: BookMeta, taken: Set<string>): string {
  const base = `${meta.subject}${meta.grade}${meta.part ? `-${meta.part}` : ''}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-v${n}`;
  return id;
}

export interface SectionRule {
  /** Short summary of the rules, definitions and methods of the paragraph, for a student. */
  rule: string;
  /** Words a student might use for this topic, for matching their requests. */
  keywords: string[];
}

const MAX_SECTION_CHARS = 14000;

/** Writes the paragraph's rule sheet: definitions, rules and one worked example each. */
export async function sectionRule(book: BookConfig, s: Section): Promise<SectionRule> {
  const system = `Ты — учитель ${subjectGenitive(book.subject)} ${book.grade} класса (Беларусь). По тексту параграфа учебника составь для ученика краткое правило темы: определения, законы, правила, формулы и способы решения, к каждому — короткий пример с решением. Пиши по-русски, просто и точно, только то, что есть в параграфе. ${notation(book)} Верни только JSON.`;
  const text = s.text.length > MAX_SECTION_CHARS ? s.text.slice(0, MAX_SECTION_CHARS) : s.text;
  const user = `Учебник «${book.title}», глава ${s.chapter} «${s.chapterTitle}», § ${s.number} «${s.title}».
Текст параграфа:
<<<
${text}
>>>

Верни {"rule": "…", "keywords": ["…"]}
- rule — 600–1500 символов, абзацы через \\n, пункты списком с «• »;
- keywords — 5–12 слов и коротких фраз, которыми ученик мог бы назвать эту тему.`;
  let data: SectionRule;
  try {
    ({ data } = await chatJson<SectionRule>(system, user, { maxTokens: 6000 }));
  } catch (e) {
    // A cut-off or malformed JSON reply: one more try.
    ({ data } = await chatJson<SectionRule>(system, user, { maxTokens: 6000 }));
  }
  if (!data.rule || data.rule.length < 100) throw new Error(`rule for § ${s.number} is too short`);
  return { rule: data.rule.trim(), keywords: (data.keywords ?? []).map((k) => String(k).trim()).filter(Boolean).slice(0, 12) };
}

export interface SectionUnit {
  /** The rule's own name, as a teacher would call it: «Распределительный закон умножения». */
  title: string;
  /** Statement, formula and a short worked example. */
  rule: string;
  keywords: string[];
}

/**
 * Splits a paragraph into the separate rules it teaches. A student usually
 * struggles with one rule («распределительный закон умножения»), not with a
 * whole paragraph («Умножение и деление натуральных чисел»).
 */
export async function sectionUnits(book: BookConfig, s: Section): Promise<SectionUnit[]> {
  const system = `Ты — учитель ${subjectGenitive(book.subject)} ${book.grade} класса (Беларусь). Ты раскладываешь параграф учебника на отдельные правила, которые ученик может не понимать по одному: определения, законы, свойства, правила, признаки, формулы, способы решения типовых задач. Пиши по-русски, просто и точно, только то, что есть в параграфе. ${notation(book)} Верни только JSON.`;
  const text = s.text.length > MAX_SECTION_CHARS ? s.text.slice(0, MAX_SECTION_CHARS) : s.text;
  const user = `Учебник «${book.title}», глава ${s.chapter} «${s.chapterTitle}», § ${s.number} «${s.title}».
Текст параграфа:
<<<
${text}
>>>

Верни {"units": [{"title": "Распределительный закон умножения", "rule": "…", "keywords": ["…"]}]}
- 2–10 правил в порядке параграфа; каждое — отдельная мысль, которую можно тренировать заданиями; близкие мелочи объединяй, тесты и исторические справки пропускай;
- title — короткое название правила, как его назвал бы учитель (3–8 слов), без «§» и номера, например «Распределительный закон умножения», «Закон Ома для участка цепи», «Валентность химических элементов»;
- rule — 150–600 символов: формулировка, формула, если есть, и короткий пример с решением; абзацы через \\n;
- keywords — 3–8 слов и фраз, которыми ученик мог бы назвать это правило.`;
  let data: { units: SectionUnit[] };
  try {
    ({ data } = await chatJson<{ units: SectionUnit[] }>(system, user, { maxTokens: 8000 }));
  } catch {
    ({ data } = await chatJson<{ units: SectionUnit[] }>(system, user, { maxTokens: 8000 }));
  }
  const units = (data.units ?? [])
    .map((u) => ({
      title: String(u.title ?? '').trim(),
      rule: String(u.rule ?? '').trim(),
      keywords: (u.keywords ?? []).map((k) => String(k).trim()).filter(Boolean).slice(0, 8),
    }))
    .filter((u) => u.title && u.rule.length >= 60);
  if (units.length === 0) throw new Error(`no rules for § ${s.number} «${s.title}»`);
  return units.slice(0, 12);
}
