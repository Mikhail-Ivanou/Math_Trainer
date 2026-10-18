import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Rational } from '../src/tasks/rational.js';
import { counts, userPrompt } from '../src/tasks/generator.js';
import { evaluate, parseTask, verifyTask } from '../src/tasks/verifier.js';

const r = (s: string) => Rational.parse(s);
const task = (j: Record<string, unknown>) => parseTask({ difficulty: 'easy', ...j });
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('Rational.parse: integers, decimals, fractions, negatives', () => {
  assert.ok(r('12 450').equals(Rational.of(12450)));
  assert.ok(r('2,5').equals(r('5/2')));
  assert.ok(r('-0.75').equals(r('-3/4')));
  assert.equal(r('−7/3').toString(), '-7/3');
  assert.throws(() => r('много'));
  assert.throws(() => r('1/0'));
});

test('evaluate: grades 5–7', () => {
  assert.ok(evaluate('40 000 − (18 779 + 6 221)').equals(r('15000')));
  assert.ok(evaluate('0,1 + 0,2').equals(r('0.3')));
  assert.ok(evaluate('3/4 + 1/6').equals(r('11/12')));
  assert.ok(evaluate('7 : 2').equals(r('3.5')));
  const v = { a: r('2'), b: r('-3'), x: r('1/2') };
  assert.ok(evaluate('(a+b)^2', v).equals(r('1')));
  assert.ok(evaluate('a²b', v).equals(r('-12')));
  assert.ok(evaluate('3(x-2)+1', v).equals(r('-7/2')));
  assert.throws(() => evaluate('(1 + 2'));
  assert.throws(() => evaluate('y + 1'));
});

test('verifyTask: each type, right and wrong', () => {
  assert.equal(verifyTask(task({ type: 'expression', question: 'Вычислите: 2,5 + 3/4', expr: '2.5+3/4', answer: '13/4' })), null);
  assert.match(verifyTask(task({ type: 'expression', question: 'Вычислите: 15 000 – (2 500 + 5 000) + 1 200', expr: '15000-(2500+5000)+1200', answer: '11700' }))!, /8700/);
  assert.notEqual(verifyTask(task({ type: 'expression', question: 'Вычислите значение выражения.', expr: '305+47', answer: '352' })), null);
  assert.equal(verifyTask(task({ type: 'equation', question: '3x − 4 = −11', equation: '3x-4=-11', variable: 'x', answer: '-7/3' })), null);
  assert.equal(verifyTask(task({ type: 'simplify', question: '(a+b)²', expr: '(a+b)^2', answer: 'a^2+2ab+b^2' }), rnd), null);
  assert.notEqual(verifyTask(task({ type: 'simplify', question: '(a+b)²', expr: '(a+b)^2', answer: 'a^2+b^2' }), rnd), null);
  assert.equal(verifyTask(task({ type: 'word', question: '24 конфеты', solution_expr: '(24 + 4) : 2', answer: '14' })), null);
  assert.throws(() => task({ type: 'proof', question: 'q', answer: '1' }));
});

test('generator prompt and counts follow the level', () => {
  assert.deepEqual(counts('math', 'expert'), { expression: 2, equation: 2, word: 2 });
  assert.match(userPrompt({ topicTitle: 't', rule: 'r', grade: 5, level: 'expert' }), /олимпиадного[\s\S]*"expert"/);
});
