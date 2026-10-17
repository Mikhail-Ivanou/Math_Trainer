/**
 * Builds the reference library from the textbook PDFs in data/ and publishes it.
 *
 *   npm run import:books                  # parse + rules (LLM, cached in data/books/), no Firestore
 *   npm run import:books -- --only math6  # one book
 *   npm run import:books -- --publish     # also write books/, books/{id}/sections/, catalog/
 *
 * LLM results are cached per book (data/books/<id>.toc.json, .rules.json), so
 * reruns are free; delete a cache file to redo that step.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BOOKS, type BookConfig } from '../book/books.js';
import { parseToc, sectionRule, type SectionRule } from '../book/llm-steps.js';
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

  const rules = await cached<Record<string, SectionRule>>(`${OUT}${book.id}.rules.json`, async () => {
    const out: Record<string, SectionRule> = {};
    // A few at a time: fast, and gentle on the API's rate limit.
    for (let i = 0; i < sections.length; i += 4) {
      const batch = sections.slice(i, i + 4);
      const done = await Promise.all(batch.map((s) => sectionRule(book, s)));
      batch.forEach((s, k) => (out[`${s.chapter}.${s.number}`] = done[k]));
      process.stdout.write(`  rules ${Math.min(i + 4, sections.length)}/${sections.length}\r`);
    }
    return out;
  });

  return sections.map((s) => ({
    id: `${book.id}-c${s.chapter}-p${String(s.number).padStart(2, '0')}`,
    bookId: book.id,
    grade: book.grade,
    subject: book.subject,
    chapter: s.chapter,
    chapterTitle: s.chapterTitle,
    number: s.number,
    title: s.title,
    bookPage: s.bookPage ?? null,
    pdfPages: s.pdfPages,
    ...rules[`${s.chapter}.${s.number}`],
  }));
}

const library: Record<string, LibrarySection[]> = {};
for (const book of BOOKS.filter((b) => !only || b.id === only)) {
  console.log(`${book.id}: ${book.title}`);
  const sections = await importBook(book);
  library[book.id] = sections;
  for (const s of sections) {
    console.log(`  ${s.id.padEnd(22)} pdf ${s.pdfPages.join('-').padEnd(8)} rule ${String(s.rule.length).padStart(4)}  ${s.chapterTitle} / ${s.title}`);
  }
  writeFileSync(`${OUT}${book.id}.library.json`, JSON.stringify(sections, null, 1));
}

if (publish) {
  const { adminFirestore } = await import('../firestore.js');
  const { FieldValue } = await import('firebase-admin/firestore');
  const db = adminFirestore();
  for (const [bookId, sections] of Object.entries(library)) {
    const book = BOOKS.find((b) => b.id === bookId)!;
    const batch = db.batch();
    const { file: _, ...meta } = book;
    batch.set(db.doc(`books/${bookId}`), { ...meta, sectionCount: sections.length, updatedAt: FieldValue.serverTimestamp() });
    for (const s of sections) batch.set(db.doc(`books/${bookId}/sections/${s.id}`), { ...s, updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();
    console.log(`published ${bookId}: ${sections.length} sections`);
  }
  // One small catalog document per grade: what the app matches a student's request against.
  const grades = new Set(BOOKS.map((b) => b.grade));
  for (const grade of grades) {
    const all = BOOKS.filter((b) => b.grade === grade).flatMap((b) => library[b.id] ?? readLibrary(b.id));
    await db.doc(`catalog/grade-${grade}`).set({
      grade,
      sections: all.map(({ rule: _, pdfPages: __, bookPage: ___, ...s }) => ({ ...s, bookTitle: BOOKS.find((b) => b.id === s.bookId)!.title })),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`published catalog/grade-${grade}: ${all.length} sections`);
  }
}

function readLibrary(bookId: string): LibrarySection[] {
  const f = `${OUT}${bookId}.library.json`;
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as LibrarySection[]) : [];
}
