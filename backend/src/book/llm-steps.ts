import { chatJson } from '../llm.js';
import type { BookConfig } from './books.js';
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
- kind: "topic" для параграфов с учебным материалом; "other" для тестов, «Тест для самопроверки», «Математика вокруг нас», «Практическая математика», «Итоговая самооценка», «Увлекательная математика», повторения материала прошлых классов, введения, ответов, «Базы знаний».
Включи все пункты с «§» в порядке оглавления.`;
  const { data } = await chatJson<{ entries: RawTocEntry[] }>(system, user, { maxTokens: 12000 });
  return data.entries
    .filter((e) => e.kind === 'topic')
    .map(({ kind: _, ...e }) => ({ ...e, bookPage: e.bookPage ?? undefined }));
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
  const system = `Ты — учитель математики ${book.grade} класса (Беларусь). По тексту параграфа учебника составь для ученика краткое правило темы: определения, правила, формулы и способы решения, к каждому — короткий пример с решением. Пиши по-русски, просто и точно, только то, что есть в параграфе. Знаки действий: +, −, ·, :, дроби a/b, степени x², корни √. В PDF знак умножения иногда пропал («10 4» вместо «10 · 4») — восстанови по смыслу. Верни только JSON.`;
  const text = s.text.length > MAX_SECTION_CHARS ? s.text.slice(0, MAX_SECTION_CHARS) : s.text;
  const user = `Учебник «${book.title}», глава ${s.chapter} «${s.chapterTitle}», § ${s.number} «${s.title}».
Текст параграфа:
<<<
${text}
>>>

Верни {"rule": "…", "keywords": ["…"]}
- rule — 600–1500 символов, абзацы через \\n, пункты списком с «• »;
- keywords — 5–12 слов и коротких фраз, которыми ученик мог бы назвать эту тему («дроби», «сложение дробей», «проценты от числа»…).`;
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
  const system = `Ты — учитель математики ${book.grade} класса (Беларусь). Ты раскладываешь параграф учебника на отдельные правила, которые ученик может не понимать по одному: определения, законы, свойства, правила действий, признаки, формулы, способы решения типовых задач. Пиши по-русски, просто и точно, только то, что есть в параграфе. Знаки: +, −, ·, :, дроби a/b, степени x², корни √. В PDF знак умножения иногда пропал («10 4» вместо «10 · 4») — восстанови по смыслу. Верни только JSON.`;
  const text = s.text.length > MAX_SECTION_CHARS ? s.text.slice(0, MAX_SECTION_CHARS) : s.text;
  const user = `Учебник «${book.title}», глава ${s.chapter} «${s.chapterTitle}», § ${s.number} «${s.title}».
Текст параграфа:
<<<
${text}
>>>

Верни {"units": [{"title": "Распределительный закон умножения", "rule": "…", "keywords": ["…"]}]}
- 2–10 правил в порядке параграфа; каждое — отдельная мысль, которую можно тренировать заданиями; близкие мелочи объединяй, тесты и исторические справки пропускай;
- title — короткое название правила, как его назвал бы учитель (3–8 слов), без «§» и номера;
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
