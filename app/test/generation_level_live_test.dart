// Real generation on real rules at the harder levels, to judge quality by eye:
//   AIAI_API_KEY=... AIAI_MODEL=claude-haiku-5.5 flutter test test/generation_level_live_test.dart
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:math/llm/aiai_client.dart';
import 'package:math/llm/llm_config.dart';
import 'package:math/tasks/task.dart';
import 'package:math/tasks/task_generator.dart';

Map<String, dynamic>? findRule(String bookId, String ruleId) {
  final f = File('../data/books/$bookId.library.json');
  if (!f.existsSync()) return null;
  for (final s in jsonDecode(f.readAsStringSync()) as List) {
    for (final u in (s['units'] as List)) {
      if (u['id'] == ruleId) return {...u as Map<String, dynamic>, 'sectionRule': s['rule'], 'grade': s['grade'], 'subject': s['subject']};
    }
  }
  return null;
}

void main() {
  final key = Platform.environment['AIAI_API_KEY'] ?? '';
  final model = Platform.environment['AIAI_MODEL'] ?? 'claude-haiku-5.5';
  final rules = {'math5-1': 'math5-1-c1-p09-r04', 'algebra7': 'algebra7-c2-p12-r01'};

  for (final MapEntry(key: book, value: ruleId) in rules.entries) {
    for (final level in [Difficulty.hard, Difficulty.expert]) {
      final rule = findRule(book, ruleId);
      test('live $model: $ruleId ${level.name}', () async {
        final client = AiaiClient(LlmConfig(apiKey: key, model: model, baseUrl: 'https://api.aiai.by/v1'));
        final sw = Stopwatch()..start();
        final r = await TaskGenerator(client).generate(GenerationRequest(
          topicTitle: rule!['title'] as String,
          rule: rule['rule'] as String,
          context: rule['sectionRule'] as String,
          grade: rule['grade'] as int,
          subject: rule['subject'] as String,
          level: level,
        ));
        final out = StringBuffer('\n=== $model | ${rule['title']} | ${level.name} | ${sw.elapsed.inSeconds}s | '
            'ok ${r.tasks.length}, rejected ${r.rejected.length} | tokens ${r.usage?.promptTokens}/${r.usage?.completionTokens}\n');
        for (final t in r.tasks) {
          out.writeln('  [${t.type.name}] ${t.question}  => ${t.answer}${t.unit == null ? '' : ' ${t.unit}'}');
        }
        for (final x in r.rejected) {
          out.writeln('  REJECTED: ${x.reason}');
        }
        // ignore: avoid_print
        print(out);
        expect(r.tasks, isNotEmpty);
        expect(r.tasks.every((t) => t.difficulty == level), isTrue);
      }, skip: key.isEmpty || rule == null ? 'needs AIAI_API_KEY and data/books' : false, timeout: const Timeout(Duration(minutes: 4)));
    }
  }
}
