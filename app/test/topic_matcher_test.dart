import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:math/data/models.dart';
import 'package:math/llm/aiai_client.dart';
import 'package:math/llm/llm_config.dart';
import 'package:math/topics/topic_matcher.dart';

const _catalog = [
  CatalogRule(
    id: 'math5-1-c1-p09-r03',
    title: 'Переместительный и сочетательный законы умножения',
    bookId: 'math5-1',
    bookTitle: 'Математика. 5 класс. Часть 1',
    subject: 'math',
    chapterTitle: 'Натуральные числа',
    sectionId: 'math5-1-c1-p09',
    sectionNumber: 9,
    sectionTitle: 'Умножение и деление натуральных чисел',
  ),
  CatalogRule(
    id: 'math5-1-c1-p09-r04',
    title: 'Распределительный закон умножения',
    bookId: 'math5-1',
    bookTitle: 'Математика. 5 класс. Часть 1',
    subject: 'math',
    chapterTitle: 'Натуральные числа',
    sectionId: 'math5-1-c1-p09',
    sectionNumber: 9,
    sectionTitle: 'Умножение и деление натуральных чисел',
    keywords: ['раскрыть скобки'],
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
                    {'id': 'math5-1-c1-p09-r04', 'why': 'это и есть распределительный закон'},
                    {'id': 'made-up-id', 'why': '?'},
                    {'id': 'math5-1-c1-p09-r04', 'why': 'повтор'},
                    {'id': 'math5-1-c1-p09-r03', 'why': ''},
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
    final matches = await TopicMatcher(AiaiClient(config, httpClient: client)).match('распределительный закон умножения', _catalog);

    expect(prompt, contains('распределительный закон умножения'));
    expect(prompt, contains('# Математика. 5 класс. Часть 1, § 9. Умножение и деление натуральных чисел'));
    expect(prompt, contains('math5-1-c1-p09-r04 | Распределительный закон умножения | раскрыть скобки'));
    expect(matches.map((m) => m.rule.id), ['math5-1-c1-p09-r04', 'math5-1-c1-p09-r03']);
    expect(matches.first.why, 'это и есть распределительный закон');
  });

  test('empty catalog: no call, no matches', () async {
    final client = MockClient((_) async => fail('should not call the API'));
    const config = LlmConfig(apiKey: 'k', model: 'm', baseUrl: 'https://api.aiai.by/v1');
    expect(await TopicMatcher(AiaiClient(config, httpClient: client)).match('дроби', const []), isEmpty);
  });
}
