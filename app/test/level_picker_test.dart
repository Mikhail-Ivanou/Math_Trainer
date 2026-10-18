import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:math/tasks/task.dart';
import 'package:math/tasks/task_generator.dart';
import 'package:math/topic_screen.dart';

void main() {
  testWidgets('level picker offers medium, hard and the hardest, returns the choice', (tester) async {
    Difficulty? picked;
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () async => picked = await showModalBottomSheet<Difficulty>(
              context: context,
              builder: (_) => const LevelPicker(initial: Difficulty.medium),
            ),
            child: const Text('open'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('Уровень заданий'), findsOneWidget);
    expect(find.text('Лёгкий'), findsNothing);
    for (final l in [Difficulty.medium, Difficulty.hard, Difficulty.expert]) {
      expect(find.text(levelNames[l]!), findsOneWidget);
    }

    await tester.tap(find.text('Максимальный'));
    await tester.pump();
    await tester.tap(find.text('Составить задания'));
    await tester.pumpAndSettle();
    expect(picked, Difficulty.expert);
  });

  test('every task of a batch gets the chosen level, harder levels get fewer tasks', () {
    int total(GenerationRequest r) => r.counts.values.fold(0, (a, b) => a + b);
    const base = GenerationRequest(topicTitle: 't', rule: 'r', grade: 5);
    expect(total(base), 8);
    expect(total(const GenerationRequest(topicTitle: 't', rule: 'r', grade: 5, level: Difficulty.expert)), 6);
    expect(TaskGenerator.userPrompt(const GenerationRequest(topicTitle: 't', rule: 'r', grade: 5, level: Difficulty.expert)),
        allOf(contains('олимпиадного'), contains('"expert"')));
  });
}
