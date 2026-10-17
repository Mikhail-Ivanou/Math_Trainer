import '../tasks/task.dart';

/// One textbook paragraph: `topics/{id}`.
class Topic {
  const Topic({
    required this.id,
    required this.title,
    required this.chapter,
    required this.chapterTitle,
    required this.paragraph,
    required this.theory,
    this.bookPage,
  });

  final String id;
  final String title;
  final int chapter;
  final String chapterTitle;
  final int paragraph;

  /// The paragraph's rules and examples, the context for generating tasks.
  final String theory;
  final int? bookPage;

  factory Topic.fromFirestore(String id, Map<String, dynamic> d) => Topic(
        id: id,
        title: d['title'] as String? ?? '',
        chapter: (d['chapter'] as num?)?.toInt() ?? 0,
        chapterTitle: d['chapterTitle'] as String? ?? '',
        paragraph: (d['paragraph'] as num?)?.toInt() ?? 0,
        theory: d['theory'] as String? ?? '',
        bookPage: (d['bookPage'] as num?)?.toInt(),
      );
}

/// A task as stored in `topics/{topicId}/tasks/{id}`.
class StoredTask {
  const StoredTask({required this.id, required this.task, required this.source, this.createdBy, this.createdAt});

  final String id;
  final MathTask task;

  /// "app" (generated on a phone), "backend" (web / backend) or "book".
  final String source;
  final String? createdBy;
  final DateTime? createdAt;
}
