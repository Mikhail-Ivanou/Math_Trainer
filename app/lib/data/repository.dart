import 'package:cloud_firestore/cloud_firestore.dart';

import '../tasks/task.dart';
import 'models.dart';

/// Everything the app reads and writes in Firestore (see firebase/firestore.rules).
class Repository {
  Repository({FirebaseFirestore? db}) : _db = db ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  /// Grades that have a published catalog (books are added in the admin page).
  Future<List<int>> grades() async {
    final s = await _db.collection('catalog').get();
    return [for (final d in s.docs) ?int.tryParse(d.id.replaceFirst('grade-', ''))]..sort();
  }

  CollectionReference<Map<String, dynamic>> _tasks(String topicId) => _db.collection('topics/$topicId/tasks');
  CollectionReference<Map<String, dynamic>> _progress(String uid) => _db.collection('users/$uid/progress');

  static String progressId(String topicId, String taskId) => '${topicId}__$taskId';

  /// All textbook rules of a grade (one document).
  Future<List<CatalogRule>> catalog(int grade) async {
    final d = await _db.doc('catalog/grade-$grade').get();
    return [
      for (final r in (d.data()?['rules'] as List? ?? const [])) CatalogRule.fromJson(Map<String, dynamic>.from(r as Map)),
    ];
  }

  /// Topics students added, by grade, then subject, book, chapter, paragraph and rule.
  Stream<List<Topic>> topics() => _db.collection('topics').snapshots().map((s) {
        final list = [
          for (final d in s.docs)
            Topic.fromFirestore(d.id, d.data(), createdAt: (d.data()['createdAt'] as Timestamp?)?.toDate()),
        ];
        return list..sort(compareTopics);
      });

  static int compareTopics(Topic a, Topic b) {
    for (final c in [
      a.grade.compareTo(b.grade),
      a.subject.compareTo(b.subject),
      a.bookId.compareTo(b.bookId),
      a.chapter.compareTo(b.chapter),
      a.sectionNumber.compareTo(b.sectionNumber),
      a.id.compareTo(b.id), // rule ids end with their order in the paragraph
    ]) {
      if (c != 0) return c;
    }
    return 0;
  }

  /// Topics already added, by id.
  Future<Map<String, Topic>> existingTopics() async => {
        for (final d in (await _db.collection('topics').get()).docs) d.id: Topic.fromFirestore(d.id, d.data()),
      };

  /// An existing topic of the same grade with the same rule name from another
  /// paragraph («Распределительный закон умножения» is in three grade 5 ones).
  static Topic? similarTopic(CatalogRule r, int grade, Map<String, Topic> existing) {
    String norm(String s) => s.toLowerCase().replaceAll('ё', 'е').replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), ' ').trim();
    final title = norm(r.title);
    for (final t in existing.values) {
      if (t.id != r.id && t.grade == grade && norm(t.title) == title) return t;
    }
    return null;
  }

  /// The paragraph's whole rule sheet, as background for a topic.
  Future<String> sectionSheet(Topic t) async =>
      (await _db.doc('books/${t.bookId}/sections/${t.sectionId}').get()).data()?['rule'] as String? ?? '';

  static const _topicFields = [
    'bookId', 'bookTitle', 'sectionId', 'grade', 'subject', 'chapter', 'chapterTitle', //
    'sectionNumber', 'sectionTitle', 'title', 'rule',
  ];

  /// Adds a textbook rule as a topic (or joins it if someone already added
  /// it) and records why this student needs it.
  Future<Topic> addTopic(CatalogRule r, {required String uid, required String reason}) async {
    final ruleRef = _db.doc('books/${r.bookId}/sections/${r.sectionId}/rules/${r.id}');
    final topicRef = _db.doc('topics/${r.id}');
    final requestRef = topicRef.collection('requests').doc(uid);
    return _db.runTransaction((tx) async {
      final existing = await tx.get(topicRef);
      final Map<String, dynamic> fields;
      if (existing.exists) {
        fields = existing.data()!;
      } else {
        final rule = (await tx.get(ruleRef)).data() ?? (throw StateError('правило ${r.id} не найдено'));
        fields = {for (final k in _topicFields) k: rule[k]};
        tx.set(topicRef, {...fields, 'createdBy': uid, 'createdAt': FieldValue.serverTimestamp()});
      }
      tx.set(requestRef, {'text': reason.trim(), 'createdAt': FieldValue.serverTimestamp()});
      return Topic.fromFirestore(r.id, fields);
    });
  }

  /// Newest batch first, easy to hard inside a batch (a batch shares one server
  /// timestamp). Documents that don't parse are skipped rather than breaking the list.
  Stream<List<StoredTask>> tasks(String topicId) =>
      _tasks(topicId).orderBy('createdAt', descending: true).snapshots().map((s) => sortTasks([
            for (final d in s.docs) ?_parse(d),
          ]));

  static List<StoredTask> sortTasks(List<StoredTask> tasks) => tasks
    ..sort((a, b) {
      final byTime = (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0));
      if (byTime != 0) return byTime;
      final byDifficulty = a.task.difficulty.index.compareTo(b.task.difficulty.index);
      if (byDifficulty != 0) return byDifficulty;
      final byType = a.task.type.index.compareTo(b.task.type.index);
      return byType != 0 ? byType : a.id.compareTo(b.id);
    });

  StoredTask? _parse(QueryDocumentSnapshot<Map<String, dynamic>> d) {
    final data = d.data();
    try {
      return StoredTask(
        id: d.id,
        task: MathTask.fromJson(data),
        source: data['source'] as String? ?? 'backend',
        createdBy: data['createdBy'] as String?,
        createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
      );
    } on FormatException {
      return null;
    }
  }

  /// Ids of the tasks in [topicId] this user marked as solved.
  Stream<Set<String>> solvedTaskIds(String uid, String topicId) => _progress(uid)
      .where('topicId', isEqualTo: topicId)
      .where('solved', isEqualTo: true)
      .snapshots()
      .map((s) => {for (final d in s.docs) d.data()['taskId'] as String});

  Future<void> setSolved(String uid, String topicId, String taskId, bool solved) =>
      _progress(uid).doc(progressId(topicId, taskId)).set({
        'topicId': topicId,
        'taskId': taskId,
        'solved': solved,
        'updatedAt': FieldValue.serverTimestamp(),
      });

  /// Adds tasks generated on this phone to the shared list of the topic.
  Future<void> addGeneratedTasks(String topicId, List<MathTask> tasks, {required String uid, required String model}) async {
    final batch = _db.batch();
    for (final t in tasks) {
      batch.set(_tasks(topicId).doc(), {
        ...t.toJson(),
        'source': 'app',
        'createdBy': uid,
        'model': model,
        'createdAt': FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  /// The grade this student picked last time (users/{uid}.grade).
  Future<int?> lastGrade(String uid) async => ((await _db.doc('users/$uid').get()).data()?['grade'] as num?)?.toInt();

  Future<void> saveGrade(String uid, int grade) => _db.doc('users/$uid').set({'grade': grade}, SetOptions(merge: true));

  /// Whether this student hides solved tasks (users/{uid}.hideSolved).
  Future<bool> hideSolved(String uid) async => (await _db.doc('users/$uid').get()).data()?['hideSolved'] == true;

  Future<void> saveHideSolved(String uid, bool hide) =>
      _db.doc('users/$uid').set({'hideSolved': hide}, SetOptions(merge: true));
}
