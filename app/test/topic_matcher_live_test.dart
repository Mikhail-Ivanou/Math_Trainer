// Real calls to aiai.by against the real catalog (data/books/*.library.json):
//   AIAI_API_KEY=... flutter test test/topic_matcher_live_test.dart
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:math/data/models.dart';
import 'package:math/llm/aiai_client.dart';
import 'package:math/llm/llm_config.dart';
import 'package:math/topics/topic_matcher.dart';

List<CatalogSection> load(String bookId, String bookTitle) {
  final f = File('../data/books/$bookId.library.json');
  return [
    for (final s in jsonDecode(f.readAsStringSync()) as List)
      CatalogSection.fromJson(Map<String, dynamic>.from(s as Map), bookTitle: bookTitle),
  ];
}

void main() {
  final key = Platform.environment['AIAI_API_KEY'] ?? '';
  final haveData = File('../data/books/math6.library.json').existsSync();
  final skip = key.isEmpty || !haveData ? 'needs AIAI_API_KEY and data/books/*.library.json' : false;

  final cases = {
    // request -> grade -> id expected among the matches
    'не понимаю, как складывать отрицательные числа': (6, 'math6-c4-p04'),
    'проценты от числа, задачи с процентами': (6, 'math6-c2-p02'),
    'как раскрыть квадрат суммы': (7, 'algebra7-c2-p12'),
    'сумма углов в треугольнике': (7, 'geometry7-c4-p19'),
  };

  for (final MapEntry(key: request, value: (grade, expected)) in cases.entries) {
    test('live: «$request»', () async {
      final catalog = grade == 6
          ? load('math6', 'Математика. 6 класс')
          : [...load('algebra7', 'Алгебра. 7 класс'), ...load('geometry7', 'Геометрия. 7 класс')];
      final matcher = TopicMatcher(AiaiClient(LlmConfig(apiKey: key, model: 'claude-haiku-5.5', baseUrl: 'https://api.aiai.by/v1')));
      final matches = await matcher.match(request, catalog);
      // ignore: avoid_print
      print('«$request» -> ${matches.map((m) => '${m.section.id} (${m.section.title})').join('; ')}');
      expect(matches.map((m) => m.section.id), contains(expected));
    }, skip: skip, timeout: const Timeout(Duration(minutes: 2)));
  }
}
