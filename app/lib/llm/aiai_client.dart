import 'dart:convert';

import 'package:http/http.dart' as http;

import 'llm_config.dart';

class LlmException implements Exception {
  LlmException(this.message);
  final String message;

  @override
  String toString() => message;
}

class LlmUsage {
  const LlmUsage({required this.promptTokens, required this.completionTokens});
  final int promptTokens;
  final int completionTokens;
}

class LlmReply {
  const LlmReply({required this.content, required this.model, this.usage});
  final String content;
  final String model;
  final LlmUsage? usage;
}

/// Minimal client for aiai.by's OpenAI-compatible chat completions API.
class AiaiClient {
  AiaiClient(this.config, {http.Client? httpClient}) : _http = httpClient ?? http.Client();

  final LlmConfig config;
  final http.Client _http;

  Future<LlmReply> chat({
    required String system,
    required String user,
    int maxTokens = 8000,
    Duration timeout = const Duration(seconds: 120),
  }) async {
    if (!config.isConfigured) {
      throw LlmException('Ключ aiai.by не задан: соберите приложение с --dart-define-from-file=secrets.json');
    }
    final http.Response res;
    try {
      res = await _http
          .post(
            Uri.parse('${config.baseUrl}/chat/completions'),
            headers: {'Authorization': 'Bearer ${config.apiKey}', 'Content-Type': 'application/json'},
            body: jsonEncode({
              'model': config.model,
              'messages': [
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': user},
              ],
              'max_tokens': maxTokens,
            }),
          )
          .timeout(timeout);
    } on Exception catch (e) {
      throw LlmException('Нет связи с сервисом генерации: $e');
    }
    final body = utf8.decode(res.bodyBytes);
    if (res.statusCode != 200) {
      throw LlmException(switch (res.statusCode) {
        401 || 403 => 'Ключ aiai.by не принят',
        402 => 'Закончился лимит ключа aiai.by',
        429 => 'Слишком много запросов, попробуйте через минуту',
        _ => 'Сервис генерации ответил ${res.statusCode}: ${body.length > 200 ? body.substring(0, 200) : body}',
      });
    }
    final json = jsonDecode(body) as Map<String, dynamic>;
    final content = (json['choices'] as List?)?.firstOrNull?['message']?['content'] as String?;
    if (content == null || content.trim().isEmpty) throw LlmException('Модель вернула пустой ответ');
    final usage = json['usage'] as Map<String, dynamic>?;
    return LlmReply(
      content: content,
      model: json['model'] as String? ?? config.model,
      usage: usage == null
          ? null
          : LlmUsage(
              promptTokens: (usage['prompt_tokens'] as num?)?.toInt() ?? 0,
              completionTokens: (usage['completion_tokens'] as num?)?.toInt() ?? 0,
            ),
    );
  }
}
