/**
 * Task generation and rule matching for the website, through the local
 * server (port of app/lib/tasks/task_generator.dart and
 * app/lib/topics/topic_matcher.dart — keep the prompts in sync).
 */
import { isMathLike, subjectGenitive } from '../book/books.js';
import { chatJson } from '../llm.js';
import { parseTask, verifyTask, type Difficulty, type MathTask, type TaskType } from './verifier.js';

export interface GenerationRequest {
  topicTitle: string;
  rule: string;
  context?: string;
  grade: number;
  subject?: string;
  level?: Difficulty;
}

export function counts(subject = 'math', level: Difficulty = 'medium'): Partial<Record<TaskType, number>> {
  const expert = level === 'expert';
  // Outside maths only calculation problems: their number answer is what can be checked.
  if (subject === 'geometry' || !isMathLike(subject)) return { word: expert ? 6 : 8 };
  if (subject === 'algebra') return expert ? { expression: 1, equation: 2, simplify: 2, word: 1 } : { expression: 2, equation: 2, simplify: 3, word: 1 };
  return expert ? { expression: 2, equation: 2, word: 2 } : { expression: 3, equation: 2, word: 3 };
}

const LEVEL_FOR_MODEL: Record<Difficulty, string> = {
  easy: 'лёгкий: правило в один шаг, небольшие числа',
  medium: 'средний: как основные задания учебника — правило применяется в 2–3 шага, числа побольше, есть скобки и порядок действий',
  hard: 'сложный: 3–5 шагов, правило нужно сочетать с ранее изученным, числа неудобные, формулировка непрямая, есть ловушки (типичные ошибки учеников); текстовые задачи — в несколько действий',
  expert:
    'максимальный: задания повышенной трудности и олимпиадного типа для сильных учеников этого класса. ' +
    'Главное — не длина, а идея: задание решается быстро, если догадаться, как применить правило, и долго или никак, если считать в лоб. ' +
    'Приёмы: «вычислите удобным способом» с числами вида 99, 101, 999, 1 001, 2 024; «не вычисляя, найдите»; ' +
    'вынести общий множитель, сгруппировать, свернуть или разложить по правилу, заметить, что выражение равно нулю или круглому числу; ' +
    'уравнения, которые сводятся к простому только после применения правила; текстовые задачи, где правило даёт короткое решение вместо долгого счёта. ' +
    'Не делай задание сложным за счёт длинных вычислений и лишних шагов. ' +
    'Всё решается знаниями ученика этого класса, без формул из старших классов, ответ однозначный',
};

const TYPE_HINT: Record<TaskType, string> = {
  expression: 'вычислить значение числового выражения',
  equation: 'решить уравнение с одной переменной (один корень)',
  simplify: 'упростить выражение с переменными (раскрыть скобки, привести подобные)',
  word: 'текстовая задача с числовым ответом',
};

const subjectName = (s?: string) => subjectGenitive(s ?? 'math');

/** The word-task hint: calculation problems with units outside maths. */
const wordHint = (subject = 'math') =>
  isMathLike(subject) ? TYPE_HINT.word : 'расчётная задача по теме с числовым ответом; в unit — единица ответа (м/с, Н, г, моль…); в solution_expr — вычисление ответа из чисел условия';

export function systemPrompt(r: GenerationRequest): string {
  return `Ты — методист и учитель ${subjectName(r.subject)} ${r.grade} класса (Беларусь). Ты составляешь тренировочные задания для ученика на одно конкретное правило, которое тебе дают.
Правила:
- используй только то, что ученик ${r.grade} класса уже знает к этой теме: правило темы и материал прошлых классов;
- формулировки на русском языке, понятные ученику ${r.grade} класса;
- текст задания (question) должен быть полным: ученик видит только его, поэтому выражение или уравнение пиши прямо в question;
- в question числа с пробелом между классами (12 450), десятичная запятая (2,5), знаки ·, :, −;
- все задания одного уровня — того, что указан в запросе; разные по сюжету и приёму, без повторов;
- ответ к каждому заданию обязателен и должен быть верным — перепроверь вычисления.
Верни только JSON без пояснений и без markdown.`;
}

export function userPrompt(r: GenerationRequest): string {
  const level = r.level ?? 'medium';
  const c = counts(r.subject, level);
  const total = Object.values(c).reduce((a, b) => a + (b ?? 0), 0);
  const lines = Object.entries(c).map(([type, n]) => `- ${n} заданий type "${type}" — ${type === 'word' ? wordHint(r.subject) : TYPE_HINT[type as TaskType]}`);
  const context = r.context
    ? `
Параграф учебника, из которого это правило (только чтобы понимать, что ученик уже знает):
<<<
${r.context}
>>>
`
    : '';
  return `Правило «${r.topicTitle}»:
<<<
${r.rule}
>>>
${context}
Составь ${total} новых заданий, каждое из которых тренирует именно это правило.
Уровень всех заданий — ${LEVEL_FOR_MODEL[level]}. В поле difficulty у всех пиши "${level}".
${lines.join('\n')}

Поля для проверки ответа (их видит только программа):
- answer — число без пробелов: целое «12450», десятичная дробь «2.5», обыкновенная «-7/3» (смешанное число пиши неправильной дробью); для simplify — упрощённое выражение;
- expr, equation, solution_expr — выражения только из чисел, переменных (одна буква), + - * / ^ и скобок, например «(2.5+3/4)*4», «3(x-2)+1=10», «(a+b)^2».

Формат ответа:
{"tasks": [
  {"type": "expression", "difficulty": "${level}", "question": "Вычислите: 1 234 + 5 678", "expr": "1234+5678", "answer": "6912"},
  {"type": "equation", "difficulty": "...", "question": "Решите уравнение: 3x − 4 = 11", "equation": "3x-4=11", "variable": "x", "answer": "5"},
  {"type": "simplify", "difficulty": "...", "question": "Упростите выражение: 2a + 3a − b", "expr": "2a+3a-b", "answer": "5a-b"},
  {"type": "word", "difficulty": "...", "question": "...", "solution_expr": "выражение, дающее ответ", "answer": "42", "unit": "км"}
]}`;
}

export interface GenerationResult {
  tasks: MathTask[];
  rejected: { raw: unknown; reason: string }[];
  model: string;
}

export async function generateTasks(r: GenerationRequest, model?: string): Promise<GenerationResult> {
  const level = r.level ?? 'medium';
  const { data } = await chatJson<{ tasks?: unknown[] }>(systemPrompt(r), userPrompt(r), { model, maxTokens: 8000 });
  if (!Array.isArray(data.tasks)) throw new Error('Модель вернула JSON без списка tasks');
  const tasks: MathTask[] = [];
  const rejected: GenerationResult['rejected'] = [];
  for (const raw of data.tasks) {
    try {
      // The batch is one level, whatever the model wrote in "difficulty".
      const t = parseTask({ ...(raw as object), difficulty: level });
      const why = verifyTask(t);
      why ? rejected.push({ raw, reason: why }) : tasks.push(t);
    } catch (e) {
      rejected.push({ raw, reason: `не разобрано: ${(e as Error).message}` });
    }
  }
  return { tasks, rejected, model: model ?? process.env.AIAI_MODEL ?? 'claude-haiku-5.5' };
}

export interface CatalogRule {
  id: string;
  title: string;
  keywords?: string[];
  bookTitle: string;
  sectionNumber: number;
  sectionTitle: string;
}

/** The rules of the grade's catalog a student's request is about; invented ids are dropped. */
export async function matchRules(request: string, catalog: CatalogRule[], max = 4): Promise<{ id: string; why: string }[]> {
  if (!catalog.length) return [];
  const byId = new Map(catalog.map((r) => [r.id, r]));
  let lines = '';
  let section = '';
  for (const r of catalog) {
    const s = `${r.bookTitle}, § ${r.sectionNumber}. ${r.sectionTitle}`;
    if (s !== section) lines += `# ${s}\n`;
    section = s;
    lines += `${r.id} | ${r.title} | ${(r.keywords ?? []).join(', ')}\n`;
  }
  const { data } = await chatJson<{ matches?: { id: string; why?: string }[] }>(
    'Ты помогаешь школьнику найти в учебниках конкретное правило, которое ему трудно даётся. Выбирай только из списка правил. Верни только JSON.',
    `Ученик написал: «${request}»

Правила из учебников по параграфам (id | правило | ключевые слова):
${lines}
Выбери до ${max} правил, которые лучше всего подходят под запрос, самое подходящее первым. Предпочитай конкретное правило, а не общее. Если ничего не подходит, верни пустой список.
Формат: {"matches": [{"id": "…", "why": "коротко, почему подходит"}]}`,
    { maxTokens: 1500 },
  );
  const seen = new Set<string>();
  return (data.matches ?? [])
    .filter((m) => byId.has(m.id) && !seen.has(m.id) && seen.add(m.id))
    .slice(0, max)
    .map((m) => ({ id: m.id, why: (m.why ?? '').trim() }));
}
