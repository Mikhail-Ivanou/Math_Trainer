import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findTocPages, normalize, sliceSections, stripPage, type TocEntry } from '../src/book/structure.js';

test('stripPage drops the page number with its «Глава» header and the watermark, keeps a § heading', () => {
  assert.equal(stripPage('35\nГлава I. Начальные понятия\n    § 5.  Угол\nТекст').trim(), '§ 5.  Угол\nТекст'.replace('§', '    §').trim());
  assert.equal(stripPage('Глава 1. Натуральные числа\n4\nТекст').trim(), 'Текст');
  // grade 6 puts the real heading right under the page number
  assert.equal(stripPage('5\n§  1.  Десятичная  запись  дробей.\nТекст').split('\n')[0], '§  1.  Десятичная  запись  дробей.');
  assert.equal(stripPage('Текст\n Правообладатель Народная асвета').trim(), 'Текст');
});

test('normalize fixes hyphenation, list letters and thousands separators', () => {
  assert.equal(normalize('вы-\nчитания  ве\n-\nличин  Рос   -\nсии  дей-\n\nствия'), 'вычитания величин России действия');
  assert.equal(normalize('89   587 + 16   814'), '89 587 + 16 814');
  assert.equal(normalize('а)\n об одной'), 'а) об одной');
});

const toc = (n: number) => `Содержание\nГлава 1. ДРОБИ\n§ 1. Дроби .... 3\n§ 2. Сравнение ... ${n}\nГлава 2. ПРОЦЕНТЫ\n§ 1. Проценты ... 9`;

// Fake grade 6 book: § numbers restart in chapter 2, a no-break space after §,
// a running § header inside a section, a chapter-end test block.
const pages = [
  'Обложка',
  '3\n§  1.  Дроби\nТеория дробей.',
  '§ 1. Дроби\n4\nЕщё теория.', // running header above the page number
  '5\n§ 2.  Сравнение  дробей\nСравниваем.\nТест для самопроверки\nВопросы',
  '9\nГлава 2. Проценты\n§  1.  Проценты\nПроцент — сотая часть.',
  'Ответы\n1. 2',
  ...Array.from({ length: 10 }, () => 'пусто'),
  toc(5),
];
const entries: TocEntry[] = [
  { chapter: 1, chapterTitle: 'Дроби', number: 1, title: 'Дроби' },
  { chapter: 1, chapterTitle: 'Дроби', number: 2, title: 'Сравнение дробей' },
  { chapter: 2, chapterTitle: 'Проценты', number: 1, title: 'Проценты' },
];

test('findTocPages finds the contents at the end of the book', () => {
  assert.deepEqual(findTocPages(pages), [pages.length - 1]);
});

test('sliceSections follows the TOC order across restarting § numbers', () => {
  const [a, b, c] = sliceSections(pages, entries);
  assert.match(a.text, /^§ 1\. Дроби\nТеория дробей\.\n+Ещё теория\.$/); // running header removed
  assert.deepEqual(a.pdfPages, [2, 3]);
  assert.equal(b.text, '§ 2. Сравнение дробей\nСравниваем.'); // cut at the test block
  assert.equal(c.chapter, 2);
  assert.equal(c.text, '§ 1. Проценты\nПроцент — сотая часть.'); // ends before «Ответы»
});
