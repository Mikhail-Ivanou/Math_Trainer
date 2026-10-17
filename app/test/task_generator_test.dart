import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:math/llm/aiai_client.dart';
import 'package:math/llm/llm_config.dart';
import 'package:math/tasks/task_generator.dart';

const _request = GenerationRequest(
  topicTitle: 'Сложение и вычитание натуральных чисел',
  rule: 'Чтобы найти неизвестное слагаемое, нужно из суммы вычесть известное слагаемое.',
  grade: 5,
);

http.Response _reply(Object content) => http.Response.bytes(
      utf8.encode(jsonEncode({
        'model': 'claude-haiku-5.5',
        'choices': [
          {'message': {'content': content is String ? content : jsonEncode(content)}},
        ],
        'usage': {'prompt_tokens': 900, 'completion_tokens': 300},
      })),
      200,
      headers: {'content-type': 'application/json'},
    );

void main() {
  const config = LlmConfig(apiKey: 'test-key', model: 'claude-haiku-5.5', baseUrl: 'https://api.aiai.by/v1');

  test('keeps verified tasks and reports rejected ones', () async {
    late Map<String, dynamic> sent;
    final client = MockClient((req) async {
      expect(req.headers['Authorization'], 'Bearer test-key');
      sent = jsonDecode(req.body) as Map<String, dynamic>;
      return _reply('```json\n${jsonEncode({
            'tasks': [
              {'type': 'expression', 'difficulty': 'easy', 'question': 'Вычислите: 4 500 + 1 275', 'expr': '4500+1275', 'answer': '5775'},
              {'type': 'expression', 'difficulty': 'easy', 'question': 'Вычислите: 4 500 + 1 275', 'expr': '4500+1275', 'answer': '5776'},
              {'type': 'word', 'difficulty': 'medium', 'question': 'q', 'solution_expr': '2+2', 'answer': 'много'},
            ],
          })}\n```');
    });
    final result = await TaskGenerator(AiaiClient(config, httpClient: client)).generate(_request);

    expect(sent['model'], 'claude-haiku-5.5');
    expect((sent['messages'] as List).last['content'], contains('Сложение и вычитание'));
    expect(result.tasks.map((t) => t.answer), ['5775']);
    expect(result.rejected, hasLength(2));
    expect(result.usage?.completionTokens, 300);
  });

  test('maps HTTP errors to user-facing messages', () async {
    final client = MockClient((_) async => http.Response('{"error":"limit"}', 402));
    expect(
      TaskGenerator(AiaiClient(config, httpClient: client)).generate(_request),
      throwsA(isA<LlmException>().having((e) => e.message, 'message', contains('лимит'))),
    );
  });

  test('refuses to call without a key', () async {
    const empty = LlmConfig(apiKey: '', model: 'm', baseUrl: 'https://api.aiai.by/v1');
    expect(TaskGenerator(AiaiClient(empty)).generate(_request), throwsA(isA<LlmException>()));
  });

  // Real call to aiai.by; runs only with a key: AIAI_API_KEY=... flutter test test/task_generator_test.dart
  final liveKey = Platform.environment['AIAI_API_KEY'] ?? '';
  test('live: claude-haiku-5.5 generates verifiable tasks', () async {
    final live = LlmConfig(apiKey: liveKey, model: Platform.environment['AIAI_MODEL'] ?? 'claude-haiku-5.5', baseUrl: 'https://api.aiai.by/v1');
    final result = await TaskGenerator(AiaiClient(live)).generate(_request);
    for (final r in result.rejected) {
      // ignore: avoid_print
      print('rejected: ${r.reason} — ${r.raw}');
    }
    expect(result.tasks.length, greaterThanOrEqualTo(10));
    expect(result.rejected.length, lessThanOrEqualTo(2));
  }, skip: liveKey.isEmpty ? 'set AIAI_API_KEY to run against aiai.by' : false, timeout: const Timeout(Duration(minutes: 3)));
}
