import 'package:cloud_firestore/cloud_firestore.dart';

import '../tasks/task.dart';
import 'models.dart';

/// Everything the app reads and writes in Firestore (see firebase/firestore.rules).
class Repository {
  Repository({FirebaseFirestore? db}) : _db = db ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  static const grades = [5, 6, 7];

  CollectionReference<Map<String, dynamic>> _tasks(String topicId) => _db.collection('topics/$topicId/tasks');
  CollectionReference<Map<String, dynamic>> _progress(String uid) => _db.collection('users/$uid/progress');

  static String progressId(String topicId, String taskId) => '${topicId}__$taskId';

  /// All textbook sections of a grade (one small document).
  Future<List<CatalogSection>> catalog(int grade) async {
    final d = await _db.doc('catalog/grade-$grade').get();
    return [
      for (final s in (d.data()?['sections'] as List? ?? const []))
        CatalogSection.fromJson(Map<String, dynamic>.from(s as Map)),
    ];
  }

  /// Topics students added, by grade, then subject, chapter and paragraph.
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
      a.number.compareTo(b.number),
    ]) {
      if (c != 0) return c;
    }
    return 0;
  }

  Future<Set<String>> existingTopicIds() async =>
      {for (final d in (await _db.collection('topics').get()).docs) d.id};

  /// Adds a textbook section as a topic (or joins it if someone already added
  /// it) and records why this student needs it.
  Future<Topic> addTopic(CatalogSection section, {required String uid, required String reason}) async {
    final sectionRef = _db.doc('books/${section.bookId}/sections/${section.id}');
    final topicRef = _db.doc('topics/${section.id}');
    final requestRef = topicRef.collection('requests').doc(uid);
    return _db.runTransaction((tx) async {
      final existing = await tx.get(topicRef);
      final Map<String, dynamic> fields;
      if (existing.exists) {
        fields = existing.data()!;
      } else {
        final s = (await tx.get(sectionRef)).data() ?? (throw StateError('раздел ${section.id} не найден'));
        fields = {
          for (final k in const ['bookId', 'grade', 'subject', 'chapter', 'chapterTitle', 'number', 'title', 'rule']) k: s[k],
        };
        tx.set(topicRef, {...fields, 'sectionId': section.id, 'createdBy': uid, 'createdAt': FieldValue.serverTimestamp()});
      }
      tx.set(requestRef, {'text': reason.trim(), 'createdAt': FieldValue.serverTimestamp()});
      return Topic.fromFirestore(section.id, fields);
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
}
