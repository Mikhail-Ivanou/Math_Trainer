import 'task.dart';

/// Result of checking a generated task; [reason] says why it was rejected.
class Verdict {
  const Verdict.ok() : reason = null;
  const Verdict.rejected(String this.reason);

  final String? reason;
  bool get ok => reason == null;
}

final _spaces = RegExp(r'[\s  ]');

/// Checks a task's answer against its machine-checkable form.
///
/// Grade 5, part 1 only has natural numbers and zero, so negative or
/// non-integer intermediate results are rejected too.
Verdict verifyTask(MathTask task) {
  if (task.answer < 0) return const Verdict.rejected('отрицательный ответ');
  try {
    switch (task.type) {
      case TaskType.expression:
        final expr = task.expr ?? (throw const FormatException('нет expr'));
        // The student only sees `question`: it must actually contain the expression.
        final shown = _numbers(task.question);
        final missing = _numbers(expr).where((n) => !shown.contains(n)).toList();
        if (missing.isNotEmpty) return Verdict.rejected('в тексте задания нет чисел ${missing.join(', ')}');
        final v = evaluate(expr);
        return v == task.answer ? const Verdict.ok() : Verdict.rejected('выражение равно $v, а не ${task.answer}');
      case TaskType.equation:
        final eq = task.equation ?? (throw const FormatException('нет equation'));
        final variable = task.variable ?? (throw const FormatException('нет variable'));
        final sides = eq.split('=');
        if (sides.length != 2) return Verdict.rejected('уравнение без одного знака «=»: $eq');
        if (!sides.join().contains(variable)) return Verdict.rejected('в уравнении нет переменной $variable');
        String sub(String s) => s.replaceAll(variable, '(${task.answer})');
        final l = evaluate(sub(sides[0])), r = evaluate(sub(sides[1]));
        return l == r ? const Verdict.ok() : Verdict.rejected('при ${task.answer}: $l ≠ $r');
      case TaskType.word:
        final v = evaluate(task.solutionExpr ?? (throw const FormatException('нет solution_expr')));
        return v == task.answer ? const Verdict.ok() : Verdict.rejected('решение даёт $v, а не ${task.answer}');
    }
  } on FormatException catch (e) {
    return Verdict.rejected(e.message);
  }
}

/// Numbers as written, with thousands separators removed: "12 450" -> "12450".
Set<String> _numbers(String text) =>
    RegExp(r'\d(?:[\d\s  ]*\d)?').allMatches(text).map((m) => m[0]!.replaceAll(_spaces, '')).toSet();

/// Evaluates + − × : and brackets over natural numbers; throws [FormatException]
/// on anything else, on negative intermediate results and on inexact division.
int evaluate(String source) {
  final s = source
      .replaceAll(_spaces, '')
      .replaceAll(RegExp('[–−—]'), '-')
      .replaceAll(RegExp('[·×]'), '*')
      .replaceAll(':', '/');
  var pos = 0;

  Never fail(String what) => throw FormatException('$what в «$source»');

  late int Function() sum;

  int atom() {
    if (pos < s.length && s[pos] == '(') {
      pos++;
      final v = sum();
      if (pos >= s.length || s[pos] != ')') fail('нет закрывающей скобки');
      pos++;
      return v;
    }
    final start = pos;
    while (pos < s.length && '0123456789'.contains(s[pos])) {
      pos++;
    }
    if (start == pos) fail('ожидалось число');
    return int.parse(s.substring(start, pos));
  }

  int product() {
    var v = atom();
    while (pos < s.length && (s[pos] == '*' || s[pos] == '/')) {
      final op = s[pos++];
      final rhs = atom();
      if (op == '*') {
        v *= rhs;
      } else {
        if (rhs == 0 || v % rhs != 0) fail('деление нацело невозможно');
        v ~/= rhs;
      }
    }
    return v;
  }

  sum = () {
    var v = product();
    while (pos < s.length && (s[pos] == '+' || s[pos] == '-')) {
      final op = s[pos++];
      final rhs = product();
      v = op == '+' ? v + rhs : v - rhs;
      if (v < 0) fail('отрицательный промежуточный результат');
    }
    return v;
  };

  final v = sum();
  if (pos != s.length) fail('лишние символы');
  return v;
}
