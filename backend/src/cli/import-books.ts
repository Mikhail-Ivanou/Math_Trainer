/**
 * Builds the reference library from the textbook PDFs in data/ and publishes it.
 *
 *   npm run import:books                  # parse + rules (LLM, cached in data/books/), no Firestore
 *   npm run import:books -- --only math6  # one book
 *   npm run import:books -- --publish     # also write books/, sections, their rules, catalog/
 *
 * Each paragraph gets a rule sheet (the whole §) and is split into separate
 * rules — what a student actually struggles with and adds as a topic.
 * LLM results are cached per book (data/books/<id>.toc.json, .rules.json,
 * .units.json), so reruns are free; delete a cache file to redo that step.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BOOKS, type BookConfig } from '../book/books.js';
import { parseToc, sectionRule, sectionUnits, type SectionRule, type SectionUnit } from '../book/llm-steps.js';
import { pdfPages } from '../book/pdf-text.js';
import { findTocPages, sliceSections, type TocEntry } from '../book/structure.js';

const DATA = new URL('../../../data/', import.meta.url).pathname;
const OUT = `${DATA}books/`;
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const publish = args.includes('--publish');
const noRules = args.includes('--no-rules'); // check the split before paying for rules

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

/** One rule of a paragraph: `books/{bookId}/sections/{sectionId}/rules/{id}`, a possible topic. */
export interface LibraryRule extends SectionUnit {
  id: string;
  order: number;
}

/** A few LLM calls at a time: fast, and gentle on the API's rate limit. */
async function inBatches<T, R>(items: T[], label: string, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += 4) {
    out.push(...(await Promise.all(items.slice(i, i + 4).map(fn))));
    process.stdout.write(`  ${label} ${Math.min(i + 4, items.length)}/${items.length}\r`);
  }
  return out;
}

function cached<T>(file: string, make: () => Promise<T>): Promise<T> {
  if (existsSync(file)) return Promise.resolve(JSON.parse(readFileSync(file, 'utf8')) as T);
  return make().then((v) => {
    writeFileSync(file, JSON.stringify(v, null, 1));
    return v;
  });
}

async function importBook(book: BookConfig): Promise<LibrarySection[]> {
  const pages = await pdfPages(readFileSync(DATA + book.file));
  // Only the watermark goes: a "глава V." line under the page number is TOC content here, not a running header.
  const tocText = findTocPages(pages).map((i) => pages[i].replace(/^\s*Правообладатель [^\n]*$/gm, '')).join('\n');
  const toc = await cached<TocEntry[]>(`${OUT}${book.id}.toc.json`, () => parseToc(book, tocText));
  const sections = sliceSections(pages, toc);
  writeFileSync(`${OUT}${book.id}.sections.json`, JSON.stringify(sections, null, 1));
  if (noRules) {
    for (const s of sections) console.log(`  ${s.chapter}.${String(s.number).padEnd(3)} pdf ${s.pdfPages.join('-').padEnd(8)} ${String(s.text.length).padStart(6)}  ${s.chapterTitle} / ${s.title}`);
    return [];
  }

  const key = (s: { chapter: number; number: number }) => `${s.chapter}.${s.number}`;
  const rules = await cached<Record<string, SectionRule>>(`${OUT}${book.id}.rules.json`, async () => {
    const done = await inBatches(sections, 'rule sheets', (s) => sectionRule(book, s));
    return Object.fromEntries(sections.map((s, k) => [key(s), done[k]]));
  });
  const units = await cached<Record<string, SectionUnit[]>>(`${OUT}${book.id}.units.json`, async () => {
    const done = await inBatches(sections, 'rules', (s) => sectionUnits(book, s));
    return Object.fromEntries(sections.map((s, k) => [key(s), done[k]]));
  });

  return sections.map((s) => {
    const id = `${book.id}-c${s.chapter}-p${String(s.number).padStart(2, '0')}`;
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
    ...rules[key(s)],
    units: units[key(s)].map((u, k) => ({ ...u, id: `${id}-r${String(k + 1).padStart(2, '0')}`, order: k + 1 })),
    };
  });
}

const library: Record<string, LibrarySection[]> = {};
for (const book of BOOKS.filter((b) => !only || b.id === only)) {
  console.log(`${book.id}: ${book.title}`);
  const sections = await importBook(book);
  library[book.id] = sections;
  for (const s of sections) {
    console.log(`  ${s.id.padEnd(22)} ${String(s.units.length).padStart(2)} rules  ${s.title}`);
    for (const u of s.units) console.log(`      ${u.id.padEnd(26)} ${u.title}`);
  }
  writeFileSync(`${OUT}${book.id}.library.json`, JSON.stringify(sections, null, 1));
}

if (publish) {
  const { adminFirestore } = await import('../firestore.js');
  const { FieldValue } = await import('firebase-admin/firestore');
  const db = adminFirestore();
  for (const [bookId, sections] of Object.entries(library)) {
    const book = BOOKS.find((b) => b.id === bookId)!;
    const { file: _, ...meta } = book;
    const writer = db.bulkWriter();
    writer.set(db.doc(`books/${bookId}`), { ...meta, sectionCount: sections.length, updatedAt: FieldValue.serverTimestamp() });
    for (const { units, ...s } of sections) {
      const section = db.doc(`books/${bookId}/sections/${s.id}`);
      writer.set(section, { ...s, ruleCount: units.length, updatedAt: FieldValue.serverTimestamp() });
      // Each rule carries its paragraph's fields, so a topic can be checked against one document.
      for (const u of units) {
        writer.set(section.collection('rules').doc(u.id), {
          ...u,
          bookId,
          bookTitle: book.title,
          grade: s.grade,
          subject: s.subject,
          chapter: s.chapter,
          chapterTitle: s.chapterTitle,
          sectionId: s.id,
          sectionNumber: s.number,
          sectionTitle: s.title,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    await writer.close();
    console.log(`published ${bookId}: ${sections.length} sections, ${sections.reduce((n, s) => n + s.units.length, 0)} rules`);
  }
  // One catalog document per grade: every rule, what the app matches a student's request against.
  const grades = new Set(BOOKS.map((b) => b.grade));
  for (const grade of grades) {
    const items = BOOKS.filter((b) => b.grade === grade).flatMap((b) =>
      (library[b.id] ?? readLibrary(b.id)).flatMap((s) =>
        s.units.map((u) => ({
          id: u.id,
          title: u.title,
          keywords: u.keywords,
          bookId: b.id,
          bookTitle: b.title,
          subject: s.subject,
          chapterTitle: s.chapterTitle,
          sectionId: s.id,
          sectionNumber: s.number,
          sectionTitle: s.title,
        })),
      ),
    );
    await db.doc(`catalog/grade-${grade}`).set({ grade, rules: items, updatedAt: FieldValue.serverTimestamp() });
    console.log(`published catalog/grade-${grade}: ${items.length} rules`);
  }
}

function readLibrary(bookId: string): LibrarySection[] {
  const f = `${OUT}${bookId}.library.json`;
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as LibrarySection[]) : [];
}
