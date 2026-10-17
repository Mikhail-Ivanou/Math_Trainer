import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const MathTrainerApp());
}

class MathTrainerApp extends StatelessWidget {
  const MathTrainerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Math Trainer',
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo)),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // main() initialises Firebase before runApp; widget tests run without it.
    final projectId = Firebase.apps.isEmpty ? null : Firebase.app().options.projectId;
    return Scaffold(
      appBar: AppBar(title: const Text('Math Trainer')),
      body: Center(
        child: Text(
          projectId == null ? 'Firebase не подключён' : 'Firebase: $projectId',
          style: Theme.of(context).textTheme.titleMedium,
        ),
      ),
    );
  }
}
