/**
 * Splits a textbook PDF into topics and publishes them to Firestore.
 *
 *   npm run seed:topics -- --dry-run          # write data/topics-<book>.json only
 *   npm run seed:topics                       # also write books/{id} and topics/{id}
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pdfPages } from '../book/pdf-text.js';
import { splitTopics } from '../book/topics.js';

const BOOK = {
  id: 'math5-1',
  title: 'Математика. 5 класс. Часть 1',
  authors: 'Герасимов В. Д., Пирютко О. Н., Лобанов А. П.',
  year: 2025,
  grade: 5,
  subject: 'math',
  language: 'ru',
  source: 'https://e-padruchnik.adu.by/ (id=1149)',
  pdfPageOffset: 6, // book page = PDF page − 6
};
const PDF = new URL('../../../data/Matematika_5kl_ch1_Gerasimov_rus_2025.pdf', import.meta.url).pathname;
const OUT = new URL(`../../../data/topics-${BOOK.id}.json`, import.meta.url).pathname;

const dryRun = process.argv.includes('--dry-run');

const topics = splitTopics(await pdfPages(readFileSync(PDF)));
mkdirSync(new URL('../../../data/', import.meta.url).pathname, { recursive: true });
writeFileSync(OUT, JSON.stringify(topics, null, 1));
for (const t of topics) {
  console.log(
    `§${String(t.paragraph).padStart(2)} p.${t.bookPage} pdf ${t.pdfPages.join('-')} theory ${String(t.theory.length).padStart(5)} ex ${String(t.exercises.length).padStart(5)}  ${t.title}`,
  );
}
console.log(`${topics.length} topics -> ${OUT}`);

if (!dryRun) {
  const { adminFirestore } = await import('../firestore.js');
  const { FieldValue } = await import('firebase-admin/firestore');
  const db = adminFirestore();
  const batch = db.batch();
  batch.set(db.doc(`books/${BOOK.id}`), { ...BOOK, topicCount: topics.length, updatedAt: FieldValue.serverTimestamp() });
  for (const t of topics) {
    const id = `${BOOK.id}-p${String(t.paragraph).padStart(2, '0')}`;
    batch.set(db.doc(`topics/${id}`), {
      bookId: BOOK.id,
      grade: BOOK.grade,
      subject: BOOK.subject,
      order: t.paragraph,
      chapter: t.chapter,
      chapterTitle: t.chapterTitle,
      paragraph: t.paragraph,
      title: t.title,
      bookPage: t.bookPage,
      pdfPages: t.pdfPages,
      theory: t.theory,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`published books/${BOOK.id} and ${topics.length} topics to Firestore`);
}
