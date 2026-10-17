import '../tasks/task.dart';

/// One § of a textbook as listed in `catalog/grade-{n}`: enough to match a request.
class CatalogSection {
  const CatalogSection({
    required this.id,
    required this.bookId,
    required this.bookTitle,
    required this.grade,
    required this.subject,
    required this.chapterTitle,
    required this.number,
    required this.title,
    this.keywords = const [],
  });

  final String id;
  final String bookId;
  final String bookTitle;
  final int grade;
  final String subject;
  final String chapterTitle;
  final int number;
  final String title;
  final List<String> keywords;

  factory CatalogSection.fromJson(Map<String, dynamic> d, {String bookTitle = ''}) => CatalogSection(
        id: d['id'] as String,
        bookId: d['bookId'] as String,
        bookTitle: d['bookTitle'] as String? ?? bookTitle,
        grade: (d['grade'] as num).toInt(),
        subject: d['subject'] as String? ?? 'math',
        chapterTitle: d['chapterTitle'] as String? ?? '',
        number: (d['number'] as num?)?.toInt() ?? 0,
        title: d['title'] as String? ?? '',
        keywords: [for (final k in (d['keywords'] as List? ?? const [])) '$k'],
      );
}

/// A textbook section a student added to work on: `topics/{sectionId}`.
class Topic {
  const Topic({
    required this.id,
    required this.bookId,
    required this.grade,
    required this.subject,
    required this.chapter,
    required this.chapterTitle,
    required this.number,
    required this.title,
    required this.rule,
    this.createdAt,
  });

  final String id;
  final String bookId;
  final int grade;
  final String subject;
  final int chapter;
  final String chapterTitle;
  final int number;
  final String title;

  /// The rule sheet of the section: definitions, rules and worked examples.
  final String rule;
  final DateTime? createdAt;

  static const subjectNames = {'math': 'Математика', 'algebra': 'Алгебра', 'geometry': 'Геометрия'};
  String get subjectName => subjectNames[subject] ?? subject;

  factory Topic.fromFirestore(String id, Map<String, dynamic> d, {DateTime? createdAt}) => Topic(
        id: id,
        bookId: d['bookId'] as String? ?? '',
        grade: (d['grade'] as num?)?.toInt() ?? 0,
        subject: d['subject'] as String? ?? 'math',
        chapter: (d['chapter'] as num?)?.toInt() ?? 0,
        chapterTitle: d['chapterTitle'] as String? ?? '',
        number: (d['number'] as num?)?.toInt() ?? 0,
        title: d['title'] as String? ?? '',
        rule: d['rule'] as String? ?? '',
        createdAt: createdAt,
      );
}

/// A task as stored in `topics/{topicId}/tasks/{id}`.
class StoredTask {
  const StoredTask({required this.id, required this.task, required this.source, this.createdBy, this.createdAt});

  final String id;
  final MathTask task;

  /// "app" (generated on a phone) or "backend" (web / backend).
  final String source;
  final String? createdBy;
  final DateTime? createdAt;
}
