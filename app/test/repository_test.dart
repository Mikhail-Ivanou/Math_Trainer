import 'package:flutter_test/flutter_test.dart';

import 'package:math/data/models.dart';
import 'package:math/data/repository.dart';
import 'package:math/tasks/task.dart';

StoredTask t(String id, DateTime at, Difficulty d, TaskType type) => StoredTask(
      id: id,
      source: 'app',
      createdAt: at,
      task: MathTask(type: type, difficulty: d, question: id, answer: '1'),
    );

void main() {
  test('newest batch first, easy to hard inside a batch', () {
    final old = DateTime(2026, 10, 17, 10), fresh = DateTime(2026, 10, 17, 11);
    final sorted = Repository.sortTasks([
      t('old-easy', old, Difficulty.easy, TaskType.expression),
      t('new-hard', fresh, Difficulty.hard, TaskType.expression),
      t('new-easy-word', fresh, Difficulty.easy, TaskType.word),
      t('new-easy-expr', fresh, Difficulty.easy, TaskType.expression),
      t('new-medium', fresh, Difficulty.medium, TaskType.equation),
    ]);
    expect(sorted.map((s) => s.id), ['new-easy-expr', 'new-easy-word', 'new-medium', 'new-hard', 'old-easy']);
  });
}
