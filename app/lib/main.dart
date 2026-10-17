import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

import 'auth/auth_gate.dart';
import 'auth/auth_service.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final options = DefaultFirebaseOptions.currentPlatform;
  await Firebase.initializeApp(options: options);
  // iOS needs its OAuth client id; Android takes the web client id from google-services.json.
  await GoogleSignIn.instance.initialize(clientId: options.iosClientId);
  final googleConfigured = defaultTargetPlatform != TargetPlatform.iOS || options.iosClientId != null;
  runApp(MathTrainerApp(auth: FirebaseAuthService(googleConfigured: googleConfigured)));
}

class MathTrainerApp extends StatelessWidget {
  const MathTrainerApp({super.key, required this.auth});

  final FirebaseAuthService auth;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Math Trainer',
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo)),
      home: AuthGate(auth: auth),
    );
  }
}
