/**
 * Builds the reference library from the textbook PDFs in data/ (the same
 * pipeline as the admin page's «Обработать»).
 *
 *   npm run import:books                  # process (LLM steps cached in data/books/), no Firestore
 *   npm run import:books -- --only math6  # one book
 *   npm run import:books -- --publish     # also publish books, sections, rules and catalogs
 */
import { BOOKS } from '../book/books.js';
import { processBook, publishBook } from '../library/library.js';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const publish = args.includes('--publish');
const log = (line: string) => console.log(`  ${line}`);

const db = publish ? (await import('../firestore.js')).adminFirestore() : undefined;
for (const book of BOOKS.filter((b) => !only || b.id === only)) {
  console.log(`${book.id}: ${book.title}`);
  const sections = await processBook(book, log);
  if (db) await publishBook(db, book, sections, log);
}
