import 'package:flutter/material.dart';

import 'auth_service.dart';

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.auth});

  final AuthService auth;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _register = false;
  bool _busy = false;
  String? _error;
  String? _info;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
      _info = null;
    });
    try {
      await action();
    } on AuthFailure catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _submit() {
    if (!_form.currentState!.validate()) return;
    _run(() => _register
        ? widget.auth.registerWithEmail(_email.text, _password.text)
        : widget.auth.signInWithEmail(_email.text, _password.text));
  }

  void _resetPassword() {
    if (_email.text.trim().isEmpty) {
      setState(() => _error = 'Введите email, чтобы сбросить пароль');
      return;
    }
    _run(() async {
      await widget.auth.sendPasswordReset(_email.text);
      if (mounted) setState(() => _info = 'Письмо для сброса пароля отправлено');
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Math Trainer', textAlign: TextAlign.center, style: theme.textTheme.headlineMedium),
                    const SizedBox(height: 8),
                    Text(
                      _register ? 'Создайте аккаунт' : 'Войдите, чтобы решать примеры',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyLarge,
                    ),
                    const SizedBox(height: 32),
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      autocorrect: false,
                      decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
                      validator: (v) => (v == null || !v.contains('@')) ? 'Введите email' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _password,
                      obscureText: true,
                      autofillHints: [_register ? AutofillHints.newPassword : AutofillHints.password],
                      decoration: const InputDecoration(labelText: 'Пароль', border: OutlineInputBorder()),
                      validator: (v) => (v == null || v.length < 6) ? 'Не меньше 6 символов' : null,
                      onFieldSubmitted: (_) => _submit(),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                    ],
                    if (_info != null) ...[
                      const SizedBox(height: 12),
                      Text(_info!, style: TextStyle(color: theme.colorScheme.primary)),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: Text(_register ? 'Зарегистрироваться' : 'Войти'),
                    ),
                    TextButton(
                      onPressed: _busy ? null : () => setState(() {
                        _register = !_register;
                        _error = null;
                        _info = null;
                      }),
                      child: Text(_register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'),
                    ),
                    if (!_register)
                      TextButton(
                        onPressed: _busy ? null : _resetPassword,
                        child: const Text('Забыли пароль?'),
                      ),
                    const SizedBox(height: 8),
                    const Row(children: [
                      Expanded(child: Divider()),
                      Padding(padding: EdgeInsets.symmetric(horizontal: 12), child: Text('или')),
                      Expanded(child: Divider()),
                    ]),
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      onPressed: _busy ? null : () => _run(() async => widget.auth.signInWithGoogle()),
                      icon: const Icon(Icons.account_circle_outlined),
                      label: const Text('Войти через Google'),
                    ),
                    if (_busy) ...[
                      const SizedBox(height: 24),
                      const Center(child: CircularProgressIndicator()),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
