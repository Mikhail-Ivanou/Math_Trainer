import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'data/models.dart';
import 'data/repository.dart';
import 'tasks/task_generator.dart';
import 'topic_screen.dart';
import 'topics/add_topic_screen.dart';
import 'topics/topic_matcher.dart';

/// Topics students added, grouped by grade. «Добавить тему» finds a new one in the textbooks.
class HomeScreen extends StatelessWidget {
  const HomeScreen({
    super.key,
    required this.user,
    required this.repo,
    required this.generator,
    required this.matcher,
    required this.onSignOut,
  });

  final User user;
  final Repository repo;
  final TaskGenerator? generator;
  final TopicMatcher? matcher;
  final Future<void> Function() onSignOut;

  void _open(BuildContext context, Topic t) => Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => TopicScreen(topic: t, user: user, repo: repo, generator: generator),
      ));

  Future<void> _add(BuildContext context) async {
    final topic = await Navigator.of(context).push<Topic>(MaterialPageRoute(
      builder: (_) => AddTopicScreen(user: user, repo: repo, matcher: matcher),
    ));
    if (topic != null && context.mounted) _open(context, topic);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Math Trainer'),
        actions: [IconButton(tooltip: 'Выйти', icon: const Icon(Icons.logout), onPressed: onSignOut)],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _add(context),
        icon: const Icon(Icons.add),
        label: const Text('Добавить тему'),
      ),
      body: StreamBuilder<List<Topic>>(
        stream: repo.topics(),
        builder: (context, snap) {
          if (snap.hasError) return _Message('Не удалось загрузить темы: ${snap.error}');
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final topics = snap.data!;
          if (topics.isEmpty) {
            return const _Message('Тем пока нет.\nНажмите «Добавить тему» и напишите, что даётся трудно — '
                'найдём это в учебнике и составим задания.');
          }
          final rows = <Widget>[];
          int? grade;
          for (final t in topics) {
            if (t.grade != grade) {
              grade = t.grade;
              rows.add(Padding(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 4),
                child: Text('$grade класс', style: theme.textTheme.titleMedium),
              ));
            }
            rows.add(ListTile(
              leading: CircleAvatar(child: Text('${t.number}')),
              title: Text(t.title),
              subtitle: Text('${t.subjectName} · ${t.chapterTitle}'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _open(context, t),
            ));
          }
          rows.add(const SizedBox(height: 96));
          return ListView(children: rows);
        },
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message(this.text);
  final String text;

  @override
  Widget build(BuildContext context) =>
      Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(text, textAlign: TextAlign.center)));
}
