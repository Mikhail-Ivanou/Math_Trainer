/**
 * The reference library: textbooks split into paragraphs (§) and rules.
 *
 * Processing (PDF -> sections -> rule sheets -> rules) caches every LLM step
 * in data/books/. After publishing, Firestore is the source of truth: the
 * admin edits sections and rules there, and catalog/grade-{n} is rebuilt
 * from Firestore after each change. Topics are copies of rules, so editing a
 * rule updates its topic too.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { BookConfig } from '../book/books.js';
import { parseToc, sectionRule, sectionUnits, type SectionRule, type SectionUnit } from '../book/llm-steps.js';
import { pdfPages } from '../book/pdf-text.js';
import { findTocPages, sliceSections, type Section, type TocEntry } from '../book/structure.js';

export const DATA = new URL('../../../data/', import.meta.url).pathname;
export const CACHE = `${DATA}books/`;
mkdirSync(CACHE, { recursive: true });

export interface LibraryRule extends SectionUnit {
  id: string;
  order: number;
}

export interface LibrarySection {
  id: string;
  bookId: string;
  grade: number;
  subject: BookConfig['subject'];
  chapter: number;
  chapterTitle: string;
  number: number;
  title: string;
  bookPage: number | null;
  pdfPages: [number, number];
  rule: string;
  keywords: string[];
  units: LibraryRule[];
}

export type Log = (line: string) => void;

function cached<T>(file: string, make: () => Promise<T>): Promise<T> {
  if (existsSync(file)) return Promise.resolve(JSON.parse(readFileSync(file, 'utf8')) as T);
  return make().then((v) => {
    writeFileSync(file, JSON.stringify(v, null, 1));
    return v;
  });
}

/** A few LLM calls at a time: fast, and gentle on the API's rate limit. */
async function inBatches<T, R>(items: T[], log: Log, label: string, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += 4) {
    out.push(...(await Promise.all(items.slice(i, i + 4).map(fn))));
    log(`${label}: ${Math.min(i + 4, items.length)}/${items.length}`);
  }
  return out;
}

export const sectionId = (bookId: string, s: { chapter: number; number: number }) =>
  `${bookId}-c${s.chapter}-p${String(s.number).padStart(2, '0')}`;
export const ruleId = (secId: string, order: number) => `${secId}-r${String(order).padStart(2, '0')}`;
const key = (s: { chapter: number; number: number }) => `${s.chapter}.${s.number}`;

/** Drops the LLM caches of a book, so the next processing redoes those steps. */
export function clearCaches(bookId: string) {
  for (const ext of ['toc', 'sections', 'rules', 'units', 'library']) rmSync(`${CACHE}${bookId}.${ext}.json`, { force: true });
}

export function cachedSections(bookId: string): Section[] {
  const f = `${CACHE}${bookId}.sections.json`;
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Section[]) : [];
}

/** PDF -> TOC (LLM) -> paragraphs -> rule sheets (LLM) -> rules (LLM). */
export async function processBook(book: BookConfig, log: Log): Promise<LibrarySection[]> {
  log(`читаю PDF ${book.file}`);
  const pages = await pdfPages(readFileSync(DATA + book.file));
  log(`страниц: ${pages.length}`);
  // Only the watermark goes: a "глава V." line under the page number is TOC content here, not a running header.
  const tocText = findTocPages(pages).map((i) => pages[i].replace(/^\s*Правообладатель [^\n]*$/gm, '')).join('\n');
  const toc = await cached<TocEntry[]>(`${CACHE}${book.id}.toc.json`, () => {
    log('разбираю оглавление (LLM)');
    return parseToc(book, tocText);
  });
  log(`параграфов в оглавлении: ${toc.length}`);
  const sections = sliceSections(pages, toc);
  writeFileSync(`${CACHE}${book.id}.sections.json`, JSON.stringify(sections, null, 1));
  const sheets = await cached<Record<string, SectionRule>>(`${CACHE}${book.id}.rules.json`, async () => {
    const done = await inBatches(sections, log, 'листы параграфов', (s) => sectionRule(book, s));
    return Object.fromEntries(sections.map((s, k) => [key(s), done[k]]));
  });
  const units = await cached<Record<string, SectionUnit[]>>(`${CACHE}${book.id}.units.json`, async () => {
    const done = await inBatches(sections, log, 'правила', (s) => sectionUnits(book, s));
    return Object.fromEntries(sections.map((s, k) => [key(s), done[k]]));
  });
  const library: LibrarySection[] = sections.map((s) => {
    const id = sectionId(book.id, s);
    return {
      id,
      bookId: book.id,
      grade: book.grade,
      subject: book.subject,
      chapter: s.chapter,
      chapterTitle: s.chapterTitle,
      number: s.number,
      title: s.title,
      bookPage: s.bookPage ?? null,
      pdfPages: s.pdfPages,
      ...sheets[key(s)],
      units: units[key(s)].map((u, k) => ({ ...u, id: ruleId(id, k + 1), order: k + 1 })),
    };
  });
  writeFileSync(`${CACHE}${book.id}.library.json`, JSON.stringify(library, null, 1));
  log(`готово: ${library.length} параграфов, ${library.reduce((n, s) => n + s.units.length, 0)} правил`);
  return library;
}

function ruleDoc(book: BookConfig, s: Omit<LibrarySection, 'units'>, u: LibraryRule) {
  return {
    ...u,
    bookId: book.id,
    bookTitle: book.title,
    grade: s.grade,
    subject: s.subject,
    chapter: s.chapter,
    chapterTitle: s.chapterTitle,
    sectionId: s.id,
    sectionNumber: s.number,
    sectionTitle: s.title,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/** Writes books/{id}, its sections and rules (replacing what was there), then the grade's catalog. */
export async function publishBook(db: Firestore, book: BookConfig, sections: LibrarySection[], log: Log) {
  const bookRef = db.doc(`books/${book.id}`);
  // Sections that disappeared (re-processing) go, with their rules.
  const old = await bookRef.collection('sections').get();
  const keep = new Set(sections.map((s) => s.id));
  for (const d of old.docs) if (!keep.has(d.id)) await db.recursiveDelete(d.ref);
  const writer = db.bulkWriter();
  writer.set(bookRef, { ...book, sectionCount: sections.length, updatedAt: FieldValue.serverTimestamp() });
  for (const { units, ...s } of sections) {
    const ref = bookRef.collection('sections').doc(s.id);
    const oldRules = await ref.collection('rules').get();
    const ids = new Set(units.map((u) => u.id));
    for (const r of oldRules.docs) if (!ids.has(r.id)) writer.delete(r.ref);
    writer.set(ref, { ...s, ruleCount: units.length, updatedAt: FieldValue.serverTimestamp() });
    for (const u of units) writer.set(ref.collection('rules').doc(u.id), ruleDoc(book, s, u));
  }
  await writer.close();
  log(`опубликовано: ${sections.length} параграфов`);
  await rebuildCatalog(db, book.grade);
  log(`каталог ${book.grade} класса обновлён`);
}

/** catalog/grade-{n} from the published rules of that grade, in book / chapter / § / rule order. */
export async function rebuildCatalog(db: Firestore, grade: number) {
  const books = (await db.collection('books').where('grade', '==', grade).get()).docs.map((d) => d.data() as BookConfig);
  const rules: Record<string, unknown>[] = [];
  for (const b of books.sort((x, y) => x.id.localeCompare(y.id))) {
    const sections = (await db.collection(`books/${b.id}/sections`).get()).docs
      .map((d) => d.data() as LibrarySection)
      .sort((x, y) => x.chapter - y.chapter || x.number - y.number);
    for (const s of sections) {
      const rs = (await db.collection(`books/${b.id}/sections/${s.id}/rules`).get()).docs
        .map((d) => d.data() as LibraryRule)
        .sort((x, y) => x.order - y.order);
      for (const r of rs) {
        rules.push({
          id: r.id,
          title: r.title,
          keywords: r.keywords ?? [],
          bookId: b.id,
          bookTitle: b.title,
          subject: s.subject,
          chapterTitle: s.chapterTitle,
          sectionId: s.id,
          sectionNumber: s.number,
          sectionTitle: s.title,
        });
      }
    }
  }
  await db.doc(`catalog/grade-${grade}`).set({ grade, rules, updatedAt: FieldValue.serverTimestamp() });
  return rules.length;
}

/** Deletes a book with its sections and rules; topics made from its rules too, if asked. */
export async function deleteBook(db: Firestore, bookId: string, opts: { deleteTopics: boolean }) {
  const ref = db.doc(`books/${bookId}`);
  const book = (await ref.get()).data() as BookConfig | undefined;
  if (!book) throw new Error(`книги ${bookId} нет`);
  let topics = 0;
  if (opts.deleteTopics) {
    const t = await db.collection('topics').where('bookId', '==', bookId).get();
    for (const d of t.docs) await db.recursiveDelete(d.ref);
    topics = t.size;
  }
  await db.recursiveDelete(ref);
  await rebuildCatalog(db, book.grade);
  return { topics };
}

/** Fields of a rule that a topic copies (see validTopic in firestore.rules). */
const TOPIC_FIELDS = ['bookId', 'bookTitle', 'sectionId', 'grade', 'subject', 'chapter', 'chapterTitle', 'sectionNumber', 'sectionTitle', 'title', 'rule'];

/** Keeps topics/{ruleId} an exact copy of its rule after an edit. */
async function syncTopic(db: Firestore, ruleRef: FirebaseFirestore.DocumentReference) {
  const topic = db.doc(`topics/${ruleRef.id}`);
  if (!(await topic.get()).exists) return false;
  const rule = (await ruleRef.get()).data()!;
  await topic.update(Object.fromEntries(TOPIC_FIELDS.map((k) => [k, rule[k]])));
  return true;
}

async function bookOf(db: Firestore, bookId: string) {
  const b = (await db.doc(`books/${bookId}`).get()).data() as BookConfig | undefined;
  if (!b) throw new Error(`книги ${bookId} нет`);
  return b;
}

export async function updateSection(db: Firestore, bookId: string, secId: string, patch: { title?: string; rule?: string }) {
  const book = await bookOf(db, bookId);
  const ref = db.doc(`books/${bookId}/sections/${secId}`);
  const fields: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (patch.title !== undefined) fields.title = patch.title.trim();
  if (patch.rule !== undefined) fields.rule = patch.rule.trim();
  await ref.update(fields);
  if (patch.title !== undefined) {
    // The § title is copied into its rules and their topics.
    const rules = await ref.collection('rules').get();
    for (const r of rules.docs) {
      await r.ref.update({ sectionTitle: fields.title });
      await syncTopic(db, r.ref);
    }
  }
  await rebuildCatalog(db, book.grade);
}

export async function deleteSection(db: Firestore, bookId: string, secId: string) {
  const book = await bookOf(db, bookId);
  await db.recursiveDelete(db.doc(`books/${bookId}/sections/${secId}`));
  await db.doc(`books/${bookId}`).update({ sectionCount: FieldValue.increment(-1) });
  await rebuildCatalog(db, book.grade);
}

export async function updateRule(db: Firestore, bookId: string, secId: string, id: string, patch: Partial<SectionUnit>) {
  const book = await bookOf(db, bookId);
  const ref = db.doc(`books/${bookId}/sections/${secId}/rules/${id}`);
  const fields: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (patch.title !== undefined) fields.title = patch.title.trim();
  if (patch.rule !== undefined) fields.rule = patch.rule.trim();
  if (patch.keywords !== undefined) fields.keywords = patch.keywords.map((k) => k.trim()).filter(Boolean);
  await ref.update(fields);
  const topicUpdated = await syncTopic(db, ref);
  await rebuildCatalog(db, book.grade);
  return { topicUpdated };
}

export async function addRule(db: Firestore, bookId: string, secId: string, unit: SectionUnit) {
  const book = await bookOf(db, bookId);
  const secRef = db.doc(`books/${bookId}/sections/${secId}`);
  const s = (await secRef.get()).data() as LibrarySection;
  const existing = await secRef.collection('rules').get();
  // Ids are never reused: a deleted rule's topic must not attach to a new rule.
  const order = Math.max(0, ...existing.docs.map((d) => Number(d.id.slice(-2)) || 0)) + 1;
  const u: LibraryRule = { title: unit.title.trim(), rule: unit.rule.trim(), keywords: unit.keywords ?? [], id: ruleId(secId, order), order };
  await secRef.collection('rules').doc(u.id).set(ruleDoc(book, s, u));
  await secRef.update({ ruleCount: FieldValue.increment(1) });
  await rebuildCatalog(db, book.grade);
  return u;
}

export async function deleteRule(db: Firestore, bookId: string, secId: string, id: string) {
  const book = await bookOf(db, bookId);
  await db.doc(`books/${bookId}/sections/${secId}/rules/${id}`).delete();
  await db.doc(`books/${bookId}/sections/${secId}`).update({ ruleCount: FieldValue.increment(-1) });
  await rebuildCatalog(db, book.grade);
}

/** Splits one paragraph into rules again (LLM) and replaces its rules; topics of removed rules stay. */
export async function resplitSection(db: Firestore, bookId: string, secId: string) {
  const book = await bookOf(db, bookId);
  const section = cachedSections(bookId).find((s) => sectionId(bookId, s) === secId);
  if (!section) throw new Error(`нет текста параграфа ${secId}: обработайте книгу заново`);
  const units = await sectionUnits(book, section);
  const secRef = db.doc(`books/${bookId}/sections/${secId}`);
  const s = (await secRef.get()).data() as LibrarySection;
  const old = await secRef.collection('rules').get();
  const start = Math.max(0, ...old.docs.map((d) => Number(d.id.slice(-2)) || 0));
  const writer = db.bulkWriter();
  for (const d of old.docs) writer.delete(d.ref);
  const fresh = units.map((u, k) => ({ ...u, id: ruleId(secId, start + k + 1), order: k + 1 }));
  for (const u of fresh) writer.set(secRef.collection('rules').doc(u.id), ruleDoc(book, s, u));
  writer.update(secRef, { ruleCount: fresh.length });
  await writer.close();
  await rebuildCatalog(db, book.grade);
  return fresh;
}
