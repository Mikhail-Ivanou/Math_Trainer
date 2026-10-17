import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

import 'auth/auth_gate.dart';
import 'auth/auth_service.dart';
import 'data/repository.dart';
import 'firebase_options.dart';
import 'llm/aiai_client.dart';
import 'llm/llm_config.dart';
import 'tasks/task_generator.dart';
import 'topics/topic_matcher.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final options = DefaultFirebaseOptions.currentPlatform;
  await Firebase.initializeApp(options: options);
  // iOS needs its OAuth client id; Android takes the web client id from google-services.json.
  await GoogleSignIn.instance.initialize(clientId: options.iosClientId);
  final googleConfigured = defaultTargetPlatform != TargetPlatform.iOS || options.iosClientId != null;
  const llm = LlmConfig.fromEnvironment;
  // Built without secrets.json: the app works, generation is hidden and topic search is a text filter.
  final client = llm.isConfigured ? AiaiClient(llm) : null;
  runApp(MathTrainerApp(
    auth: FirebaseAuthService(googleConfigured: googleConfigured),
    repo: Repository(),
    generator: client == null ? null : TaskGenerator(client),
    matcher: client == null ? null : TopicMatcher(client),
  ));
}

class MathTrainerApp extends StatelessWidget {
  const MathTrainerApp({super.key, required this.auth, required this.repo, required this.generator, required this.matcher});

  final FirebaseAuthService auth;
  final Repository repo;
  final TaskGenerator? generator;
  final TopicMatcher? matcher;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Math Trainer',
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo)),
      home: AuthGate(auth: auth, repo: repo, generator: generator, matcher: matcher),
    );
  }
}
