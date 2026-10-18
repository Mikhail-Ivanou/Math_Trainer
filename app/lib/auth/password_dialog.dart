import 'package:flutter/material.dart';

import 'auth_service.dart';

/// Sets (or changes) the password of the signed-in account, so that a Google
/// account can also sign in with email and password.
Future<void> showPasswordDialog(BuildContext context, FirebaseAuthService auth) =>
    showDialog<void>(context: context, builder: (_) => _PasswordDialog(auth: auth));

class _PasswordDialog extends StatefulWidget {
  const _PasswordDialog({required this.auth});

  final FirebaseAuthService auth;

  @override
  State<_PasswordDialog> createState() => _PasswordDialogState();
}

class _PasswordDialogState extends State<_PasswordDialog> {
  final _password = TextEditingController();
  final _repeat = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    _repeat.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_password.text.length < 6) return setState(() => _error = 'Не меньше 6 символов');
    if (_password.text != _repeat.text) return setState(() => _error = 'Пароли не совпадают');
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.auth.setPassword(_password.text);
      navigator.pop();
      messenger.showSnackBar(const SnackBar(content: Text('Пароль сохранён: теперь можно входить и через Google, и по паролю')));
    } on AuthFailure catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.auth.hasPassword ? 'Сменить пароль' : 'Пароль для входа'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!widget.auth.hasPassword)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text('Задайте пароль, чтобы входить и через Google, и по email с паролем.'),
            ),
          TextField(
            controller: _password,
            obscureText: true,
            autofillHints: const [AutofillHints.newPassword],
            decoration: const InputDecoration(labelText: 'Новый пароль', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _repeat,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Повторите пароль', border: OutlineInputBorder()),
            onSubmitted: (_) => _save(),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
        ],
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.pop(context), child: const Text('Отмена')),
        FilledButton(onPressed: _busy ? null : _save, child: const Text('Сохранить')),
      ],
    );
  }
}
