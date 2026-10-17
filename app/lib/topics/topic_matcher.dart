import 'dart:convert';

import '../data/models.dart';
import '../llm/aiai_client.dart';

class TopicMatch {
  const TopicMatch(this.section, this.why);
  final CatalogSection section;
  final String why;
}

/// Finds the textbook sections a student's request is about. The model only
/// picks from the grade's catalog; ids it invents are dropped.
class TopicMatcher {
  TopicMatcher(this.client);

  final AiaiClient client;

  Future<List<TopicMatch>> match(String request, List<CatalogSection> catalog, {int max = 3}) async {
    if (catalog.isEmpty) return const [];
    final byId = {for (final s in catalog) s.id: s};
    final list = catalog
        .map((s) => '${s.id} | ${s.bookTitle} | ${s.chapterTitle} | § ${s.number}. ${s.title} | ${s.keywords.join(', ')}')
        .join('\n');
    final reply = await client.chat(
      maxTokens: 1500,
      system: 'Ты помогаешь школьнику найти в учебниках тему, которая ему трудно даётся. '
          'Выбирай только из списка разделов. Верни только JSON.',
      user: '''
Ученик написал: «$request»

Разделы учебников (id | учебник | глава | параграф | ключевые слова):
$list

Выбери до $max разделов, которые лучше всего подходят под запрос, самый подходящий первым. Если ни один не подходит, верни пустой список.
Формат: {"matches": [{"id": "…", "why": "коротко, почему подходит"}]}''',
    );
    final start = reply.content.indexOf('{'), end = reply.content.lastIndexOf('}');
    if (start < 0 || end <= start) throw LlmException('Модель вернула не JSON');
    final matches = (jsonDecode(reply.content.substring(start, end + 1)) as Map<String, dynamic>)['matches'];
    if (matches is! List) return const [];
    final seen = <String>{};
    return [
      for (final m in matches)
        if (m is Map && byId[m['id']] != null && seen.add(m['id'] as String))
          TopicMatch(byId[m['id']]!, (m['why'] as String? ?? '').trim()),
    ].take(max).toList();
  }
}
