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
  // The paragraph's whole rule sheet: background for generation and «Весь параграф».
  late final Future<String> _sectionSheet = widget.repo.sectionSheet(widget.topic).catchError((_) => '');

  Future<void> _generate() async {
    final generator = widget.generator!;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _generating = true);
    try {
      final t = widget.topic;
      final result = await generator.generate(GenerationRequest(
        topicTitle: t.title,
        rule: t.rule,
        context: await _sectionSheet,
        grade: t.grade,
        subject: t.subject,
      ));
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
          builder: (context, scroll) => _RuleSheet(topic: widget.topic, sectionSheet: _sectionSheet, scroll: scroll),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final t = widget.topic;
    return Scaffold(
      appBar: AppBar(
        title: Text(t.title, maxLines: 2, overflow: TextOverflow.ellipsis),
        actions: [IconButton(tooltip: 'Правило', icon: const Icon(Icons.menu_book_outlined), onPressed: _showTheory)],
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

/// The rule, its source, and on request the whole paragraph's rule sheet.
class _RuleSheet extends StatefulWidget {
  const _RuleSheet({required this.topic, required this.sectionSheet, required this.scroll});

  final Topic topic;
  final Future<String> sectionSheet;
  final ScrollController scroll;

  @override
  State<_RuleSheet> createState() => _RuleSheetState();
}

class _RuleSheetState extends State<_RuleSheet> {
  bool _showSection = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = widget.topic;
    return ListView(
      controller: widget.scroll,
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
      children: [
        Text(t.title, style: theme.textTheme.titleLarge),
        const SizedBox(height: 4),
        Text('${t.bookTitle} · ${t.source}', style: theme.textTheme.bodySmall),
        const SizedBox(height: 16),
        SelectableText(t.rule, style: theme.textTheme.bodyLarge),
        const SizedBox(height: 16),
        if (!_showSection)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() => _showSection = true),
              icon: const Icon(Icons.expand_more),
              label: const Text('Весь параграф'),
            ),
          )
        else
          FutureBuilder<String>(
            future: widget.sectionSheet,
            builder: (context, snap) => snap.hasData
                ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Divider(),
                    Text(t.source, style: theme.textTheme.titleSmall),
                    const SizedBox(height: 8),
                    SelectableText(snap.data!.isEmpty ? 'Не удалось загрузить параграф' : snap.data!),
                  ])
                : const Center(child: CircularProgressIndicator()),
          ),
      ],
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
  static const _type = {
    TaskType.expression: 'вычисли',
    TaskType.equation: 'уравнение',
    TaskType.word: 'задача',
    TaskType.simplify: 'упрости',
  };

  @override
  Widget build(BuildContext context) {
    final task = widget.stored.task;
    final theme = Theme.of(context);
    final answer = '${_formatAnswer(task.answer)}${task.unit == null ? '' : ' ${task.unit}'}';
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

const _superscripts = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻'};

/// "x^2+2*a*b-1" -> "x² + 2·a·b − 1", as the textbook writes expressions.
String formatExpression(String e) {
  var s = e.replaceAll(' ', '').replaceAllMapped(RegExp(r'\^(-?\d+)'), (m) => m[1]!.split('').map((c) => _superscripts[c]!).join());
  s = s.replaceAll('*', '·').replaceAll('/', ' : ');
  // Spaces around binary + and −; a sign at the start or after "(" stays unary.
  s = s.replaceAllMapped(RegExp(r'(?<=[^(\s])([+-])'), (m) => ' ${m[1] == '-' ? '−' : '+'} ');
  return s.replaceAll('-', '−');
}

/// How the textbook writes answers: "12450" -> "12 450", "2.5" -> "2,5", "-7/3" -> "−7/3".
String _formatAnswer(String answer) {
  final m = RegExp(r'^(-?)(\d+)([.,]\d+)?(/\d+)?$').firstMatch(answer.trim());
  if (m == null) return formatExpression(answer);
  final digits = m[2]!;
  final out = StringBuffer(m[1]!.isEmpty ? '' : '−');
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write('\u202f');
    out.write(digits[i]);
  }
  out.write((m[3] ?? '').replaceAll('.', ','));
  out.write(m[4] ?? '');
  return out.toString();
}
