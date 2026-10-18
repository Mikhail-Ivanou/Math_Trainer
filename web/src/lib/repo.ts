/** Firestore reads and writes of the website — the same as app/lib/data/repository.dart. */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { CatalogRule, Difficulty, MathTask, StoredTask, Topic } from './models';

const LEVEL_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
const TYPE_ORDER = ['expression', 'equation', 'word', 'simplify'];

export function compareTopics(a: Topic, b: Topic) {
  return a.grade - b.grade || a.subject.localeCompare(b.subject) || a.bookId.localeCompare(b.bookId) ||
    a.chapter - b.chapter || a.sectionNumber - b.sectionNumber || a.id.localeCompare(b.id);
}

export function watchTopics(cb: (topics: Topic[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'topics'),
    (s) => cb(s.docs.map((d) => ({ ...(d.data() as Topic), id: d.id })).sort(compareTopics)),
    onError,
  );
}

export async function getTopic(id: string): Promise<Topic | null> {
  const d = await getDoc(doc(db, 'topics', id));
  return d.exists() ? { ...(d.data() as Topic), id: d.id } : null;
}

/** Grades that have a published catalog (books are added in the admin page). */
export async function grades(): Promise<number[]> {
  const ids = (await getDocs(collection(db, 'catalog'))).docs.map((d) => Number(d.id.replace('grade-', '')));
  return ids.filter((g) => g > 0).sort((a, b) => a - b);
}

export async function catalog(grade: number): Promise<CatalogRule[]> {
  return ((await getDoc(doc(db, 'catalog', `grade-${grade}`))).data()?.rules ?? []) as CatalogRule[];
}

export async function existingTopics(): Promise<Map<string, Topic>> {
  return new Map((await getDocs(collection(db, 'topics'))).docs.map((d) => [d.id, { ...(d.data() as Topic), id: d.id }]));
}

/** Same rule name from another § of the grade («похожая есть»). */
export function similarTopic(r: CatalogRule, grade: number, existing: Map<string, Topic>): Topic | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return [...existing.values()].find((t) => t.id !== r.id && t.grade === grade && norm(t.title) === norm(r.title));
}

const TOPIC_FIELDS = ['bookId', 'bookTitle', 'sectionId', 'grade', 'subject', 'chapter', 'chapterTitle', 'sectionNumber', 'sectionTitle', 'title', 'rule'];

/** Adds a textbook rule as a topic (or joins it) and records why this student needs it. */
export async function addTopic(r: CatalogRule, uid: string, reason: string): Promise<Topic> {
  const ruleRef = doc(db, 'books', r.bookId, 'sections', r.sectionId, 'rules', r.id);
  const topicRef = doc(db, 'topics', r.id);
  return runTransaction(db, async (tx) => {
    const existing = await tx.get(topicRef);
    let fields: Record<string, unknown>;
    if (existing.exists()) {
      fields = existing.data();
    } else {
      const rule = (await tx.get(ruleRef)).data();
      if (!rule) throw new Error(`правило ${r.id} не найдено`);
      fields = Object.fromEntries(TOPIC_FIELDS.map((k) => [k, rule[k]]));
      tx.set(topicRef, { ...fields, createdBy: uid, createdAt: serverTimestamp() });
    }
    tx.set(doc(topicRef, 'requests', uid), { text: reason.trim(), createdAt: serverTimestamp() });
    return { ...(fields as unknown as Topic), id: r.id };
  });
}

export async function sectionSheet(t: Topic): Promise<string> {
  return ((await getDoc(doc(db, 'books', t.bookId, 'sections', t.sectionId))).data()?.rule as string) ?? '';
}

/** Newest batch first, easy to hard inside a batch (a batch shares one server timestamp). */
export function sortTasks(tasks: StoredTask[]) {
  return tasks.sort((a, b) =>
    (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) ||
    LEVEL_ORDER.indexOf(a.difficulty) - LEVEL_ORDER.indexOf(b.difficulty) ||
    TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
    a.id.localeCompare(b.id));
}

export function watchTasks(topicId: string, cb: (tasks: StoredTask[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    query(collection(db, 'topics', topicId, 'tasks'), orderBy('createdAt', 'desc')),
    (s) =>
      cb(sortTasks(
        s.docs
          .map((d) => {
            const x = d.data();
            return { ...(x as MathTask), id: d.id, source: x.source ?? 'backend', createdAt: (x.createdAt as Timestamp | undefined)?.toDate() };
          })
          .filter((t) => t.question && t.answer !== undefined)
          .map((t) => ({ ...t, answer: String(t.answer) })),
      )),
    onError,
  );
}

export function watchSolved(uid: string, topicId: string, cb: (ids: Set<string>) => void) {
  return onSnapshot(
    query(collection(db, 'users', uid, 'progress'), where('topicId', '==', topicId), where('solved', '==', true)),
    (s) => cb(new Set(s.docs.map((d) => d.data().taskId as string))),
  );
}

export function setSolved(uid: string, topicId: string, taskId: string, solved: boolean) {
  return setDoc(doc(db, 'users', uid, 'progress', `${topicId}__${taskId}`), { topicId, taskId, solved, updatedAt: serverTimestamp() });
}

export async function addGeneratedTasks(topicId: string, tasks: MathTask[], uid: string, model: string) {
  const batch = writeBatch(db);
  for (const t of tasks) {
    batch.set(doc(collection(db, 'topics', topicId, 'tasks')), { ...t, source: 'app', createdBy: uid, model, createdAt: serverTimestamp() });
  }
  await batch.commit();
}

export async function prefs(uid: string): Promise<{ grade?: number; hideSolved?: boolean }> {
  return ((await getDoc(doc(db, 'users', uid))).data() ?? {}) as { grade?: number; hideSolved?: boolean };
}

export function savePref(uid: string, p: { grade?: number; hideSolved?: boolean }) {
  return setDoc(doc(db, 'users', uid), p, { merge: true });
}
