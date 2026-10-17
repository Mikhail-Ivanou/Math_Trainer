import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../data/models.dart';
import '../data/repository.dart';
import '../llm/aiai_client.dart';
import 'topic_matcher.dart';

/// A student describes what is hard; the app finds the textbook rule and
/// adds it as a topic — or opens it, when someone has already added it.
/// Returns the added (or existing) [Topic] via Navigator.pop.
class AddTopicScreen extends StatefulWidget {
  const AddTopicScreen({super.key, required this.user, required this.repo, required this.matcher});

  final User user;
  final Repository repo;

  /// Null when built without an aiai.by key: then the search is a plain text filter.
  final TopicMatcher? matcher;

  @override
  State<AddTopicScreen> createState() => _AddTopicScreenState();
}

class _AddTopicScreenState extends State<AddTopicScreen> {
  final _query = TextEditingController();
  int _grade = 5;
  List<CatalogRule> _catalog = const [];
  Map<String, Topic> _existing = const {};
  List<TopicMatch>? _matches;
  bool _loading = true;
  bool _searching = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.repo.lastGrade(widget.user.uid).then((g) => _load(g ?? 5), onError: (_) => _load(5));
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _load(int grade) async {
    setState(() {
      _grade = grade;
      _loading = true;
      _matches = null;
      _error = null;
    });
    try {
      final results = await Future.wait([widget.repo.catalog(grade), widget.repo.existingTopics()]);
      if (!mounted) return;
      setState(() {
        _catalog = results[0] as List<CatalogRule>;
        _existing = results[1] as Map<String, Topic>;
      });
    } on Exception catch (e) {
      if (mounted) setState(() => _error = 'Не удалось загрузить учебники: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _search() async {
    final q = _query.text.trim();
    if (q.isEmpty) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      final matches = widget.matcher != null
          ? await widget.matcher!.match(q, _catalog)
          : [for (final s in _filter(q).take(3)) TopicMatch(s, '')];
      if (mounted) setState(() => _matches = matches);
    } on LlmException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  List<CatalogRule> _filter(String q) {
    final words = q.toLowerCase().split(RegExp(r'\s+')).where((w) => w.length > 2).toList();
    if (words.isEmpty) return _catalog;
    return _catalog.where((s) {
      final hay = '${s.title} ${s.sectionTitle} ${s.keywords.join(' ')}'.toLowerCase();
      return words.any((w) => hay.contains(w.substring(0, w.length > 5 ? w.length - 2 : w.length)));
    }).toList();
  }

  Future<void> _add(CatalogRule s) async {
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    final similar = _existing.containsKey(s.id) ? null : Repository.similarTopic(s, _grade, _existing);
    if (similar != null) {
      final choice = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Похожая тема уже есть'),
          content: Text('«${similar.title}» уже добавлена из ${similar.source}.\n'
              'Выбранное правило — из § ${s.sectionNumber}. ${s.sectionTitle}. Это может быть то же самое.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, 'add'), child: const Text('Добавить эту')),
            FilledButton(onPressed: () => Navigator.pop(context, 'open'), child: const Text('Открыть существующую')),
          ],
        ),
      );
      if (choice == null) return;
      if (choice == 'open') {
        navigator.pop(similar);
        return;
      }
    }
    setState(() => _searching = true);
    try {
      final topic = await widget.repo.addTopic(s, uid: widget.user.uid, reason: _query.text);
      await widget.repo.saveGrade(widget.user.uid, _grade);
      navigator.pop(topic);
    } on Exception catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Не удалось добавить тему: $e')));
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Новая тема')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Класс', style: theme.textTheme.labelLarge),
          const SizedBox(height: 8),
          SegmentedButton<int>(
            segments: [for (final g in Repository.grades) ButtonSegment(value: g, label: Text('$g'))],
            selected: {_grade},
            onSelectionChanged: (s) => _load(s.first),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _query,
            minLines: 1,
            maxLines: 3,
            maxLength: 500,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _search(),
            decoration: InputDecoration(
              labelText: 'Что даётся трудно?',
              hintText: 'например: не понимаю, как складывать дроби',
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(icon: const Icon(Icons.search), onPressed: _searching || _loading ? null : _search),
            ),
          ),
          if (_loading || _searching) const LinearProgressIndicator(),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: theme.colorScheme.error))),
          if (_matches != null) ...[
            const SizedBox(height: 12),
            Text(_matches!.isEmpty ? 'В учебниках $_grade класса такой темы не нашлось. Попробуйте сформулировать иначе или выберите из списка ниже.' : 'Нашлось в учебниках:',
                style: theme.textTheme.titleSmall),
            for (final m in _matches!) _RuleTile(rule: m.rule, why: m.why, added: _existing.containsKey(m.rule.id), similar: Repository.similarTopic(m.rule, _grade, _existing) != null, onTap: () => _add(m.rule)),
          ],
          const SizedBox(height: 16),
          if (!_loading) ..._browse(theme),
        ],
      ),
    );
  }

  /// Every rule of the grade, by book and paragraph, for picking by hand.
  List<Widget> _browse(ThemeData theme) {
    final byBook = <String, Map<String, List<CatalogRule>>>{};
    for (final r in _catalog) {
      byBook.putIfAbsent(r.bookTitle, () => {}).putIfAbsent('§ ${r.sectionNumber}. ${r.sectionTitle}', () => []).add(r);
    }
    return [
      Text('Или выберите правило из учебника', style: theme.textTheme.titleSmall),
      for (final MapEntry(key: book, value: sections) in byBook.entries)
        ExpansionTile(
          key: PageStorageKey('book:$_grade:$book'), // keeps it open while the list above changes
          tilePadding: EdgeInsets.zero,
          title: Text(book),
          children: [
            for (final MapEntry(key: section, value: rules) in sections.entries)
              ExpansionTile(
                key: PageStorageKey('section:$_grade:$section'),
                tilePadding: const EdgeInsets.only(left: 12),
                childrenPadding: const EdgeInsets.only(left: 12),
                title: Text(section, style: theme.textTheme.bodyMedium),
                children: [
                  for (final r in rules) _RuleTile(rule: r, showSource: false, added: _existing.containsKey(r.id), similar: Repository.similarTopic(r, _grade, _existing) != null, onTap: () => _add(r)),
                ],
              ),
          ],
        ),
    ];
  }
}

class _RuleTile extends StatelessWidget {
  const _RuleTile({required this.rule, required this.added, required this.onTap, this.why = '', this.showSource = true, this.similar = false});

  final CatalogRule rule;
  final bool added;
  final String why;
  final bool showSource;
  final bool similar;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final subtitle = [
      if (showSource) '§ ${rule.sectionNumber}. ${rule.sectionTitle} · ${rule.bookTitle}',
      if (why.isNotEmpty) why,
    ].join('\n');
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(rule.title),
      subtitle: subtitle.isEmpty ? null : Text(subtitle),
      trailing: added
          ? const Chip(label: Text('уже в списке'), visualDensity: VisualDensity.compact)
          : similar
              ? const Chip(label: Text('похожая есть'), visualDensity: VisualDensity.compact)
              : const Icon(Icons.add),
      onTap: onTap,
    );
  }
}
