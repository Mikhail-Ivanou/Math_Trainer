/** Exact fractions (port of app/lib/tasks/rational.dart). */
export class Rational {
  readonly num: bigint;
  readonly den: bigint;

  constructor(num: bigint, den: bigint = 1n) {
    if (den === 0n) throw new FormatError('деление на нуль');
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = gcd(num < 0n ? -num : num, den);
    this.num = g === 0n ? num : num / g;
    this.den = g === 0n ? den : den / g;
  }

  static of(n: number | bigint): Rational {
    return new Rational(BigInt(n));
  }

  /** "12 450", "-7", "2,5", "-0.75", "3/4", "−7/3". */
  static parse(text: string): Rational {
    const s = text.trim().replace(/[\s  ]/g, '').replace(/[–−—]/g, '-').replace(/,/g, '.');
    const m = /^(-?)(\d+)(?:\.(\d+))?(?:\/(\d+))?$/.exec(s);
    if (!m) throw new FormatError(`не число: ${text}`);
    const frac = m[3] ?? '';
    if (m[4] !== undefined && frac) throw new FormatError(`не число: ${text}`);
    let v = new Rational(BigInt(m[2] + frac), 10n ** BigInt(frac.length));
    if (m[4] !== undefined) v = v.div(new Rational(BigInt(m[4])));
    return m[1] === '-' ? v.neg() : v;
  }

  add(o: Rational) { return new Rational(this.num * o.den + o.num * this.den, this.den * o.den); }
  sub(o: Rational) { return new Rational(this.num * o.den - o.num * this.den, this.den * o.den); }
  mul(o: Rational) { return new Rational(this.num * o.num, this.den * o.den); }
  div(o: Rational) {
    if (o.num === 0n) throw new FormatError('деление на нуль');
    return new Rational(this.num * o.den, this.den * o.num);
  }
  neg() { return new Rational(-this.num, this.den); }
  pow(e: number): Rational {
    if (e < 0) return Rational.of(1).div(this.pow(-e));
    if (e > 64) throw new FormatError('слишком большая степень');
    return new Rational(this.num ** BigInt(e), this.den ** BigInt(e));
  }
  equals(o: Rational) { return this.num === o.num && this.den === o.den; }
  toString() { return this.den === 1n ? `${this.num}` : `${this.num}/${this.den}`; }
}

export class FormatError extends Error {}

function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a;
}
