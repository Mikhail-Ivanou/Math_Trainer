import 'dart:convert';

import '../llm/aiai_client.dart';
import 'task.dart';
import 'task_verifier.dart';

/// What to generate: a topic, its rule sheet and how many tasks of each type.
class GenerationRequest {
  const GenerationRequest({
    required this.topicTitle,
    required this.rule,
    required this.grade,
    this.context = '',
    this.subject = 'math',
    this.level = Difficulty.medium,
    Map<TaskType, int>? counts,
  }) : _counts = counts; // ignore: prefer_initializing_formals — the public name is `counts`

  final String topicTitle;

  /// The rule and its example: what every task must train.
  final String rule;

  /// The whole paragraph's rule sheet: what else the student knows at this point.
  final String context;
  final int grade;

  /// "math", "algebra" or "geometry".
  final String subject;

  /// Every task of the batch is at this level.
  final Difficulty level;
  final Map<TaskType, int>? _counts;

  /// Geometry has few pure calculations; algebra adds "simplify" tasks.
  /// Harder levels get fewer, longer tasks.
  Map<TaskType, int> get counts =>
      _counts ??
      switch ((subject, level)) {
        ('geometry', Difficulty.expert) => {TaskType.word: 6},
        ('geometry', _) => {TaskType.word: 8},
        ('algebra', Difficulty.expert) => {TaskType.expression: 1, TaskType.equation: 2, TaskType.simplify: 2, TaskType.word: 1},
        ('algebra', _) => {TaskType.expression: 2, TaskType.equation: 2, TaskType.simplify: 3, TaskType.word: 1},
        (_, Difficulty.expert) => {TaskType.expression: 2, TaskType.equation: 2, TaskType.word: 2},
        _ => {TaskType.expression: 3, TaskType.equation: 2, TaskType.word: 3},
      };
}

/// What each level means, for the model and for the level picker.
const levelNames = {
  Difficulty.easy: 'Лёгкий',
  Difficulty.medium: 'Средний',
  Difficulty.hard: 'Сложный',
  Difficulty.expert: 'Максимальный',
};

const levelHints = {
  Difficulty.medium: 'Как задания из учебника: правило в 2–3 шага, числа побольше',
  Difficulty.hard: 'В 3–5 шагов, вместе с другими правилами, с подвохом',
  Difficulty.expert: 'Повышенная трудность, почти олимпиада: нужна догадка',
};

const _levelForModel = {
  Difficulty.easy: 'лёгкий: правило в один шаг, небольшие числа',
  Difficulty.medium: 'средний: как основные задания учебника — правило применяется в 2–3 шага, числа побольше, есть скобки и порядок действий',
  Difficulty.hard: 'сложный: 3–5 шагов, правило нужно сочетать с ранее изученным, числа неудобные, формулировка непрямая, есть ловушки (типичные ошибки учеников); текстовые задачи — в несколько действий',
  Difficulty.expert: 'максимальный: задания повышенной трудности и олимпиадного типа для сильных учеников этого класса — '
      'длинные цепочки, нестандартная формулировка, нужно догадаться, как применить правило '
      '(вынести общий множитель, сгруппировать, заметить закономерность, рассуждать от обратного); '
      'но всё решается знаниями ученика этого класса, без формул из старших классов, и ответ однозначный',
};

class RejectedTask {
  const RejectedTask(this.raw, this.reason);
  final Object? raw;
  final String reason;
}

class GenerationResult {
  const GenerationResult({required this.tasks, required this.rejected, required this.model, this.usage});

  /// Only tasks whose answers passed [verifyTask].
  final List<MathTask> tasks;
  final List<RejectedTask> rejected;
  final String model;
  final LlmUsage? usage;
}

class TaskGenerator {
  TaskGenerator(this.client);

  final AiaiClient client;

  Future<GenerationResult> generate(GenerationRequest req) async {
    final reply = await client.chat(system: systemPrompt(req), user: userPrompt(req));
    final tasks = <MathTask>[];
    final rejected = <RejectedTask>[];
    for (final raw in parseTasks(reply.content)) {
      try {
        // The batch is one level, whatever the model wrote in "difficulty".
        final task = MathTask.fromJson({...raw as Map<String, dynamic>, 'difficulty': req.level.name});
        final verdict = verifyTask(task);
        verdict.ok ? tasks.add(task) : rejected.add(RejectedTask(raw, verdict.reason!));
      } on Object catch (e) {
        rejected.add(RejectedTask(raw, 'не разобрано: $e'));
      }
    }
    return GenerationResult(tasks: tasks, rejected: rejected, model: reply.model, usage: reply.usage);
  }

  static List<Object?> parseTasks(String content) {
    final start = content.indexOf('{'), end = content.lastIndexOf('}');
    if (start < 0 || end <= start) throw LlmException('Модель вернула не JSON');
    try {
      final tasks = (jsonDecode(content.substring(start, end + 1)) as Map<String, dynamic>)['tasks'];
      if (tasks is List) return tasks;
    } on FormatException {
      // fall through
    }
    throw LlmException('Модель вернула JSON без списка tasks');
  }

  static String systemPrompt(GenerationRequest r) => '''
Ты — методист и учитель ${_subjectName(r.subject)} ${r.grade} класса (Беларусь). Ты составляешь тренировочные задания для ученика на одно конкретное правило, которое тебе дают.
Правила:
- используй только то, что ученик ${r.grade} класса уже знает к этой теме: правило темы и материал прошлых классов;
- формулировки на русском языке, понятные ученику ${r.grade} класса;
- текст задания (question) должен быть полным: ученик видит только его, поэтому выражение или уравнение пиши прямо в question;
- в question числа с пробелом между классами (12 450), десятичная запятая (2,5), знаки ·, :, −;
- все задания одного уровня — того, что указан в запросе; разные по сюжету и приёму, без повторов;
- ответ к каждому заданию обязателен и должен быть верным — перепроверь вычисления.
Верни только JSON без пояснений и без markdown.''';

  static String userPrompt(GenerationRequest r) {
    final total = r.counts.values.fold(0, (a, b) => a + b);
    final lines = [
      for (final MapEntry(key: type, value: n) in r.counts.entries)
        if (n > 0) '- $n заданий type "${type.name}" — ${_typeHint[type]}',
    ];
    return '''
Правило «${r.topicTitle}»:
<<<
${r.rule}
>>>
${r.context.isEmpty ? '' : '''
Параграф учебника, из которого это правило (только чтобы понимать, что ученик уже знает):
<<<
${r.context}
>>>
'''}
Составь $total новых заданий, каждое из которых тренирует именно это правило.
Уровень всех заданий — ${_levelForModel[r.level]}. В поле difficulty у всех пиши "${r.level.name}".
${lines.join('\n')}

Поля для проверки ответа (их видит только программа):
- answer — число без пробелов: целое «12450», десятичная дробь «2.5», обыкновенная «-7/3» (смешанное число пиши неправильной дробью); для simplify — упрощённое выражение;
- expr, equation, solution_expr — выражения только из чисел, переменных (одна буква), + - * / ^ и скобок, например «(2.5+3/4)*4», «3(x-2)+1=10», «(a+b)^2».

Формат ответа:
{"tasks": [
  {"type": "expression", "difficulty": "${r.level.name}", "question": "Вычислите: 1 234 + 5 678", "expr": "1234+5678", "answer": "6912"},
  {"type": "equation", "difficulty": "...", "question": "Решите уравнение: 3x − 4 = 11", "equation": "3x-4=11", "variable": "x", "answer": "5"},
  {"type": "simplify", "difficulty": "...", "question": "Упростите выражение: 2a + 3a − b", "expr": "2a+3a-b", "answer": "5a-b"},
  {"type": "word", "difficulty": "...", "question": "...", "solution_expr": "выражение, дающее ответ", "answer": "42", "unit": "км"}
]}''';
  }

  static const _typeHint = {
    TaskType.expression: 'вычислить значение числового выражения',
    TaskType.equation: 'решить уравнение с одной переменной (один корень)',
    TaskType.simplify: 'упростить выражение с переменными (раскрыть скобки, привести подобные)',
    TaskType.word: 'текстовая задача с числовым ответом',
  };

  static String _subjectName(String subject) => switch (subject) {
        'algebra' => 'алгебры',
        'geometry' => 'геометрии',
        _ => 'математики',
      };
}
