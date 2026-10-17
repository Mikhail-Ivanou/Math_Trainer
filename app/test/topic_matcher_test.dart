import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:math/data/models.dart';
import 'package:math/llm/aiai_client.dart';
import 'package:math/llm/llm_config.dart';
import 'package:math/topics/topic_matcher.dart';

const _catalog = [
  CatalogSection(
    id: 'math5-2-c3-p05',
    bookId: 'math5-2',
    bookTitle: 'Математика. 5 класс. Часть 2',
    grade: 5,
    subject: 'math',
    chapterTitle: 'Обыкновенные дроби',
    number: 5,
    title: 'Сложение и вычитание обыкновенных дробей',
    keywords: ['сложение дробей'],
  ),
  CatalogSection(
    id: 'math5-2-c3-p07',
    bookId: 'math5-2',
    bookTitle: 'Математика. 5 класс. Часть 2',
    grade: 5,
    subject: 'math',
    chapterTitle: 'Обыкновенные дроби',
    number: 7,
    title: 'Умножение дробных чисел',
  ),
];

void main() {
  test('keeps only catalog ids, in the model order, without repeats', () async {
    late String prompt;
    final client = MockClient((req) async {
      prompt = ((jsonDecode(req.body) as Map)['messages'] as List).last['content'] as String;
      return http.Response.bytes(
        utf8.encode(jsonEncode({
          'choices': [
            {
              'message': {
                'content': jsonEncode({
                  'matches': [
                    {'id': 'math5-2-c3-p05', 'why': 'про сложение дробей'},
                    {'id': 'made-up-id', 'why': '?'},
                    {'id': 'math5-2-c3-p05', 'why': 'повтор'},
                    {'id': 'math5-2-c3-p07', 'why': ''},
                  ],
                }),
              },
            },
          ],
        })),
        200,
      );
    });
    const config = LlmConfig(apiKey: 'k', model: 'claude-haiku-5.5', baseUrl: 'https://api.aiai.by/v1');
    final matches = await TopicMatcher(AiaiClient(config, httpClient: client)).match('не понимаю, как складывать дроби', _catalog);

    expect(prompt, contains('не понимаю, как складывать дроби'));
    expect(prompt, contains('math5-2-c3-p05 | Математика. 5 класс. Часть 2'));
    expect(matches.map((m) => m.section.id), ['math5-2-c3-p05', 'math5-2-c3-p07']);
    expect(matches.first.why, 'про сложение дробей');
  });

  test('empty catalog: no call, no matches', () async {
    final client = MockClient((_) async => fail('should not call the API'));
    const config = LlmConfig(apiKey: 'k', model: 'm', baseUrl: 'https://api.aiai.by/v1');
    expect(await TopicMatcher(AiaiClient(config, httpClient: client)).match('дроби', const []), isEmpty);
  });
}
