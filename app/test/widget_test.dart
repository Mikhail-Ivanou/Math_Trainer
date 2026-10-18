import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:math/auth/auth_service.dart';
import 'package:math/auth/sign_in_screen.dart';

class FakeAuth implements AuthService {
  final calls = <String>[];
  AuthFailure? failWith;

  Future<void> _call(String name) async {
    calls.add(name);
    if (failWith != null) throw failWith!;
  }

  @override
  Future<void> signInWithEmail(String email, String password) => _call('signIn:$email');
  @override
  Future<void> registerWithEmail(String email, String password) => _call('register:$email');
  @override
  Future<bool> signInWithGoogle() async {
    await _call('google');
    return true;
  }

  @override
  Future<void> sendPasswordReset(String email) => _call('reset:$email');
}

Future<FakeAuth> pumpSignIn(WidgetTester tester) async {
  final auth = FakeAuth();
  await tester.pumpWidget(MaterialApp(home: SignInScreen(auth: auth)));
  return auth;
}

void main() {
  testWidgets('validates fields before calling Firebase', (tester) async {
    final auth = await pumpSignIn(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Войти'));
    await tester.pump();
    expect(find.text('Введите email'), findsOneWidget);
    expect(find.text('Не меньше 6 символов'), findsOneWidget);
    expect(auth.calls, isEmpty);
  });

  testWidgets('signs in and registers with email', (tester) async {
    final auth = await pumpSignIn(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'kid@example.com');
    await tester.enterText(find.widgetWithText(TextFormField, 'Пароль'), 'secret1');
    await tester.tap(find.widgetWithText(FilledButton, 'Войти'));
    await tester.pump();
    expect(auth.calls, ['signIn:kid@example.com']);

    await tester.tap(find.text('Нет аккаунта? Зарегистрироваться'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Зарегистрироваться'));
    await tester.pump();
    expect(auth.calls.last, 'register:kid@example.com');
  });

  testWidgets('shows the failure message', (tester) async {
    final auth = await pumpSignIn(tester)
      ..failWith = AuthFailure(FirebaseAuthService.messageFor('invalid-credential'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'kid@example.com');
    await tester.enterText(find.widgetWithText(TextFormField, 'Пароль'), 'wrong12');
    await tester.tap(find.widgetWithText(FilledButton, 'Войти'));
    await tester.pump();
    expect(auth.calls, hasLength(1));
    expect(find.textContaining('Неверный email или пароль'), findsOneWidget);
  });

  testWidgets('Google button calls Google sign-in', (tester) async {
    final auth = await pumpSignIn(tester);
    await tester.tap(find.text('Войти через Google'));
    await tester.pump();
    expect(auth.calls, ['google']);
  });
}
