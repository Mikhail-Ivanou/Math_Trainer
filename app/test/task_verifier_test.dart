import 'package:flutter_test/flutter_test.dart';

import 'package:math/tasks/task.dart';
import 'package:math/tasks/task_verifier.dart';

MathTask task(Map<String, dynamic> json) => MathTask.fromJson({'difficulty': 'easy', ...json});

void main() {
  group('evaluate', () {
    test('natural-number arithmetic with brackets and separators', () {
      expect(evaluate('1 234 + 5 678'), 6912);
      expect(evaluate('40 000 − (18 779 + 6 221)'), 15000);
      expect(evaluate('(652+59300)+48'), 60000);
      expect(evaluate('12 · 5 : 4'), 15);
    });

    test('rejects what grade 5 part 1 does not have', () {
      expect(() => evaluate('5 - 7'), throwsFormatException);
      expect(() => evaluate('7 : 2'), throwsFormatException);
      expect(() => evaluate('2 ^ 3'), throwsFormatException);
      expect(() => evaluate('(1 + 2'), throwsFormatException);
    });
  });

  test('expression: correct answer passes, wrong one is rejected', () {
    final good = task({'type': 'expression', 'question': 'Вычислите: 9 081 + 15 700 + 919', 'expr': '9081+15700+919', 'answer': 25700});
    expect(verifyTask(good).ok, isTrue);
    final bad = task({'type': 'expression', 'question': 'Вычислите: 15 000 – (2 500 + 5 000) + 1 200', 'expr': '15000-(2500+5000)+1200', 'answer': 11700});
    expect(verifyTask(bad).reason, contains('8700'));
  });

  test('expression must be visible in the question', () {
    // qwen3.7-flash / gpt-5.4-mini did this in the benchmark.
    final hidden = task({'type': 'expression', 'question': 'Вычислите значение выражения.', 'expr': '305+47', 'answer': 352});
    expect(verifyTask(hidden).ok, isFalse);
  });

  test('equation: substitutes the answer', () {
    final good = task({'type': 'equation', 'question': '1 523 – y = 852', 'equation': '1 523 – y = 852', 'variable': 'y', 'answer': 671});
    expect(verifyTask(good).ok, isTrue);
    final bad = task({'type': 'equation', 'question': 'a – 75 = 98', 'equation': 'a – 75 = 98', 'variable': 'a', 'answer': 23});
    expect(verifyTask(bad).ok, isFalse);
  });

  test('word problem: checks the solution expression', () {
    final good = task({
      'type': 'word',
      'question': 'В двух вазах 24 конфеты. Во второй на 4 меньше. Сколько в первой?',
      'solution_expr': '(24 + 4) : 2',
      'answer': 14,
      'unit': 'конфет',
    });
    expect(verifyTask(good).ok, isTrue);
    final bad = task({'type': 'word', 'question': '130 кг в двух мешках…', 'solution_expr': '(130-18):2', 'answer': 74});
    expect(verifyTask(bad).ok, isFalse);
  });

  test('fromJson rejects broken tasks', () {
    expect(() => MathTask.fromJson({'type': 'expression', 'difficulty': 'easy', 'question': 'q', 'answer': 'много'}), throwsFormatException);
    expect(() => MathTask.fromJson({'type': 'proof', 'difficulty': 'easy', 'question': 'q', 'answer': 1}), throwsFormatException);
    expect(MathTask.fromJson({'type': 'word', 'difficulty': 'hard', 'question': 'q', 'answer': '12 450'}).answer, 12450);
  });
}
