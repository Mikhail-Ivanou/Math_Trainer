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

  test('similar topic: same rule name in another paragraph of the same grade', () {
    Topic topic(String id, String title, int grade) => Topic(
          id: id, title: title, rule: '', grade: grade, subject: 'math', bookId: 'b', bookTitle: '', chapter: 1,
          chapterTitle: '', sectionId: 's', sectionNumber: 9, sectionTitle: 'Умножение');
    const rule = CatalogRule(
      id: 'math5-1-c2-p16-r03', title: 'Распределительный закон умножения', bookId: 'math5-1', bookTitle: '',
      subject: 'math', chapterTitle: '', sectionId: 'math5-1-c2-p16', sectionNumber: 16, sectionTitle: 'Выражения');
    final existing = {
      'math5-1-c1-p09-r04': topic('math5-1-c1-p09-r04', 'Распределительный  закон умножения.', 5),
      'math6-x': topic('math6-x', 'Распределительный закон умножения', 6),
    };
    expect(Repository.similarTopic(rule, 5, existing)?.id, 'math5-1-c1-p09-r04');
    expect(Repository.similarTopic(rule, 7, existing), isNull);
  });
}
