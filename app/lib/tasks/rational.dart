/// Exact fraction arithmetic, so 0,1 + 0,2 == 3/10 and answers are compared exactly.
class Rational implements Comparable<Rational> {
  factory Rational(BigInt num, [BigInt? den]) {
    den ??= BigInt.one;
    if (den == BigInt.zero) throw const FormatException('деление на нуль');
    if (den.isNegative) {
      num = -num;
      den = -den;
    }
    final g = num.gcd(den);
    return Rational._(g == BigInt.zero ? num : num ~/ g, g == BigInt.zero ? den : den ~/ g);
  }

  const Rational._(this.num, this.den);

  factory Rational.fromInt(int n) => Rational(BigInt.from(n));

  final BigInt num;
  final BigInt den;

  static final zero = Rational.fromInt(0);
  static final one = Rational.fromInt(1);

  /// Parses an answer as a student or the model writes it: "12 450", "-7", "2,5",
  /// "-0.75", "3/4", "−7/3". Mixed numbers are not accepted (ambiguous with
  /// thousands separators): they should come as improper fractions.
  static Rational parse(String text) {
    final s = text.trim().replaceAll(RegExp(r'[\s  ]'), '').replaceAll(RegExp('[–−—]'), '-').replaceAll(',', '.');
    final m = RegExp(r'^(-?)(\d+)(?:\.(\d+))?(?:/(\d+))?$').firstMatch(s);
    if (m == null) throw FormatException('не число: $text');
    final sign = m[1] == '-' ? BigInt.from(-1) : BigInt.one;
    final frac = m[3] ?? '';
    var value = Rational(BigInt.parse('${m[2]}$frac'), BigInt.from(10).pow(frac.length));
    if (m[4] != null) {
      if (frac.isNotEmpty) throw FormatException('не число: $text');
      value = value / Rational(BigInt.parse(m[4]!));
    }
    return Rational(value.num * sign, value.den);
  }

  Rational operator +(Rational o) => Rational(num * o.den + o.num * den, den * o.den);
  Rational operator -(Rational o) => Rational(num * o.den - o.num * den, den * o.den);
  Rational operator *(Rational o) => Rational(num * o.num, den * o.den);
  Rational operator /(Rational o) {
    if (o.num == BigInt.zero) throw const FormatException('деление на нуль');
    return Rational(num * o.den, den * o.num);
  }

  Rational operator -() => Rational(-num, den);

  Rational pow(int e) {
    if (e < 0) return one / pow(-e);
    if (e > 64) throw const FormatException('слишком большая степень');
    return Rational(num.pow(e), den.pow(e));
  }

  bool get isInteger => den == BigInt.one;

  @override
  int compareTo(Rational other) => (num * other.den).compareTo(other.num * den);

  @override
  bool operator ==(Object other) => other is Rational && other.num == num && other.den == den;

  @override
  int get hashCode => Object.hash(num, den);

  @override
  String toString() => isInteger ? '$num' : '$num/$den';
}
