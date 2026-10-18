import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:math/data/models.dart';
import 'package:math/tasks/task.dart';
import 'package:math/tasks/topic_pdf.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('PDF of unsolved tasks renders Cyrillic, powers and signs', () async {
    const topic = Topic(
      id: 'algebra7-c2-p12-r01',
      title: 'Квадрат суммы двух выражений',
      rule: '(a + b)² = a² + 2ab + b²',
      grade: 7,
      subject: 'algebra',
      bookId: 'algebra7',
      bookTitle: 'Алгебра. 7 класс',
      chapter: 2,
      chapterTitle: 'Выражения и их преобразования',
      sectionId: 'algebra7-c2-p12',
      sectionNumber: 12,
      sectionTitle: 'Формулы сокращенного умножения',
    );
    final tasks = [
      for (final (i, q) in [
        'Вычислите удобным способом: 1 001² + 2 · 1 001 · 999 + 999²',
        'Упростите выражение: (3x + y)² − 2(3x + y)(3x − y) + (3x − y)²',
        'Сумма двух натуральных чисел равна 40, а сумма их квадратов равна 1 000. Найдите произведение этих чисел.',
      ].indexed)
        StoredTask(
          id: 't$i',
          source: 'app',
          task: MathTask(type: TaskType.expression, difficulty: Difficulty.expert, question: q, answer: ['4000000', '4y^2', '300'][i]),
        ),
    ];
    final bytes = await buildTopicPdf(topic, tasks, answerText: (t) => t.answer);
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    // For a look by eye: PDF_OUT=/tmp/x.pdf flutter test test/topic_pdf_test.dart
    final out = Platform.environment['PDF_OUT'];
    if (out != null) File(out).writeAsBytesSync(bytes);
  });
}
