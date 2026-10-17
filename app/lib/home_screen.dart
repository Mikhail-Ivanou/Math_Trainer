import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.user, required this.onSignOut});

  final User user;
  final Future<void> Function() onSignOut;

  @override
  Widget build(BuildContext context) {
    final name = user.displayName?.isNotEmpty == true ? user.displayName! : user.email ?? 'Ученик';
    return Scaffold(
      appBar: AppBar(
        title: const Text('Math Trainer'),
        actions: [
          IconButton(tooltip: 'Выйти', icon: const Icon(Icons.logout), onPressed: onSignOut),
        ],
      ),
      body: Center(
        child: Text('Привет, $name!', style: Theme.of(context).textTheme.titleMedium),
      ),
    );
  }
}
