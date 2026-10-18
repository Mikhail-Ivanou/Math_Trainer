/** The same data as the app (app/lib/data/models.dart), see firebase/firestore.rules. */

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

export interface StoredTask extends MathTask {
  id: string;
  source: string;
  createdAt?: Date;
}

export interface CatalogRule {
  id: string;
  title: string;
  keywords?: string[];
  bookId: string;
  bookTitle: string;
  subject: string;
  chapterTitle: string;
  sectionId: string;
  sectionNumber: number;
  sectionTitle: string;
}

export interface Topic {
  id: string;
  title: string;
  rule: string;
  grade: number;
  subject: string;
  bookId: string;
  bookTitle: string;
  chapter: number;
  chapterTitle: string;
  sectionId: string;
  sectionNumber: number;
  sectionTitle: string;
}

export const subjectNames: Record<string, string> = {
  math: 'Математика',
  algebra: 'Алгебра',
  geometry: 'Геометрия',
  physics: 'Физика',
  chemistry: 'Химия',
  biology: 'Биология',
  informatics: 'Информатика',
  geography: 'География',
  astronomy: 'Астрономия',
};

export const levelNames: Record<Difficulty, string> = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный', expert: 'Максимальный' };

export const levelHints: Partial<Record<Difficulty, string>> = {
  medium: 'Как задания из учебника: правило в 2–3 шага, числа побольше',
  hard: 'В 3–5 шагов, вместе с другими правилами, с подвохом',
  expert: 'Повышенная трудность, почти олимпиада: нужна догадка',
};

export const difficultyLabel: Record<Difficulty, string> = { easy: 'легко', medium: 'средне', hard: 'сложно', expert: 'максимум' };
export const typeLabel: Record<TaskType, string> = { expression: 'вычисли', equation: 'уравнение', word: 'задача', simplify: 'упрости' };

export const topicSource = (t: Pick<Topic, 'sectionNumber' | 'sectionTitle'>) => `§ ${t.sectionNumber}. ${t.sectionTitle}`;
