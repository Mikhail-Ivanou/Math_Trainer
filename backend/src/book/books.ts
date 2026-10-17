/** Textbooks of the reference library (all from https://e-padruchnik.adu.by/, Russian-language editions). */
export interface BookConfig {
  id: string;
  file: string;
  grade: number;
  subject: 'math' | 'algebra' | 'geometry';
  title: string;
  authors: string;
  year: number;
  /** id of the book on e-padruchnik.adu.by (POST id=<portalId>, getbook). */
  portalId: number;
}

export const BOOKS: BookConfig[] = [
  {
    id: 'math5-1',
    file: 'Matematika_5kl_ch1_Gerasimov_rus_2025.pdf',
    grade: 5,
    subject: 'math',
    title: 'Математика. 5 класс. Часть 1',
    authors: 'Герасимов В. Д., Пирютко О. Н., Лобанов А. П.',
    year: 2025,
    portalId: 1149,
  },
  {
    id: 'math5-2',
    file: 'Matematika_5kl_ch2_Gerasimov_rus_2025.pdf',
    grade: 5,
    subject: 'math',
    title: 'Математика. 5 класс. Часть 2',
    authors: 'Герасимов В. Д., Пирютко О. Н., Терешко О. А., Лобанов А. П.',
    year: 2025,
    portalId: 1175,
  },
  {
    id: 'math6',
    file: 'Matematika_6kl_Gerasimov_rus_2022.pdf',
    grade: 6,
    subject: 'math',
    title: 'Математика. 6 класс',
    authors: 'Герасимов В. Д., Пирютко О. Н.',
    year: 2022,
    portalId: 967,
  },
  {
    id: 'algebra7',
    file: 'Algebra_7kl_Arefieva_rus_2022.pdf',
    grade: 7,
    subject: 'algebra',
    title: 'Алгебра. 7 класс',
    authors: 'Арефьева И. Г., Пирютко О. Н.',
    year: 2022,
    portalId: 966,
  },
  {
    id: 'geometry7',
    file: 'Geometriya_7kl_Kazakov_rus_2022.pdf',
    grade: 7,
    subject: 'geometry',
    title: 'Геометрия. 7 класс',
    authors: 'Казаков В. В.',
    year: 2022,
    portalId: 971,
  },
];
