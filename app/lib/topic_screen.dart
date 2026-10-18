import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'data/models.dart';
import 'data/repository.dart';
import 'llm/aiai_client.dart';
import 'tasks/task.dart';
import 'tasks/task_generator.dart';
import 'tasks/topic_pdf.dart';

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
  Difficulty _level = Difficulty.medium;
  bool _hideSolved = false;
  // The latest snapshot of the lists below, for «PDF».
  List<StoredTask> _lastTasks = const [];
  Set<String> _lastSolved = const {};
  bool _sharing = false;

  Future<void> _sharePdf(BuildContext buttonContext) async {
    final messenger = ScaffoldMessenger.of(context);
    final unsolved = _lastTasks.where((s) => !_lastSolved.contains(s.id)).toList();
    if (unsolved.isEmpty) {
      messenger.showSnackBar(const SnackBar(content: Text('Нерешённых заданий нет')));
      return;
    }
    final box = buttonContext.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    setState(() => _sharing = true);
    try {
      final bytes = await buildTopicPdf(widget.topic, unsolved,
          answerText: (t) => '${formatAnswer(t.answer)}${t.unit == null ? '' : ' ${t.unit}'}');
      await shareTopicPdf(widget.topic, bytes, origin: origin);
    } on Exception catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Не удалось подготовить PDF: $e')));
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  void initState() {
    super.initState();
    // The choice is kept in users/{uid}, so it holds across topics and launches.
    widget.repo.hideSolved(widget.user.uid).then((v) {
      if (mounted) setState(() => _hideSolved = v);
    }, onError: (_) {});
  }

  void _toggleHideSolved(bool v) {
    setState(() => _hideSolved = v);
    widget.repo.saveHideSolved(widget.user.uid, v);
  }
  // The paragraph's whole rule sheet: background for generation and «Весь параграф».
  late final Future<String> _sectionSheet = widget.repo.sectionSheet(widget.topic).catchError((_) => '');

  /// Asks for the level, then generates a batch of that level.
  Future<void> _generate() async {
    final level = await showModalBottomSheet<Difficulty>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true, // as tall as its content, scrolls on small screens
      builder: (context) => LevelPicker(initial: _level),
    );
    if (level == null || !mounted) return;
    setState(() => _level = level);
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
        level: level,
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
        actions: [
          Builder(
            builder: (buttonContext) => IconButton(
              tooltip: 'PDF с нерешёнными заданиями',
              icon: _sharing
                  ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.picture_as_pdf_outlined),
              onPressed: _sharing ? null : () => _sharePdf(buttonContext),
            ),
          ),
          IconButton(tooltip: 'Правило', icon: const Icon(Icons.menu_book_outlined), onPressed: _showTheory),
        ],
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
            _lastTasks = tasks;
            _lastSolved = solved;
            final done = tasks.where((s) => solved.contains(s.id)).length;
            final shown = _hideSolved ? tasks.where((s) => !solved.contains(s.id)).toList() : tasks;
            final header = Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 0, 4),
              child: Row(children: [
                Expanded(child: Text('Решено $done из ${tasks.length}', style: Theme.of(context).textTheme.labelLarge)),
                FilterChip(
                  label: const Text('Скрыть решённые'),
                  selected: _hideSolved,
                  onSelected: _toggleHideSolved,
                ),
              ]),
            );
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 96),
              itemCount: shown.length + (shown.isEmpty ? 2 : 1),
              itemBuilder: (context, i) => i == 0
                  ? header
                  : shown.isEmpty
                      ? Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                            widget.generator == null
                                ? 'Все задания решены!'
                                : 'Все задания решены! Нажмите «Новые задания», чтобы получить ещё.',
                            textAlign: TextAlign.center,
                          ),
                        )
                      : TaskCard(
                          key: ValueKey(shown[i - 1].id),
                          stored: shown[i - 1],
                          solved: solved.contains(shown[i - 1].id),
                          onSolved: (v) => widget.repo.setSolved(widget.user.uid, t.id, shown[i - 1].id, v),
                        ),
            );
          },
        ),
      ),
    );
  }
}

/// Level choice for a new batch: medium, hard or the hardest.
class LevelPicker extends StatefulWidget {
  const LevelPicker({super.key, required this.initial});

  final Difficulty initial;

  @override
  State<LevelPicker> createState() => _LevelPickerState();
}

class _LevelPickerState extends State<LevelPicker> {
  late Difficulty _level = widget.initial;

  static const _levels = [Difficulty.medium, Difficulty.hard, Difficulty.expert];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Уровень заданий', style: theme.textTheme.titleLarge),
            const SizedBox(height: 8),
            RadioGroup<Difficulty>(
              groupValue: _level,
              onChanged: (v) => setState(() => _level = v ?? _level),
              child: Column(children: [
                for (final l in _levels)
                  RadioListTile<Difficulty>(
                    contentPadding: EdgeInsets.zero,
                    value: l,
                    title: Text(levelNames[l]!),
                    subtitle: Text(levelHints[l]!),
                  ),
              ]),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: () => Navigator.pop(context, _level),
              icon: const Icon(Icons.auto_awesome),
              label: const Text('Составить задания'),
            ),
          ],
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

  static const _difficulty = {
    Difficulty.easy: 'легко',
    Difficulty.medium: 'средне',
    Difficulty.hard: 'сложно',
    Difficulty.expert: 'максимум',
  };
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
    final answer = '${formatAnswer(task.answer)}${task.unit == null ? '' : ' ${task.unit}'}';
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
String formatAnswer(String answer) {
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
