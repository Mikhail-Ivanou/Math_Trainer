import '../tasks/task.dart';

const subjectNames = {
  'math': 'Математика',
  'algebra': 'Алгебра',
  'geometry': 'Геометрия',
  'physics': 'Физика',
  'chemistry': 'Химия',
  'biology': 'Биология',
  'informatics': 'Информатика',
  'geography': 'География',
  'astronomy': 'Астрономия',
};

/// One rule of a textbook paragraph as listed in `catalog/grade-{n}`: enough to match a request.
class CatalogRule {
  const CatalogRule({
    required this.id,
    required this.title,
    required this.bookId,
    required this.bookTitle,
    required this.subject,
    required this.chapterTitle,
    required this.sectionId,
    required this.sectionNumber,
    required this.sectionTitle,
    this.keywords = const [],
  });

  final String id;

  /// The rule's name: «Распределительный закон умножения».
  final String title;
  final String bookId;
  final String bookTitle;
  final String subject;
  final String chapterTitle;
  final String sectionId;
  final int sectionNumber;
  final String sectionTitle;
  final List<String> keywords;

  factory CatalogRule.fromJson(Map<String, dynamic> d) => CatalogRule(
        id: d['id'] as String,
        title: d['title'] as String? ?? '',
        bookId: d['bookId'] as String,
        bookTitle: d['bookTitle'] as String? ?? '',
        subject: d['subject'] as String? ?? 'math',
        chapterTitle: d['chapterTitle'] as String? ?? '',
        sectionId: d['sectionId'] as String,
        sectionNumber: (d['sectionNumber'] as num?)?.toInt() ?? 0,
        sectionTitle: d['sectionTitle'] as String? ?? '',
        keywords: [for (final k in (d['keywords'] as List? ?? const [])) '$k'],
      );
}

/// A textbook rule a student added to work on: `topics/{ruleId}`.
class Topic {
  const Topic({
    required this.id,
    required this.title,
    required this.rule,
    required this.grade,
    required this.subject,
    required this.bookId,
    required this.bookTitle,
    required this.chapter,
    required this.chapterTitle,
    required this.sectionId,
    required this.sectionNumber,
    required this.sectionTitle,
    this.createdAt,
  });

  final String id;

  /// The rule's name and its statement with an example.
  final String title;
  final String rule;
  final int grade;
  final String subject;
  final String bookId;
  final String bookTitle;
  final int chapter;
  final String chapterTitle;

  /// The paragraph the rule comes from.
  final String sectionId;
  final int sectionNumber;
  final String sectionTitle;
  final DateTime? createdAt;

  String get subjectName => subjectNames[subject] ?? subject;
  String get source => '§ $sectionNumber. $sectionTitle';

  factory Topic.fromFirestore(String id, Map<String, dynamic> d, {DateTime? createdAt}) => Topic(
        id: id,
        title: d['title'] as String? ?? '',
        rule: d['rule'] as String? ?? '',
        grade: (d['grade'] as num?)?.toInt() ?? 0,
        subject: d['subject'] as String? ?? 'math',
        bookId: d['bookId'] as String? ?? '',
        bookTitle: d['bookTitle'] as String? ?? '',
        chapter: (d['chapter'] as num?)?.toInt() ?? 0,
        chapterTitle: d['chapterTitle'] as String? ?? '',
        sectionId: d['sectionId'] as String? ?? '',
        sectionNumber: (d['sectionNumber'] as num?)?.toInt() ?? 0,
        sectionTitle: d['sectionTitle'] as String? ?? '',
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
