import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

let env;

const SECTION = {
  id: 'math6-c2-p01',
  bookId: 'math6',
  grade: 6,
  subject: 'math',
  chapter: 2,
  chapterTitle: 'Проценты и пропорции',
  number: 1,
  title: 'Проценты',
  rule: '• Процент — сотая часть числа: 1 % = 1/100.',
  keywords: ['проценты'],
};

const RULE = {
  id: 'math6-c2-p01-r02',
  order: 2,
  title: 'Нахождение процентов от числа',
  rule: 'Чтобы найти p % от числа a, нужно a · p : 100. Пример: 20 % от 50 = 10.',
  keywords: ['процент от числа'],
  bookId: 'math6',
  bookTitle: 'Математика. 6 класс',
  grade: 6,
  subject: 'math',
  chapter: 2,
  chapterTitle: 'Проценты и пропорции',
  sectionId: SECTION.id,
  sectionNumber: 1,
  sectionTitle: 'Проценты',
};
const TOPIC_ID = RULE.id;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-math-trainer',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
  });
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'books/math6'), { title: 'Математика. 6 класс', grade: 6 });
    await setDoc(doc(db, `books/math6/sections/${SECTION.id}`), SECTION);
    await setDoc(doc(db, `books/math6/sections/${SECTION.id}/rules/${RULE.id}`), RULE);
    await setDoc(doc(db, 'catalog/grade-6'), { grade: 6, sections: [SECTION] });
    await setDoc(doc(db, 'topics/math5-1-c1-p08'), { title: 'Сложение и вычитание натуральных чисел' });
    await setDoc(doc(db, 'topics/math5-1-c1-p08/tasks/book-1'), { question: '37 – 0', answer: '37', source: 'backend' });
  });
});

const kid = () => env.authenticatedContext('kid').firestore();
const other = () => env.authenticatedContext('other').firestore();
const anon = () => env.unauthenticatedContext().firestore();

const topicFor = (over = {}) => {
  const { id, keywords, order, ...fields } = RULE;
  return { ...fields, createdBy: 'kid', createdAt: serverTimestamp(), ...over };
};

const appTask = (over = {}) => ({
  type: 'expression',
  difficulty: 'easy',
  question: 'Вычислите: 4 500 + 1 275',
  expr: '4500+1275',
  answer: '5775',
  source: 'app',
  createdBy: 'kid',
  createdAt: serverTimestamp(),
  model: 'claude-haiku-5.5',
  ...over,
});

describe('library', () => {
  test('signed-in users read books, sections and the catalog; nobody writes', async () => {
    await assertSucceeds(getDoc(doc(kid(), 'books/math6')));
    await assertSucceeds(getDoc(doc(kid(), `books/math6/sections/${SECTION.id}`)));
    await assertSucceeds(getDoc(doc(kid(), `books/math6/sections/${SECTION.id}/rules/${RULE.id}`)));
    await assertFails(setDoc(doc(kid(), `books/math6/sections/${SECTION.id}/rules/x`), RULE));
    await assertSucceeds(getDoc(doc(kid(), 'catalog/grade-6')));
    await assertFails(getDoc(doc(anon(), 'catalog/grade-6')));
    await assertFails(setDoc(doc(kid(), 'catalog/grade-6'), { grade: 6 }));
    await assertFails(setDoc(doc(kid(), `books/math6/sections/x`), SECTION));
  });
});

describe('topics', () => {
  test('a student adds a textbook rule as a topic, with the reason', async () => {
    const db = kid();
    const batch = writeBatch(db);
    batch.set(doc(db, `topics/${TOPIC_ID}`), topicFor());
    batch.set(doc(db, `topics/${TOPIC_ID}/requests/kid`), { text: 'не понимаю проценты', createdAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(doc(other(), `topics/${TOPIC_ID}`)));
  });

  test('another student joins an existing topic with their own request only', async () => {
    await assertSucceeds(setDoc(doc(kid(), `topics/${TOPIC_ID}`), topicFor()));
    await assertSucceeds(setDoc(doc(other(), `topics/${TOPIC_ID}/requests/other`), { text: 'проценты', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(other(), `topics/${TOPIC_ID}/requests/kid`), { text: 'x', createdAt: serverTimestamp() }));
    await assertFails(getDoc(doc(other(), `topics/${TOPIC_ID}/requests/kid`)));
    await assertFails(setDoc(doc(other(), `topics/${TOPIC_ID}`), topicFor({ createdBy: 'other' }))); // no overwrite
  });

  test('topics must match a real rule exactly', async () => {
    await assertFails(setDoc(doc(kid(), 'topics/made-up'), topicFor()));
    await assertFails(setDoc(doc(kid(), `topics/${TOPIC_ID}`), topicFor({ sectionId: 'other-section' })));
    await assertFails(setDoc(doc(kid(), `topics/${SECTION.id}`), topicFor())); // a whole § is not a topic
    await assertFails(setDoc(doc(kid(), `topics/${TOPIC_ID}`), topicFor({ title: 'Моя тема' })));
    await assertFails(setDoc(doc(kid(), `topics/${TOPIC_ID}`), topicFor({ rule: 'другое правило' })));
    await assertFails(setDoc(doc(kid(), `topics/${TOPIC_ID}`), topicFor({ grade: 7 })));
    await assertFails(setDoc(doc(kid(), `topics/${TOPIC_ID}`), topicFor({ createdBy: 'other' })));
    await assertFails(setDoc(doc(kid(), `topics/${TOPIC_ID}`), topicFor({ extra: 1 })));
    await assertFails(setDoc(doc(anon(), `topics/${TOPIC_ID}`), topicFor()));
  });

  test('requests need the topic and a short text', async () => {
    await assertFails(setDoc(doc(kid(), 'topics/nope/requests/kid'), { text: 'x', createdAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(kid(), `topics/${TOPIC_ID}`), topicFor()));
    await assertFails(setDoc(doc(kid(), `topics/${TOPIC_ID}/requests/kid`), { text: 'x'.repeat(501), createdAt: serverTimestamp() }));
  });

  test('topics are never changed or deleted by clients', async () => {
    await assertFails(updateDoc(doc(kid(), 'topics/math5-1-c1-p08'), { title: 'x' }));
    await assertFails(deleteDoc(doc(kid(), 'topics/math5-1-c1-p08')));
  });
});

describe('shared tasks', () => {
  const tasks = (db, topic = 'math5-1-c1-p08') => collection(db, `topics/${topic}/tasks`);

  test('a signed-in user adds well-formed tasks under their uid', async () => {
    await assertSucceeds(addDoc(tasks(kid()), appTask()));
    await assertSucceeds(addDoc(tasks(kid()), appTask({ answer: '-3/4' })));
    await assertSucceeds(addDoc(tasks(kid()), appTask({ type: 'simplify', expr: '2a+3a', answer: '5a' })));
    const { expr, ...rest } = appTask();
    await assertSucceeds(addDoc(tasks(kid()), { ...rest, type: 'word', solution_expr: '(24+4):2', answer: '14', unit: 'конфет' }));
  });

  test('anonymous, impersonated or fake-backend tasks are refused', async () => {
    await assertFails(addDoc(tasks(anon()), appTask()));
    await assertFails(addDoc(tasks(other()), appTask()));
    await assertFails(addDoc(tasks(kid()), appTask({ source: 'backend' })));
    await assertFails(addDoc(tasks(kid()), appTask({ createdAt: new Date(0) })));
  });

  test('malformed tasks are refused', async () => {
    await assertFails(addDoc(tasks(kid()), appTask({ answer: 5775 })));
    await assertFails(addDoc(tasks(kid()), appTask({ answer: '' })));
    await assertFails(addDoc(tasks(kid()), appTask({ type: 'essay' })));
    await assertFails(addDoc(tasks(kid()), appTask({ question: 'x'.repeat(1001) })));
    await assertFails(addDoc(tasks(kid()), appTask({ solved: true })));
  });

  test('tasks only go under existing topics and are never changed', async () => {
    await assertFails(addDoc(tasks(kid(), 'no-such-topic'), appTask()));
    await assertFails(updateDoc(doc(kid(), 'topics/math5-1-c1-p08/tasks/book-1'), { answer: '1' }));
    await assertFails(deleteDoc(doc(kid(), 'topics/math5-1-c1-p08/tasks/book-1')));
    await assertSucceeds(getDoc(doc(other(), 'topics/math5-1-c1-p08/tasks/book-1')));
  });
});

describe('users and progress', () => {
  const mark = (over = {}) => ({ topicId: 'math5-1-c1-p08', taskId: 'book-1', solved: true, updatedAt: serverTimestamp(), ...over });

  test('owner manages own profile and progress', async () => {
    await assertSucceeds(setDoc(doc(kid(), 'users/kid'), { grade: 6 }));
    await assertSucceeds(setDoc(doc(kid(), 'users/kid/progress/a__b'), mark()));
    await assertSucceeds(setDoc(doc(kid(), 'users/kid/progress/a__b'), mark({ solved: false })));
    await assertSucceeds(deleteDoc(doc(kid(), 'users/kid/progress/a__b')));
  });

  test("nobody touches someone else's data; marks have a fixed shape", async () => {
    await assertFails(getDoc(doc(other(), 'users/kid')));
    await assertFails(setDoc(doc(other(), 'users/kid/progress/x'), mark()));
    await assertFails(setDoc(doc(kid(), 'users/kid/progress/x'), mark({ solved: 'yes' })));
    await assertFails(setDoc(doc(kid(), 'users/kid/progress/x'), mark({ score: 100 })));
  });
});
