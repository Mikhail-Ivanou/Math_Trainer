import 'dart:convert';

import '../data/models.dart';
import '../llm/aiai_client.dart';

class TopicMatch {
  const TopicMatch(this.rule, this.why);
  final CatalogRule rule;
  final String why;
}

/// Finds the textbook rules a student's request is about. The model only
/// picks from the grade's catalog; ids it invents are dropped.
class TopicMatcher {
  TopicMatcher(this.client);

  final AiaiClient client;

  Future<List<TopicMatch>> match(String request, List<CatalogRule> catalog, {int max = 4}) async {
    if (catalog.isEmpty) return const [];
    final byId = {for (final r in catalog) r.id: r};
    final lines = StringBuffer();
    String? section;
    for (final r in catalog) {
      final s = '${r.bookTitle}, § ${r.sectionNumber}. ${r.sectionTitle}';
      if (s != section) lines.writeln('# $s');
      section = s;
      lines.writeln('${r.id} | ${r.title} | ${r.keywords.join(', ')}');
    }
    final reply = await client.chat(
      maxTokens: 1500,
      system: 'Ты помогаешь школьнику найти в учебниках конкретное правило, которое ему трудно даётся. '
          'Выбирай только из списка правил. Верни только JSON.',
      user: '''
Ученик написал: «$request»

Правила из учебников по параграфам (id | правило | ключевые слова):
$lines
Выбери до $max правил, которые лучше всего подходят под запрос, самое подходящее первым. Предпочитай конкретное правило, а не общее. Если ничего не подходит, верни пустой список.
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
