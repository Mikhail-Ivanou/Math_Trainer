import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'data/models.dart';
import 'data/repository.dart';
import 'tasks/task_generator.dart';
import 'topic_screen.dart';

/// The list of textbook topics, grouped by chapter.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.user, required this.repo, required this.generator, required this.onSignOut});

  final User user;
  final Repository repo;
  final TaskGenerator? generator;
  final Future<void> Function() onSignOut;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Математика · 5 класс'),
        actions: [IconButton(tooltip: 'Выйти', icon: const Icon(Icons.logout), onPressed: onSignOut)],
      ),
      body: StreamBuilder<List<Topic>>(
        stream: repo.topics(),
        builder: (context, snap) {
          if (snap.hasError) return _Message('Не удалось загрузить темы: ${snap.error}');
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final topics = snap.data!;
          if (topics.isEmpty) return const _Message('Темы ещё не опубликованы');
          final rows = <Widget>[];
          int? chapter;
          for (final t in topics) {
            if (t.chapter != chapter) {
              chapter = t.chapter;
              rows.add(Padding(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 4),
                child: Text('Глава ${t.chapter}. ${t.chapterTitle}', style: Theme.of(context).textTheme.titleSmall),
              ));
            }
            rows.add(ListTile(
              leading: CircleAvatar(child: Text('${t.paragraph}')),
              title: Text(t.title),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                builder: (_) => TopicScreen(topic: t, user: user, repo: repo, generator: generator),
              )),
            ));
          }
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
