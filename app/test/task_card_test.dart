import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:math/data/models.dart';
import 'package:math/tasks/task.dart';
import 'package:math/topic_screen.dart';

void main() {
  testWidgets('task card hides the answer until asked and reports solved', (tester) async {
    final marks = <bool>[];
    const stored = StoredTask(
      id: 't1',
      source: 'app',
      task: MathTask(
        type: TaskType.word,
        difficulty: Difficulty.medium,
        question: 'В двух вазах 24 конфеты…',
        answer: 12450,
        unit: 'конфет',
      ),
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: TaskCard(stored: stored, solved: false, onSolved: marks.add)),
    ));

    expect(find.text('В двух вазах 24 конфеты…'), findsOneWidget);
    expect(find.text('задача · средне'), findsOneWidget);
    expect(find.text('12 450 конфет'), findsNothing);

    await tester.tap(find.text('Показать ответ'));
    await tester.pump();
    expect(find.text('12 450 конфет'), findsOneWidget);

    await tester.tap(find.byType(Checkbox));
    expect(marks, [true]);
  });
}
