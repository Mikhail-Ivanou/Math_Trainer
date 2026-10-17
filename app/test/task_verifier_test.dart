import 'dart:math';

import 'package:flutter_test/flutter_test.dart';

import 'package:math/tasks/rational.dart';
import 'package:math/tasks/task.dart';
import 'package:math/tasks/task_verifier.dart';

MathTask task(Map<String, dynamic> json) => MathTask.fromJson({'difficulty': 'easy', ...json});

Rational r(String s) => Rational.parse(s);

void main() {
  group('Rational.parse', () {
    test('integers, decimals, fractions, negatives', () {
      expect(r('12 450'), Rational.fromInt(12450));
      expect(r('2,5'), r('5/2'));
      expect(r('-0.75'), r('-3/4'));
      expect(r('−7/3').toString(), '-7/3');
      expect(r('6/8'), r('3/4'));
    });

    test('rejects what is not a number', () {
      expect(() => r('много'), throwsFormatException);
      expect(() => r('2 1/3'.replaceAll(' ', 'x')), throwsFormatException);
      expect(() => r('1/0'), throwsFormatException);
    });
  });

  group('evaluate', () {
    test('grade 5 arithmetic with brackets and separators', () {
      expect(evaluate('1 234 + 5 678'), r('6912'));
      expect(evaluate('40 000 − (18 779 + 6 221)'), r('15000'));
      expect(evaluate('12 · 5 : 4'), r('15'));
    });

    test('grade 6: decimals, fractions, negatives', () {
      expect(evaluate('0,1 + 0,2'), r('0.3'));
      expect(evaluate('3/4 + 1/6'), r('11/12'));
      expect(evaluate('-5 - (-8) * 2'), r('11'));
      expect(evaluate('7 : 2'), r('3.5'));
    });

    test('grade 7: variables, powers, implicit multiplication', () {
      final v = {'a': r('2'), 'b': r('-3'), 'x': r('1/2')};
      expect(evaluate('2a + 3b', vars: v), r('-5'));
      expect(evaluate('(a+b)^2', vars: v), r('1'));
      expect(evaluate('a²b', vars: v), r('-12'));
      expect(evaluate('3(x-2)+1', vars: v), r('-7/2'));
      expect(evaluate('2^-2'), r('1/4'));
    });

    test('rejects malformed input', () {
      expect(() => evaluate('(1 + 2'), throwsFormatException);
      expect(() => evaluate('2 ** 3'), throwsFormatException);
      expect(() => evaluate('y + 1'), throwsFormatException); // unknown variable
      expect(() => evaluate('5 : 0'), throwsFormatException);
    });
  });

  test('expression: correct answer passes, wrong one is rejected', () {
    final good = task({'type': 'expression', 'question': 'Вычислите: 2,5 + 3/4', 'expr': '2.5+3/4', 'answer': '13/4'});
    expect(verifyTask(good).ok, isTrue);
    final decimal = task({'type': 'expression', 'question': 'Вычислите: 2,5 + 3/4', 'expr': '2.5+3/4', 'answer': '3.25'});
    expect(verifyTask(decimal).ok, isTrue);
    final bad = task({'type': 'expression', 'question': 'Вычислите: 15 000 – (2 500 + 5 000) + 1 200', 'expr': '15000-(2500+5000)+1200', 'answer': '11700'});
    expect(verifyTask(bad).reason, contains('8700'));
  });

  test('expression must be visible in the question', () {
    final hidden = task({'type': 'expression', 'question': 'Вычислите значение выражения.', 'expr': '305+47', 'answer': '352'});
    expect(verifyTask(hidden).ok, isFalse);
  });

  test('equation: substitutes the answer, fractions and negatives too', () {
    expect(verifyTask(task({'type': 'equation', 'question': '1 523 – y = 852', 'equation': '1 523 – y = 852', 'variable': 'y', 'answer': '671'})).ok, isTrue);
    expect(verifyTask(task({'type': 'equation', 'question': '3x − 4 = −11', 'equation': '3x-4=-11', 'variable': 'x', 'answer': '-7/3'})).ok, isTrue);
    expect(verifyTask(task({'type': 'equation', 'question': 'a – 75 = 98', 'equation': 'a – 75 = 98', 'variable': 'a', 'answer': '23'})).ok, isFalse);
  });

  test('simplify: identity is checked at random points', () {
    final rnd = Random(1);
    expect(verifyTask(task({'type': 'simplify', 'question': 'Упростите: (a+b)²', 'expr': '(a+b)^2', 'answer': 'a^2+2ab+b^2'}), random: rnd).ok, isTrue);
    expect(verifyTask(task({'type': 'simplify', 'question': 'Упростите: 2a + 3a − b', 'expr': '2a+3a-b', 'answer': '5a-b'}), random: rnd).ok, isTrue);
    expect(verifyTask(task({'type': 'simplify', 'question': 'Упростите: (a+b)²', 'expr': '(a+b)^2', 'answer': 'a^2+b^2'}), random: rnd).ok, isFalse);
  });

  test('word problem: checks the solution expression', () {
    expect(verifyTask(task({'type': 'word', 'question': '24 конфеты…', 'solution_expr': '(24 + 4) : 2', 'answer': '14', 'unit': 'конфет'})).ok, isTrue);
    expect(verifyTask(task({'type': 'word', 'question': '130 кг…', 'solution_expr': '(130-18):2', 'answer': '74'})).ok, isFalse);
  });

  test('fromJson keeps answers as text and rejects broken tasks', () {
    expect(MathTask.fromJson({'type': 'word', 'difficulty': 'hard', 'question': 'q', 'answer': 12450}).answer, '12450');
    expect(() => MathTask.fromJson({'type': 'proof', 'difficulty': 'easy', 'question': 'q', 'answer': '1'}), throwsFormatException);
    expect(() => MathTask.fromJson({'type': 'word', 'difficulty': 'easy', 'question': 'q'}), throwsFormatException);
  });
}
