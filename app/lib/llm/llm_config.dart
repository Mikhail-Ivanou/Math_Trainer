/// Build-time LLM settings, passed with `--dart-define-from-file=secrets.json`.
///
/// The key ships inside the app, so it must be a separate aiai.by key with a
/// spending limit — never the backend's key.
class LlmConfig {
  const LlmConfig({required this.apiKey, required this.model, required this.baseUrl});

  static const fromEnvironment = LlmConfig(
    apiKey: String.fromEnvironment('AIAI_API_KEY'),
    model: String.fromEnvironment('AIAI_MODEL', defaultValue: 'claude-haiku-5.5'),
    baseUrl: String.fromEnvironment('AIAI_BASE_URL', defaultValue: 'https://api.aiai.by/v1'),
  );

  final String apiKey;
  final String model;
  final String baseUrl;

  bool get isConfigured => apiKey.isNotEmpty;
}
