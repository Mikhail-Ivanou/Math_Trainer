/**
 * Splits the text of a textbook (one string per PDF page) into topics, one per
 * paragraph (§). Written for «Математика. 5 класс» (Адукацыя і выхаванне, 2025):
 * - a paragraph starts at a heading set with wide spacing: "§  8.    Сложение  и ..."
 *   (running headers use a single space: "§ 8.  Сложение и ...");
 * - its exercises start at "Решаем вместе";
 * - the table of contents («Содержание») has the exact titles and book pages.
 */

export interface TocEntry {
  chapter: number;
  chapterTitle: string;
  paragraph: number;
  title: string;
  bookPage: number;
}

export interface Topic extends TocEntry {
  /** First and last PDF page (1-based) the paragraph spans. */
  pdfPages: [number, number];
  /** Rules and worked examples: from the heading to «Решаем вместе». */
  theory: string;
  /** The paragraph's own exercises, as printed. */
  exercises: string;
}

const WATERMARK = /^\s*Правообладатель Адукацыя i выхаванне\s*$/gm;

/** Removes the running header (first two lines: chapter or § title + page number) and the watermark. */
export function stripPage(page: string): string {
  const lines = page.replace(WATERMARK, '').split('\n');
  const isHeader = (l: string | undefined) => !!l && /^(Глава \d+\.|§ \d+\.)/.test(l.replace(/\t/g, ' ').trim());
  if (isHeader(lines[0]) && /^\s*\d{1,3}\s*$/.test(lines[1] ?? '')) lines.splice(0, 2);
  return lines.join('\n');
}

/** Makes extracted text readable: tabs, hyphenation, thousands separators, runs of spaces. */
export function normalize(text: string): string {
  return text
    .replace(/\t/g, ' ')
    // «вы-\nчитания», «ве\n-\nличин», «ре -\nзультата» -> one word
    .replace(/(\p{Ll})[ \t]*\n?[ \t]*-[ \t]*\n\s*(\p{Ll})/gu, '$1$2')
    // «а)\n об одной величине» -> «а) об одной величине»
    .replace(/^[ \t]*([а-е]\))[ \t]*\n[ \t]*/gmu, '$1 ')
    .replace(/(?<=\d) {1,4}(?=\d{3}\b)/g, ' ') // «89   587» -> «89 587» (narrow no-break space)
    .replace(/[  ]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Parses «Содержание» into paragraphs with their chapter and book page. */
export function parseToc(pages: string[]): TocEntry[] {
  const tocPage = pages.findLastIndex((p) => /^\s*Содержание\s*$/m.test(p));
  if (tocPage < 0) throw new Error('no «Содержание» page');
  // Titles wrap across lines; join everything and split on the dot leaders instead.
  const toc = pages[tocPage].replace(/\t/g, ' ').replace(/\s+/g, ' ');
  const chapters = [...toc.matchAll(/Глава (\d+)\. (.+?) (?=§)/g)].map((m) => ({
    at: m.index!,
    chapter: Number(m[1]),
    title: m[2].trim(),
  }));
  const entries: TocEntry[] = [];
  for (const m of toc.matchAll(/§ ?(\d+)\. (.+?) ?\.{3,} ?(\d+)/g)) {
    const chapter = chapters.filter((c) => c.at < m.index!).at(-1);
    if (!chapter) continue;
    entries.push({
      chapter: chapter.chapter,
      chapterTitle: chapter.title,
      paragraph: Number(m[1]),
      title: m[2].trim(),
      bookPage: Number(m[3]),
    });
  }
  return entries;
}

export function splitTopics(pages: string[]): Topic[] {
  const toc = parseToc(pages);
  // Find each paragraph's heading: page index and offset in the stripped page.
  const stripped = pages.map(stripPage);
  const starts = toc.map((entry) => {
    const heading = new RegExp(`^§ {2,}${entry.paragraph}\\.`, 'm');
    for (let i = 0; i < stripped.length; i++) {
      const m = heading.exec(stripped[i].replace(/\t/g, ' '));
      if (m) return { page: i, offset: m.index };
    }
    throw new Error(`heading of § ${entry.paragraph} not found`);
  });
  // A chapter ends at its «Итоговая самооценка»; the book's body ends at «Ответы».
  const endMarker = /^\s*(Итоговая самооценка|Ответы)\s*$/m;

  return toc.map((entry, k) => {
    const from = starts[k];
    const to = starts[k + 1] ?? { page: stripped.length - 1, offset: Infinity };
    // Pages from this heading up to the next one, each tagged with its PDF page.
    const chunks: { page: number; text: string }[] = [];
    for (let i = from.page; i <= to.page; i++) {
      const page = stripped[i].replace(/\t/g, ' ');
      chunks.push({ page: i, text: page.slice(i === from.page ? from.offset : 0, i === to.page ? to.offset : undefined) });
    }
    let raw = chunks.map((c) => c.text).join('\n');
    let lastPage = to.page;
    const end = endMarker.exec(raw);
    if (end) {
      raw = raw.slice(0, end.index);
      // The PDF page the cut falls on: count the chunk lengths up to it.
      let seen = 0;
      lastPage = chunks.find((c) => (seen += c.text.length + 1) > end.index)!.page;
    } else if (to.offset === 0) {
      lastPage = to.page - 1;
    }

    // Drop the heading: its first line, plus a second one when the title wraps.
    const lines = normalize(raw).split('\n');
    lines.shift();
    if (lines[0] && !/[.!?:]$/.test(lines[0]) && entry.title.includes(lines[0].trim().split(' ')[0])) lines.shift();
    const body = lines.join('\n').trim();

    const split = body.search(/^Решаем вместе\s*$/m);
    return {
      ...entry,
      pdfPages: [from.page + 1, lastPage + 1],
      theory: (split < 0 ? body : body.slice(0, split)).trim(),
      exercises: split < 0 ? '' : body.slice(split).replace(/^Решаем вместе\s*/, '').trim(),
    };
  });
}
