import 'dart:convert';

import '../llm/aiai_client.dart';
import 'task.dart';
import 'task_verifier.dart';

/// What to generate: a textbook topic and how many tasks of each type.
class GenerationRequest {
  const GenerationRequest({
    required this.topicTitle,
    required this.excerpt,
    this.expressions = 5,
    this.equations = 4,
    this.wordProblems = 3,
    this.grade = 5,
  });

  final String topicTitle;

  /// The textbook text for this topic, used as the only source.
  final String excerpt;
  final int expressions;
  final int equations;
  final int wordProblems;
  final int grade;
}

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
    final reply = await client.chat(system: systemPrompt(req.grade), user: userPrompt(req));
    final tasks = <MathTask>[];
    final rejected = <RejectedTask>[];
    for (final raw in _parseTasks(reply.content)) {
      try {
        final task = MathTask.fromJson(raw as Map<String, dynamic>);
        final verdict = verifyTask(task);
        verdict.ok ? tasks.add(task) : rejected.add(RejectedTask(raw, verdict.reason!));
      } on Object catch (e) {
        rejected.add(RejectedTask(raw, 'не разобрано: $e'));
      }
    }
    return GenerationResult(tasks: tasks, rejected: rejected, model: reply.model, usage: reply.usage);
  }

  static List<Object?> _parseTasks(String content) {
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

  static String systemPrompt(int grade) => '''
Ты — методист и учитель математики $grade класса (Беларусь). Ты составляешь тренировочные задания для ученика строго по фрагменту учебника, который тебе дают.
Правила:
- только натуральные числа и нуль, без дробей и отрицательных чисел;
- формулировки на русском языке, как в учебнике, понятные 10–11-летнему ребёнку;
- текст задания (question) должен быть полным: ученик видит только его, поэтому выражение или уравнение пиши прямо в question;
- числа записывай с пробелом между классами: 12 450, 1 000 000;
- задания разной сложности (easy, medium, hard) и разные по сюжету, без повторов;
- ответ к каждому заданию обязателен и должен быть верным — перепроверь вычисления.
Верни только JSON без пояснений и без markdown.''';

  static String userPrompt(GenerationRequest r) => '''
Фрагмент учебника, тема «${r.topicTitle}»:
<<<
${r.excerpt}
>>>

Составь ${r.expressions + r.equations + r.wordProblems} новых заданий по этой теме (не копируй задания из учебника):
- ${r.expressions} заданий type "expression" — вычислить значение выражения;
- ${r.equations} заданий type "equation" — найти неизвестный компонент (одна переменная);
- ${r.wordProblems} заданий type "word" — текстовые задачи.

Формат ответа:
{"tasks": [
  {"type": "expression", "difficulty": "easy|medium|hard", "question": "Вычислите: 1 234 + 5 678", "expr": "1234+5678", "answer": 6912},
  {"type": "equation", "difficulty": "...", "question": "Найдите неизвестное слагаемое: x + 309 = 2 542", "equation": "x + 309 = 2542", "variable": "x", "answer": 2233},
  {"type": "word", "difficulty": "...", "question": "...", "solution_expr": "выражение из чисел и + - * :, дающее ответ", "answer": 42, "unit": "км"}
]}''';
}
