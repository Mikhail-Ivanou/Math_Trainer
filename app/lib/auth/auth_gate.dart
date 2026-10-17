import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../data/repository.dart';
import '../home_screen.dart';
import '../tasks/task_generator.dart';
import '../topics/topic_matcher.dart';
import 'auth_service.dart';
import 'sign_in_screen.dart';

/// Shows the sign-in screen until Firebase has a user, then the app.
class AuthGate extends StatelessWidget {
  const AuthGate({super.key, required this.auth, required this.repo, required this.generator, required this.matcher});

  final FirebaseAuthService auth;
  final Repository repo;
  final TaskGenerator? generator;
  final TopicMatcher? matcher;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        final user = snapshot.data;
        return user == null
            ? SignInScreen(auth: auth)
            : HomeScreen(user: user, repo: repo, generator: generator, matcher: matcher, onSignOut: auth.signOut);
      },
    );
  }
}
