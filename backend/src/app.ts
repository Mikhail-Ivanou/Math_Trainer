/**
 * The local server's routes (started by server.ts on 127.0.0.1 only: nothing
 * here is published).
 *
 * /api/match, /api/generate — for the website (needs a Firebase ID token);
 * /api/admin/*            — the admin page: books, processing, sections, rules.
 */
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { existsSync, writeFileSync } from 'node:fs';
import { BOOKS, type BookConfig } from './book/books.js';
import { bookId, bookMeta } from './book/llm-steps.js';
import { pdfPages } from './book/pdf-text.js';
import { adminFirestore } from './firestore.js';
import {
  addRule,
  cachedSections,
  clearCaches,
  DATA,
  deleteBook,
  deleteRule,
  deleteSection,
  processBook,
  publishBook,
  rebuildCatalog,
  resplitSection,
  updateRule,
  updateSection,
  type LibrarySection,
} from './library/library.js';
import { generateTasks, matchRules, type CatalogRule } from './tasks/generator.js';

const db = adminFirestore();
export const app = express();
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
app.use(express.json({ limit: '2mb' }));

type Handler = (req: Request, res: Response) => Promise<unknown>;
const route = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).then((v) => (res.headersSent ? undefined : res.json(v ?? { ok: true })), next);

/** Website calls carry the signed-in user's Firebase ID token. */
async function requireUser(req: Request) {
  const token = req.header('authorization')?.replace(/^Bearer /, '');
  if (!token) throw Object.assign(new Error('нужен вход'), { status: 401 });
  return getAuth().verifyIdToken(token);
}

// ---------- website ----------

app.post('/api/match', route(async (req) => {
  await requireUser(req);
  const { grade, request } = req.body as { grade: number; request: string };
  const catalog = ((await db.doc(`catalog/grade-${grade}`).get()).data()?.rules ?? []) as CatalogRule[];
  return { matches: await matchRules(String(request ?? ''), catalog) };
}));

app.post('/api/generate', route(async (req) => {
  await requireUser(req);
  // The website writes the verified tasks to Firestore itself, as the student.
  return generateTasks(req.body);
}));

// ---------- admin: books and processing ----------

interface Job {
  id: string;
  bookId: string;
  status: 'running' | 'done' | 'failed';
  log: string[];
  startedAt: string;
  finishedAt?: string;
}
const jobs: Job[] = [];

function startJob(book: BookConfig, opts: { fresh: boolean }) {
  const { job, log, finish } = newJob(book.id);
  finish((async () => {
    if (opts.fresh) {
      clearCaches(book.id);
      log('кэш LLM очищен');
    }
    const sections = await processBook(book, log);
    await publishBook(db, book, sections, log);
  })());
  return job;
}

function newJob(label: string) {
  const job: Job = { id: `${Date.now()}`, bookId: label, status: 'running', log: [], startedAt: new Date().toISOString() };
  jobs.unshift(job);
  const log = (line: string) => job.log.push(`${new Date().toLocaleTimeString('ru-RU')} ${line}`);
  const finish = (p: Promise<unknown>) =>
    p.then(
      () => {
        job.status = 'done';
        job.finishedAt = new Date().toISOString();
      },
      (e: Error) => {
        job.status = 'failed';
        job.finishedAt = new Date().toISOString();
        log(`ошибка: ${e.message}`);
      },
    );
  return { job, log, finish };
}

/** Reads the book's metadata from its pages, registers it under a fresh id, processes and publishes it. */
function startNewBookJob(pdf: Buffer, portalId: number) {
  const { job, log, finish } = newJob('новая книга');
  finish((async () => {
    log(portalId ? `скачан PDF с портала (id ${portalId}), ${(pdf.length / 1e6).toFixed(1)} МБ` : `загружен PDF, ${(pdf.length / 1e6).toFixed(1)} МБ`);
    const meta = await bookMeta(await pdfPages(pdf));
    const id = bookId(meta, new Set((await db.collection('books').get()).docs.map((d) => d.id)));
    job.bookId = id;
    log(`это «${meta.title}» (${meta.subjectName}, ${meta.grade} класс${meta.part ? `, часть ${meta.part}` : ''}), ${meta.authors}, ${meta.year} → id ${id}`);
    const book: BookConfig & { subjectName: string } = {
      id,
      file: `${id}.pdf`,
      grade: meta.grade,
      subject: meta.subject,
      subjectName: meta.subjectName,
      title: meta.title,
      authors: meta.authors,
      year: meta.year,
      portalId,
    };
    writeFileSync(DATA + book.file, pdf);
    await db.doc(`books/${id}`).set({ ...book, sectionCount: 0 });
    const sections = await processBook(book, log);
    await publishBook(db, book, sections, log);
  })());
  return job;
}

const getBook = async (id: string) => {
  const b = (await db.doc(`books/${id}`).get()).data() as BookConfig | undefined;
  if (!b) throw Object.assign(new Error(`книги ${id} нет`), { status: 404 });
  return b;
};

app.get('/api/admin/books', route(async () => {
  const books = (await db.collection('books').get()).docs.map((d) => d.data() as BookConfig & { sectionCount?: number });
  const topics = (await db.collection('topics').get()).docs.map((d) => d.data());
  return {
    books: books
      .sort((a, b) => a.grade - b.grade || a.id.localeCompare(b.id))
      .map((b) => ({ ...b, hasPdf: existsSync(DATA + b.file), topicCount: topics.filter((t) => t.bookId === b.id).length })),
  };
}));

/**
 * New book: the PDF as the body, or `?portalId=` to download it from
 * e-padruchnik.adu.by. Everything else (title, subject, grade, part, authors,
 * year, id) is read from the book itself in the processing job.
 */
app.post('/api/admin/books', express.raw({ type: 'application/pdf', limit: '300mb' }), route(async (req) => {
  const portalId = Number((req.query as Record<string, string>).portalId) || 0;
  let pdf: Buffer;
  if (Buffer.isBuffer(req.body) && req.body.length) {
    pdf = req.body;
  } else if (portalId) {
    const taken = (await db.collection('books').where('portalId', '==', portalId).get()).docs[0];
    if (taken) throw Object.assign(new Error(`книга ${portalId} с портала уже есть: ${taken.id}`), { status: 409 });
    const form = new FormData();
    form.set('id', String(portalId));
    form.set('getbook', '');
    const r = await fetch('https://e-padruchnik.adu.by/', { method: 'POST', body: form });
    pdf = Buffer.from(await r.arrayBuffer());
  } else {
    throw Object.assign(new Error('нужен PDF или id книги на портале'), { status: 400 });
  }
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw Object.assign(new Error(portalId ? `портал не отдал PDF для id ${portalId}` : 'это не PDF'), { status: 400 });
  return { job: startNewBookJob(pdf, portalId) };
}));

app.post('/api/admin/books/:id/process', route(async (req) => {
  const book = await getBook(String(req.params.id));
  if (!existsSync(DATA + book.file)) throw Object.assign(new Error(`нет файла data/${book.file}`), { status: 400 });
  return { job: startJob(book, { fresh: req.query.fresh === '1' }) };
}));

app.delete('/api/admin/books/:id', route(async (req) => deleteBook(db, String(req.params.id), { deleteTopics: req.query.topics === 'delete' })));

app.get('/api/admin/jobs', route(async () => ({ jobs: jobs.slice(0, 20) })));

// ---------- admin: sections and rules ----------

app.get('/api/admin/books/:id/sections', route(async (req) => {
  const book = await getBook(String(req.params.id));
  const topics = new Set((await db.collection('topics').where('bookId', '==', book.id).get()).docs.map((d) => d.id));
  const haveText = new Set(cachedSections(book.id).map((s) => `${s.chapter}.${s.number}`));
  const sections = (await db.collection(`books/${book.id}/sections`).get()).docs.map((d) => d.data() as LibrarySection);
  sections.sort((a, b) => a.chapter - b.chapter || a.number - b.number);
  const out = [];
  for (const s of sections) {
    const rules = (await db.collection(`books/${book.id}/sections/${s.id}/rules`).get()).docs
      .map((d) => d.data())
      .sort((a, b) => a.order - b.order)
      .map((r) => ({ id: r.id, order: r.order, title: r.title, rule: r.rule, keywords: r.keywords ?? [], isTopic: topics.has(r.id) }));
    out.push({ ...s, units: undefined, rules, canResplit: haveText.has(`${s.chapter}.${s.number}`) });
  }
  return { book, sections: out };
}));

app.patch('/api/admin/books/:id/sections/:sid', route(async (req) => updateSection(db, String(req.params.id), String(req.params.sid), req.body)));
app.delete('/api/admin/books/:id/sections/:sid', route(async (req) => deleteSection(db, String(req.params.id), String(req.params.sid))));
app.post('/api/admin/books/:id/sections/:sid/resplit', route(async (req) => ({
  rules: await resplitSection(db, String(req.params.id), String(req.params.sid)),
})));
app.post('/api/admin/books/:id/sections/:sid/rules', route(async (req) => ({
  rule: await addRule(db, String(req.params.id), String(req.params.sid), req.body),
})));
app.patch('/api/admin/books/:id/sections/:sid/rules/:rid', route(async (req) =>
  updateRule(db, String(req.params.id), String(req.params.sid), String(req.params.rid), req.body)));
app.delete('/api/admin/books/:id/sections/:sid/rules/:rid', route(async (req) =>
  deleteRule(db, String(req.params.id), String(req.params.sid), String(req.params.rid))));

/** What students struggle with: topics by how many students added them. */
app.get('/api/admin/topics', route(async () => {
  const topics = await db.collection('topics').get();
  const out = [];
  for (const t of topics.docs) {
    const [requests, tasks] = await Promise.all([t.ref.collection('requests').get(), t.ref.collection('tasks').count().get()]);
    out.push({
      id: t.id,
      title: t.get('title'),
      grade: t.get('grade'),
      source: `${t.get('bookTitle')} · § ${t.get('sectionNumber')}. ${t.get('sectionTitle')}`,
      students: requests.size,
      requests: requests.docs.map((r) => r.get('text')).filter(Boolean),
      tasks: tasks.data().count,
    });
  }
  return { topics: out.sort((a, b) => b.students - a.students || a.grade - b.grade) };
}));

app.post('/api/admin/catalog/:grade', route(async (req) => ({ rules: await rebuildCatalog(db, Number(req.params.grade)) })));

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status ?? 500).json({ error: err.message });
});

/** Books published before the registry lived in Firestore have no `file`. */
export async function migrate() {
  for (const b of BOOKS) {
    const ref = db.doc(`books/${b.id}`);
    const d = await ref.get();
    if (d.exists && !d.get('file')) await ref.set({ file: b.file }, { merge: true });
  }
}
