/** Answer checks in exact fractions (port of app/lib/tasks/task_verifier.dart — keep them in sync). */
import { FormatError, Rational } from './rational.js';

export type TaskType = 'expression' | 'equation' | 'word' | 'simplify';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface MathTask {
  type: TaskType;
  difficulty: Difficulty;
  question: string;
  answer: string;
  expr?: string;
  equation?: string;
  variable?: string;
  solution_expr?: string;
  unit?: string;
}

const TYPES: TaskType[] = ['expression', 'equation', 'word', 'simplify'];
const LEVELS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
const SPACES = /[\s  ]/g;

/** Parses one task from the model's JSON; throws on missing or unknown fields. */
export function parseTask(raw: unknown): MathTask {
  const j = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string) => {
    const v = j[k];
    return v === null || v === undefined || `${v}`.trim() === '' ? undefined : `${v}`.trim();
  };
  const type = j.type as TaskType;
  const difficulty = j.difficulty as Difficulty;
  if (!TYPES.includes(type)) throw new FormatError(`unknown type "${j.type}"`);
  if (!LEVELS.includes(difficulty)) throw new FormatError(`unknown difficulty "${j.difficulty}"`);
  const question = str('question');
  const answer = str('answer');
  if (!question) throw new FormatError('no question');
  if (!answer) throw new FormatError('no answer');
  const t: MathTask = { type, difficulty, question, answer };
  for (const k of ['expr', 'equation', 'variable', 'solution_expr', 'unit'] as const) {
    const v = str(k);
    if (v) t[k] = v;
  }
  return t;
}

/** null when the task is right, otherwise why it was rejected. */
export function verifyTask(t: MathTask, random: () => number = Math.random): string | null {
  try {
    switch (t.type) {
      case 'expression': {
        if (!t.expr) return 'нет expr';
        const shown = numbers(t.question);
        const missing = [...numbers(t.expr)].filter((n) => !shown.has(n));
        if (missing.length) return `в тексте задания нет чисел ${missing.join(', ')}`;
        const v = evaluate(t.expr);
        return v.equals(Rational.parse(t.answer)) ? null : `выражение равно ${v}, а не ${t.answer}`;
      }
      case 'equation': {
        if (!t.equation) return 'нет equation';
        if (!t.variable) return 'нет variable';
        const sides = t.equation.split('=');
        if (sides.length !== 2) return `уравнение без одного знака «=»: ${t.equation}`;
        if (!sides.join('').includes(t.variable)) return `в уравнении нет переменной ${t.variable}`;
        const vars = { [t.variable]: Rational.parse(t.answer) };
        const l = evaluate(sides[0], vars), r = evaluate(sides[1], vars);
        return l.equals(r) ? null : `при ${t.answer}: ${l} ≠ ${r}`;
      }
      case 'word': {
        if (!t.solution_expr) return 'нет solution_expr';
        const v = evaluate(t.solution_expr);
        return v.equals(Rational.parse(t.answer)) ? null : `решение даёт ${v}, а не ${t.answer}`;
      }
      case 'simplify':
        if (!t.expr) return 'нет expr';
        return sameExpression(t.expr, t.answer, random) ? null : `«${t.answer}» не равно «${t.expr}»`;
    }
  } catch (e) {
    if (e instanceof FormatError) return e.message;
    throw e;
  }
}

/** Equal at several random rational points. */
export function sameExpression(a: string, b: string, random: () => number = Math.random): boolean {
  const names = new Set([...variablesOf(a), ...variablesOf(b)]);
  for (let i = 0; i < 5; i++) {
    const vars: Record<string, Rational> = {};
    for (const n of names) vars[n] = new Rational(BigInt(Math.floor(random() * 19) - 9), BigInt(Math.floor(random() * 4) + 1));
    try {
      if (!evaluate(a, vars).equals(evaluate(b, vars))) return false;
    } catch (e) {
      if (e instanceof FormatError && e.message === 'деление на нуль') continue;
      throw e;
    }
  }
  return true;
}

function numbers(text: string): Set<string> {
  return new Set([...text.matchAll(/\d(?:[\d\s  ]*\d)?(?:[.,]\d+)?/g)].map((m) => m[0].replace(SPACES, '').replace(',', '.')));
}

function clean(s: string): string {
  return s
    .replace(SPACES, '')
    .replace(/[–−—]/g, '-')
    .replace(/[·×∙]/g, '*')
    .replace(/:/g, '/')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3');
}

const LETTER = /[a-zA-Zа-яА-Я]/;

export function variablesOf(source: string): Set<string> {
  return new Set([...clean(source)].filter((c) => LETTER.test(c)));
}

/** + − · : ^, brackets, decimals, single-letter variables, implicit multiplication. */
export function evaluate(source: string, vars: Record<string, Rational> = {}): Rational {
  const s = clean(source);
  let pos = 0;
  const fail = (what: string): never => {
    throw new FormatError(`${what} в «${source}»`);
  };
  const at = (c: string) => pos < s.length && s[pos] === c;
  const startsAtom = () => pos < s.length && /[0-9a-zA-Zа-яА-Я(]/.test(s[pos]);

  const atom = (): Rational => {
    if (at('(')) {
      pos++;
      const v = sum();
      if (!at(')')) fail('нет закрывающей скобки');
      pos++;
      return v;
    }
    const m = /^\d+(?:[.,]\d+)?/.exec(s.slice(pos));
    if (m) {
      pos += m[0].length;
      return Rational.parse(m[0]);
    }
    if (pos < s.length && LETTER.test(s[pos])) {
      const name = s[pos++];
      return vars[name] ?? fail(`неизвестная переменная ${name}`);
    }
    return fail('ожидалось число');
  };
  const power = (): Rational => {
    const base = atom();
    if (!at('^')) return base;
    pos++;
    const neg = at('-');
    if (neg) pos++;
    const m = /^\d+/.exec(s.slice(pos)) ?? fail('нужен целый показатель степени');
    pos += m[0].length;
    return base.pow(Number(m[0]) * (neg ? -1 : 1));
  };
  const unary = (): Rational => {
    if (at('-')) {
      pos++;
      return unary().neg();
    }
    if (at('+')) {
      pos++;
      return unary();
    }
    return power();
  };
  const product = (): Rational => {
    let v = unary();
    for (;;) {
      if (at('*') || at('/')) {
        const op = s[pos++];
        const rhs = unary();
        v = op === '*' ? v.mul(rhs) : v.div(rhs);
      } else if (startsAtom()) {
        v = v.mul(power());
      } else return v;
    }
  };
  const sum = (): Rational => {
    let v = product();
    while (at('+') || at('-')) {
      const op = s[pos++];
      const rhs = product();
      v = op === '+' ? v.add(rhs) : v.sub(rhs);
    }
    return v;
  };

  if (!s) fail('пустое выражение');
  const v = sum();
  if (pos !== s.length) fail('лишние символы');
  return v;
}
