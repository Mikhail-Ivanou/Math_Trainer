import 'dart:math';

import 'rational.dart';
import 'task.dart';

/// Result of checking a generated task; [reason] says why it was rejected.
class Verdict {
  const Verdict.ok() : reason = null;
  const Verdict.rejected(String this.reason);

  final String? reason;
  bool get ok => reason == null;
}

final _spaces = RegExp(r'[\s  ]');

/// Checks a task's answer against its machine-checkable form, in exact fractions.
Verdict verifyTask(MathTask task, {Random? random}) {
  try {
    switch (task.type) {
      case TaskType.expression:
        final expr = task.expr ?? (throw const FormatException('нет expr'));
        // The student only sees `question`: it must actually contain the expression.
        final shown = _numbers(task.question);
        final missing = _numbers(expr).where((n) => !shown.contains(n)).toList();
        if (missing.isNotEmpty) return Verdict.rejected('в тексте задания нет чисел ${missing.join(', ')}');
        final v = evaluate(expr);
        final a = Rational.parse(task.answer);
        return v == a ? const Verdict.ok() : Verdict.rejected('выражение равно $v, а не ${task.answer}');
      case TaskType.equation:
        final eq = task.equation ?? (throw const FormatException('нет equation'));
        final variable = task.variable ?? (throw const FormatException('нет variable'));
        final sides = eq.split('=');
        if (sides.length != 2) return Verdict.rejected('уравнение без одного знака «=»: $eq');
        if (!sides.join().contains(variable)) return Verdict.rejected('в уравнении нет переменной $variable');
        final x = {variable: Rational.parse(task.answer)};
        final l = evaluate(sides[0], vars: x), r = evaluate(sides[1], vars: x);
        return l == r ? const Verdict.ok() : Verdict.rejected('при ${task.answer}: $l ≠ $r');
      case TaskType.word:
        final v = evaluate(task.solutionExpr ?? (throw const FormatException('нет solution_expr')));
        final a = Rational.parse(task.answer);
        return v == a ? const Verdict.ok() : Verdict.rejected('решение даёт $v, а не ${task.answer}');
      case TaskType.simplify:
        final expr = task.expr ?? (throw const FormatException('нет expr'));
        return sameExpression(expr, task.answer, random: random)
            ? const Verdict.ok()
            : Verdict.rejected('«${task.answer}» не равно «$expr»');
    }
  } on FormatException catch (e) {
    return Verdict.rejected(e.message);
  }
}

/// Whether two expressions with variables are equal: compared at several random points.
bool sameExpression(String a, String b, {Random? random}) {
  final rnd = random ?? Random();
  final names = {...variablesOf(a), ...variablesOf(b)};
  for (var i = 0; i < 5; i++) {
    final vars = {
      for (final n in names) n: Rational(BigInt.from(rnd.nextInt(19) - 9), BigInt.from(rnd.nextInt(4) + 1)),
    };
    try {
      if (evaluate(a, vars: vars) != evaluate(b, vars: vars)) return false;
    } on FormatException catch (e) {
      if (e.message == 'деление на нуль') continue; // unlucky point, try another
      rethrow;
    }
  }
  return true;
}

/// Numbers as written, with thousands separators removed: "12 450" -> "12450".
Set<String> _numbers(String text) => RegExp(r'\d(?:[\d\s  ]*\d)?(?:[.,]\d+)?')
    .allMatches(text)
    .map((m) => m[0]!.replaceAll(_spaces, '').replaceAll(',', '.'))
    .toSet();

String _clean(String source) => source
    .replaceAll(_spaces, '')
    .replaceAll(RegExp('[–−—]'), '-')
    .replaceAll(RegExp('[·×∙]'), '*')
    .replaceAll(':', '/')
    .replaceAll('²', '^2')
    .replaceAll('³', '^3');

/// Single-letter variables (Latin or Cyrillic) used in [source].
Set<String> variablesOf(String source) =>
    RegExp(r'[a-zA-Zа-яА-Я]').allMatches(_clean(source)).map((m) => m[0]!).toSet();

/// Evaluates + − · : ^ and brackets over exact fractions. Numbers may be
/// decimal ("2,5"); single letters are variables from [vars]; "2a", "3(x+1)"
/// and "(a+b)(a−b)" mean multiplication. Throws [FormatException] on anything else.
Rational evaluate(String source, {Map<String, Rational> vars = const {}}) {
  final s = _clean(source);
  var pos = 0;

  Never fail(String what) => throw FormatException('$what в «$source»');
  bool at(String c) => pos < s.length && s[pos] == c;
  bool startsAtom() => pos < s.length && RegExp(r'[0-9a-zA-Zа-яА-Я(]').hasMatch(s[pos]);

  late Rational Function() sum;

  Rational atom() {
    if (at('(')) {
      pos++;
      final v = sum();
      if (!at(')')) fail('нет закрывающей скобки');
      pos++;
      return v;
    }
    final number = RegExp(r'\d+(?:[.,]\d+)?').matchAsPrefix(s, pos);
    if (number != null) {
      pos = number.end;
      return Rational.parse(number[0]!);
    }
    if (pos < s.length && RegExp(r'[a-zA-Zа-яА-Я]').hasMatch(s[pos])) {
      final name = s[pos++];
      return vars[name] ?? fail('неизвестная переменная $name');
    }
    fail('ожидалось число');
  }

  Rational power() {
    final base = atom();
    if (!at('^')) return base;
    pos++;
    final negative = at('-');
    if (negative) pos++;
    final e = RegExp(r'\d+').matchAsPrefix(s, pos) ?? fail('нужен целый показатель степени');
    pos = e.end;
    return base.pow(int.parse(e[0]!) * (negative ? -1 : 1));
  }

  Rational unary() {
    if (at('-')) {
      pos++;
      return -unary();
    }
    if (at('+')) {
      pos++;
      return unary();
    }
    return power();
  }

  Rational product() {
    var v = unary();
    while (true) {
      if (at('*') || at('/')) {
        final op = s[pos++];
        final rhs = unary();
        v = op == '*' ? v * rhs : v / rhs;
      } else if (startsAtom()) {
        v = v * power(); // implicit: 2a, 3(x+1), (a+b)(a-b)
      } else {
        return v;
      }
    }
  }

  sum = () {
    var v = product();
    while (at('+') || at('-')) {
      final op = s[pos++];
      final rhs = product();
      v = op == '+' ? v + rhs : v - rhs;
    }
    return v;
  };

  if (s.isEmpty) fail('пустое выражение');
  final v = sum();
  if (pos != s.length) fail('лишние символы');
  return v;
}
