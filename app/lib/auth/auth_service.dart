import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

/// What the sign-in screen needs; the screen gets a fake in widget tests.
abstract class AuthService {
  Future<void> signInWithEmail(String email, String password);
  Future<void> registerWithEmail(String email, String password);

  /// Returns false when the user closes the Google account picker.
  Future<bool> signInWithGoogle();
  Future<void> sendPasswordReset(String email);
}

/// A sign-in failure with a message ready to show to the user.
class AuthFailure implements Exception {
  AuthFailure(this.message);
  final String message;

  @override
  String toString() => message;
}

class FirebaseAuthService implements AuthService {
  FirebaseAuthService({FirebaseAuth? auth, this.googleConfigured = true})
      : _auth = auth ?? FirebaseAuth.instance;

  final FirebaseAuth _auth;

  /// False on iOS until the Google provider is enabled and the config has a client id:
  /// GoogleSignIn-iOS raises a native exception without one.
  final bool googleConfigured;

  @override
  Future<void> signInWithEmail(String email, String password) =>
      _guard(() => _auth.signInWithEmailAndPassword(email: email.trim(), password: password));

  // No email verification step: the account is usable right after sign-up.
  @override
  Future<void> registerWithEmail(String email, String password) =>
      _guard(() => _auth.createUserWithEmailAndPassword(email: email.trim(), password: password));

  @override
  Future<void> sendPasswordReset(String email) =>
      _guard(() => _auth.sendPasswordResetEmail(email: email.trim()));

  @override
  Future<bool> signInWithGoogle() async {
    if (!googleConfigured) throw AuthFailure('Вход через Google ещё не настроен');
    final GoogleSignInAccount account;
    try {
      account = await GoogleSignIn.instance.authenticate();
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) return false;
      throw AuthFailure('Не удалось войти через Google: ${e.description ?? e.code.name}');
    }
    final idToken = account.authentication.idToken;
    if (idToken == null) throw AuthFailure('Google не вернул токен входа');
    await _guard(() => _auth.signInWithCredential(GoogleAuthProvider.credential(idToken: idToken)));
    return true;
  }

  Future<void> signOut() async {
    await GoogleSignIn.instance.signOut();
    await _auth.signOut();
  }

  Future<void> _guard(Future<Object?> Function() action) async {
    try {
      await action();
    } on FirebaseAuthException catch (e) {
      throw AuthFailure(messageFor(e.code));
    }
  }

  static String messageFor(String code) => switch (code) {
        'invalid-email' => 'Неверный формат email',
        'user-disabled' => 'Аккаунт заблокирован',
        'user-not-found' || 'wrong-password' || 'invalid-credential' => 'Неверный email или пароль',
        'email-already-in-use' => 'Аккаунт с таким email уже есть — войдите',
        'weak-password' => 'Слишком простой пароль: нужно не меньше 6 символов',
        'too-many-requests' => 'Слишком много попыток, попробуйте позже',
        'network-request-failed' => 'Нет соединения с интернетом',
        'operation-not-allowed' => 'Этот способ входа не включён в Firebase',
        'account-exists-with-different-credential' => 'Этот email уже привязан к другому способу входа',
        _ => 'Ошибка входа ($code)',
      };
}
