import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalize, parseToc, splitTopics, stripPage } from '../src/book/topics.js';

const toc = `151
Содержание
Как работать с учебным пособием ..............................    3
Глава  1.  Натуральные  числа
    § 1.  Как решать задачу ......................................  10
    § 2.  Натуральные числа и число нуль. Чтение и запись
 натуральных чисел ..................................... 12
Итоговая самооценка ........................................14
Глава  2.  Выражения.  Уравнения
§ 3.  Числовые
 выражения ...................................15
Ответы
 ...................................................16`;

// Fake book: running headers, watermark, a wrapped heading, a chapter end.
const pages = [
  'Глава 1. Натуральные числа\n4\nКак работать с учебным пособием',
  '§ 1.  Как решать задачу\n10\n§  1.    Как  решать  задачу\nТекст\tправила  про  вели-\nчины.\n Правообладатель Адукацыя i выхаванне',
  'Глава 1. Натуральные числа\n11\nРешаем вместе\n1.  Найдите  89   587  +  16   814.\nа)\n первое',
  '§ 2.  Натуральные числа и число нуль. Чтение и запись натуральных чисел\n12\n§  2.    Натуральные  числа  и  число  нуль.\nЧтение и запись натуральных чисел\nТеория 2.\nРешаем вместе\n2. Задача.\nИтоговая самооценка\nВопросы главы',
  'Глава 2. Выражения. Уравнения\n15\n§  3.  Числовые  выражения\nТеория 3.\nОтветы\n1. 106 401',
  toc,
];

test('stripPage removes the running header and the watermark', () => {
  assert.equal(stripPage(pages[1]).trim(), '§  1.    Как  решать  задачу\nТекст\tправила  про  вели-\nчины.');
  assert.equal(stripPage('Обычная строка\nещё одна'), 'Обычная строка\nещё одна');
});

test('normalize fixes spacing, hyphenation and thousands separators', () => {
  assert.equal(normalize('вы-\nчитания  ве\n-\nличин  ре -\nзультата  Рос   -\nсии  дей-\n\nствия'), 'вычитания величин результата России действия');
  assert.equal(normalize('89   587 + 16   814'), '89 587 + 16 814');
  assert.equal(normalize('а)\n об одной'), 'а) об одной');
});

test('parseToc reads titles, chapters and pages', () => {
  assert.deepEqual(parseToc(pages), [
    { chapter: 1, chapterTitle: 'Натуральные числа', paragraph: 1, title: 'Как решать задачу', bookPage: 10 },
    { chapter: 1, chapterTitle: 'Натуральные числа', paragraph: 2, title: 'Натуральные числа и число нуль. Чтение и запись натуральных чисел', bookPage: 12 },
    { chapter: 2, chapterTitle: 'Выражения. Уравнения', paragraph: 3, title: 'Числовые выражения', bookPage: 15 },
  ]);
});

test('splitTopics cuts theory and exercises per paragraph', () => {
  const [p1, p2, p3] = splitTopics(pages);
  assert.equal(p1.theory, 'Текст правила про величины.');
  assert.equal(p1.exercises, '1. Найдите 89 587 + 16 814.\nа) первое');
  assert.deepEqual(p1.pdfPages, [2, 3]);
  // wrapped heading dropped, chapter ends at «Итоговая самооценка»
  assert.equal(p2.theory, 'Теория 2.');
  assert.equal(p2.exercises, '2. Задача.');
  assert.deepEqual(p2.pdfPages, [4, 4]);
  // last paragraph ends at «Ответы»
  assert.equal(p3.theory, 'Теория 3.');
  assert.equal(p3.chapter, 2);
});
