import 'package:cloud_firestore/cloud_firestore.dart';

import '../tasks/task.dart';
import 'models.dart';

/// Everything the app reads and writes in Firestore (see firebase/firestore.rules).
class Repository {
  Repository({FirebaseFirestore? db}) : _db = db ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  CollectionReference<Map<String, dynamic>> _tasks(String topicId) => _db.collection('topics/$topicId/tasks');
  CollectionReference<Map<String, dynamic>> _progress(String uid) => _db.collection('users/$uid/progress');

  static String progressId(String topicId, String taskId) => '${topicId}__$taskId';

  Stream<List<Topic>> topics() => _db
      .collection('topics')
      .orderBy('order')
      .snapshots()
      .map((s) => s.docs.map((d) => Topic.fromFirestore(d.id, d.data())).toList());

  /// Newest first; documents that don't parse are skipped rather than breaking the list.
  Stream<List<StoredTask>> tasks(String topicId) =>
      _tasks(topicId).orderBy('createdAt', descending: true).snapshots().map((s) => [
            for (final d in s.docs) ?_parse(d),
          ]);

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
}
