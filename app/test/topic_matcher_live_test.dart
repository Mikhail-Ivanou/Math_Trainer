// Real calls to aiai.by against the real rule catalog (data/books/*.library.json):
//   AIAI_API_KEY=... flutter test test/topic_matcher_live_test.dart
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:math/data/models.dart';
import 'package:math/llm/aiai_client.dart';
import 'package:math/llm/llm_config.dart';
import 'package:math/topics/topic_matcher.dart';

const _books = {
  5: {'math5-1': 'Математика. 5 класс. Часть 1', 'math5-2': 'Математика. 5 класс. Часть 2'},
  6: {'math6': 'Математика. 6 класс'},
  7: {'algebra7': 'Алгебра. 7 класс', 'geometry7': 'Геометрия. 7 класс'},
};

/// The grade's catalog, built the way the backend publishes catalog/grade-{n}.
List<CatalogRule> catalog(int grade) => [
      for (final MapEntry(key: bookId, value: bookTitle) in _books[grade]!.entries)
        for (final s in jsonDecode(File('../data/books/$bookId.library.json').readAsStringSync()) as List)
          for (final u in (s['units'] as List? ?? const []))
            CatalogRule.fromJson({
              ...Map<String, dynamic>.from(u as Map),
              'bookId': bookId,
              'bookTitle': bookTitle,
              'subject': s['subject'],
              'chapterTitle': s['chapterTitle'],
              'sectionId': s['id'],
              'sectionNumber': s['number'],
              'sectionTitle': s['title'],
            }),
    ];

void main() {
  final key = Platform.environment['AIAI_API_KEY'] ?? '';
  final haveData = _books.values.expand((b) => b.keys).every((id) => File('../data/books/$id.library.json').existsSync());
  final skip = key.isEmpty || !haveData ? 'needs AIAI_API_KEY and data/books/*.library.json' : false;

  // request -> grade -> a word the first matched rule's title must contain
  final cases = {
    'распределительный закон умножения': (5, 'распределительн'),
    'не понимаю, как складывать отрицательные числа': (6, 'сложени'),
    'как найти процент от числа': (6, 'процент'),
    'как раскрыть квадрат суммы': (7, 'квадрат'),
    'сумма углов в треугольнике': (7, 'сумм'),
  };

  for (final MapEntry(key: request, value: (grade, word)) in cases.entries) {
    test('live: «$request»', () async {
      final rules = catalog(grade);
      final matcher = TopicMatcher(AiaiClient(LlmConfig(apiKey: key, model: 'claude-haiku-5.5', baseUrl: 'https://api.aiai.by/v1')));
      final matches = await matcher.match(request, rules);
      // ignore: avoid_print
      print('«$request» (${rules.length} rules) -> ${matches.map((m) => '${m.rule.title} [${m.rule.id}]').join('; ')}');
      expect(matches, isNotEmpty);
      expect(matches.first.rule.title.toLowerCase(), contains(word));
    }, skip: skip, timeout: const Timeout(Duration(minutes: 2)));
  }
}
