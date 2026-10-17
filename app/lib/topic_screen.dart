import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'data/models.dart';
import 'data/repository.dart';
import 'llm/aiai_client.dart';
import 'tasks/task.dart';
import 'tasks/task_generator.dart';

/// Tasks of one topic: answers, "solved" marks and generating new ones.
class TopicScreen extends StatefulWidget {
  const TopicScreen({super.key, required this.topic, required this.user, required this.repo, required this.generator});

  final Topic topic;
  final User user;
  final Repository repo;

  /// Null when the app was built without an aiai.by key.
  final TaskGenerator? generator;

  @override
  State<TopicScreen> createState() => _TopicScreenState();
}

class _TopicScreenState extends State<TopicScreen> {
  late final Stream<List<StoredTask>> _tasks = widget.repo.tasks(widget.topic.id);
  late final Stream<Set<String>> _solved = widget.repo.solvedTaskIds(widget.user.uid, widget.topic.id);
  bool _generating = false;

  Future<void> _generate() async {
    final generator = widget.generator!;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _generating = true);
    try {
      final result = await generator.generate(GenerationRequest(topicTitle: widget.topic.title, excerpt: widget.topic.theory));
      if (result.tasks.isEmpty) {
        messenger.showSnackBar(const SnackBar(content: Text('Модель не дала ни одного верного задания, попробуйте ещё раз')));
        return;
      }
      await widget.repo.addGeneratedTasks(widget.topic.id, result.tasks, uid: widget.user.uid, model: result.model);
      final skipped = result.rejected.isEmpty ? '' : ' (отброшено с ошибками: ${result.rejected.length})';
      messenger.showSnackBar(SnackBar(content: Text('Добавлено заданий: ${result.tasks.length}$skipped')));
    } on LlmException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } on Exception catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Не удалось сохранить задания: $e')));
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  void _showTheory() => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (context) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.7,
          builder: (context, scroll) => SingleChildScrollView(
            controller: scroll,
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
            child: SelectableText(widget.topic.theory),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final t = widget.topic;
    return Scaffold(
      appBar: AppBar(
        title: Text('§ ${t.paragraph}. ${t.title}', maxLines: 2, overflow: TextOverflow.ellipsis),
        actions: [IconButton(tooltip: 'Теория', icon: const Icon(Icons.menu_book_outlined), onPressed: _showTheory)],
      ),
      floatingActionButton: widget.generator == null
          ? null
          : FloatingActionButton.extended(
              onPressed: _generating ? null : _generate,
              icon: _generating
                  ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.auto_awesome),
              label: Text(_generating ? 'Генерирую…' : 'Новые задания'),
            ),
      body: StreamBuilder<List<StoredTask>>(
        stream: _tasks,
        builder: (context, tasksSnap) => StreamBuilder<Set<String>>(
          stream: _solved,
          builder: (context, solvedSnap) {
            if (tasksSnap.hasError) return Center(child: Text('Ошибка загрузки: ${tasksSnap.error}'));
            if (!tasksSnap.hasData) return const Center(child: CircularProgressIndicator());
            final tasks = tasksSnap.data!;
            final solved = solvedSnap.data ?? const <String>{};
            if (tasks.isEmpty) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    widget.generator == null
                        ? 'Заданий пока нет'
                        : 'Заданий пока нет. Нажмите «Новые задания», чтобы составить их по теме.',
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            }
            final done = tasks.where((s) => solved.contains(s.id)).length;
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 96),
              itemCount: tasks.length + 1,
              itemBuilder: (context, i) => i == 0
                  ? Padding(
                      padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
                      child: Text('Решено $done из ${tasks.length}', style: Theme.of(context).textTheme.labelLarge),
                    )
                  : TaskCard(
                      key: ValueKey(tasks[i - 1].id),
                      stored: tasks[i - 1],
                      solved: solved.contains(tasks[i - 1].id),
                      onSolved: (v) => widget.repo.setSolved(widget.user.uid, t.id, tasks[i - 1].id, v),
                    ),
            );
          },
        ),
      ),
    );
  }
}

class TaskCard extends StatefulWidget {
  const TaskCard({super.key, required this.stored, required this.solved, required this.onSolved});

  final StoredTask stored;
  final bool solved;
  final ValueChanged<bool> onSolved;

  @override
  State<TaskCard> createState() => _TaskCardState();
}

class _TaskCardState extends State<TaskCard> {
  bool _showAnswer = false;

  static const _difficulty = {Difficulty.easy: 'легко', Difficulty.medium: 'средне', Difficulty.hard: 'сложно'};
  static const _type = {TaskType.expression: 'вычисли', TaskType.equation: 'уравнение', TaskType.word: 'задача'};

  @override
  Widget build(BuildContext context) {
    final task = widget.stored.task;
    final theme = Theme.of(context);
    final answer = '${_formatNumber(task.answer)}${task.unit == null ? '' : ' ${task.unit}'}';
    return Card(
      color: widget.solved ? theme.colorScheme.secondaryContainer.withValues(alpha: 0.5) : null,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(
                child: Text('${_type[task.type]} · ${_difficulty[task.difficulty]}', style: theme.textTheme.labelMedium),
              ),
              Checkbox(value: widget.solved, onChanged: (v) => widget.onSolved(v ?? false)),
            ]),
            Text(task.question, style: theme.textTheme.bodyLarge),
            Row(children: [
              TextButton(
                onPressed: () => setState(() => _showAnswer = !_showAnswer),
                child: Text(_showAnswer ? 'Скрыть ответ' : 'Показать ответ'),
              ),
              if (_showAnswer) Text(answer, style: theme.textTheme.titleMedium),
            ]),
          ],
        ),
      ),
    );
  }
}

/// 12450 -> "12 450", as the textbook writes numbers.
String _formatNumber(int n) {
  final s = n.toString();
  final out = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) out.write(' ');
    out.write(s[i]);
  }
  return out.toString();
}
