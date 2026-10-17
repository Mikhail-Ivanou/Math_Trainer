import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';

let env;

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
    await setDoc(doc(db, 'books/math5-1'), { title: 'Математика. 5 класс. Часть 1' });
    await setDoc(doc(db, 'topics/math5-1-p08'), { title: 'Сложение и вычитание натуральных чисел' });
    await setDoc(doc(db, 'topics/math5-1-p08/tasks/book-1'), { question: '37 – 0', answer: 37, source: 'backend' });
  });
});

const kid = () => env.authenticatedContext('kid').firestore();
const other = () => env.authenticatedContext('other').firestore();
const anon = () => env.unauthenticatedContext().firestore();

const appTask = (over = {}) => ({
  type: 'expression',
  difficulty: 'easy',
  question: 'Вычислите: 4 500 + 1 275',
  expr: '4500+1275',
  answer: 5775,
  source: 'app',
  createdBy: 'kid',
  createdAt: serverTimestamp(),
  model: 'claude-haiku-5.5',
  ...over,
});

describe('books and topics', () => {
  test('signed-in users read, nobody writes', async () => {
    await assertSucceeds(getDoc(doc(kid(), 'topics/math5-1-p08')));
    await assertSucceeds(getDoc(doc(kid(), 'books/math5-1')));
    await assertFails(getDoc(doc(anon(), 'topics/math5-1-p08')));
    await assertFails(setDoc(doc(kid(), 'topics/new'), { title: 'x' }));
    await assertFails(updateDoc(doc(kid(), 'topics/math5-1-p08'), { title: 'x' }));
  });
});

describe('shared tasks', () => {
  const tasks = (db, topic = 'math5-1-p08') => collection(db, `topics/${topic}/tasks`);

  test('a signed-in user adds a well-formed task under their uid', async () => {
    await assertSucceeds(addDoc(tasks(kid()), appTask()));
  });

  test('word task with unit is accepted', async () => {
    const { expr, ...rest } = appTask();
    await assertSucceeds(addDoc(tasks(kid()), { ...rest, type: 'word', solution_expr: '(24+4):2', answer: 14, unit: 'конфет' }));
  });

  test('anonymous, impersonated or fake-backend tasks are refused', async () => {
    await assertFails(addDoc(tasks(anon()), appTask()));
    await assertFails(addDoc(tasks(other()), appTask()));                       // createdBy is not the caller
    await assertFails(addDoc(tasks(kid()), appTask({ source: 'backend' })));
    await assertFails(addDoc(tasks(kid()), appTask({ createdAt: new Date(0) })));
  });

  test('malformed tasks are refused', async () => {
    await assertFails(addDoc(tasks(kid()), appTask({ answer: -1 })));
    await assertFails(addDoc(tasks(kid()), appTask({ answer: 1.5 })));
    await assertFails(addDoc(tasks(kid()), appTask({ answer: '5775' })));
    await assertFails(addDoc(tasks(kid()), appTask({ type: 'essay' })));
    await assertFails(addDoc(tasks(kid()), appTask({ question: 'x'.repeat(1001) })));
    await assertFails(addDoc(tasks(kid()), appTask({ solved: true })));         // unknown field
  });

  test('tasks only go under existing topics', async () => {
    await assertFails(addDoc(tasks(kid(), 'no-such-topic'), appTask()));
  });

  test('tasks are never changed or deleted by clients', async () => {
    const ref = 'topics/math5-1-p08/tasks/app-1';
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), ref), { ...appTask(), createdAt: new Date() }));
    await assertSucceeds(getDoc(doc(kid(), ref)));
    await assertFails(updateDoc(doc(kid(), ref), { answer: 1 }));
    await assertFails(deleteDoc(doc(kid(), ref)));
    await assertFails(deleteDoc(doc(kid(), 'topics/math5-1-p08/tasks/book-1')));
  });

  test('everyone signed in reads all tasks', async () => {
    await assertSucceeds(getDoc(doc(other(), 'topics/math5-1-p08/tasks/book-1')));
  });
});

describe('users and progress', () => {
  const mark = (over = {}) => ({ topicId: 'math5-1-p08', taskId: 'book-1', solved: true, updatedAt: serverTimestamp(), ...over });

  test('owner manages own profile and progress', async () => {
    await assertSucceeds(setDoc(doc(kid(), 'users/kid'), { displayName: 'Ученик' }));
    await assertSucceeds(setDoc(doc(kid(), 'users/kid/progress/math5-1-p08__book-1'), mark()));
    await assertSucceeds(setDoc(doc(kid(), 'users/kid/progress/math5-1-p08__book-1'), mark({ solved: false })));
    await assertSucceeds(getDoc(doc(kid(), 'users/kid/progress/math5-1-p08__book-1')));
    await assertSucceeds(deleteDoc(doc(kid(), 'users/kid/progress/math5-1-p08__book-1')));
  });

  test("nobody touches someone else's data", async () => {
    await assertFails(getDoc(doc(other(), 'users/kid')));
    await assertFails(setDoc(doc(other(), 'users/kid/progress/x'), mark()));
    await assertFails(getDoc(doc(anon(), 'users/kid/progress/x')));
  });

  test('progress marks have a fixed shape', async () => {
    await assertFails(setDoc(doc(kid(), 'users/kid/progress/x'), mark({ solved: 'yes' })));
    await assertFails(setDoc(doc(kid(), 'users/kid/progress/x'), mark({ score: 100 })));
  });
});
