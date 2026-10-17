/**
 * Page-level structure of a textbook: running headers, the table of contents
 * and where each paragraph (§) starts in the body. Works across the grade 5–7
 * books, which differ in layout: § numbering restarts per chapter in grade 6,
 * the TOC is mangled (split digits, clipped titles), headers sit above or
 * below the page number.
 */

export interface TocEntry {
  chapter: number;
  chapterTitle: string;
  number: number;
  title: string;
  /** Book page from the TOC, when the TOC has one. */
  bookPage?: number;
}

export interface Section extends TocEntry {
  /** First and last PDF page (1-based). */
  pdfPages: [number, number];
  text: string;
}

const WATERMARK = /^\s*Правообладатель [^\n]*$/gm;
const PAGE_NUMBER = /^\s*\d{1,3}\s*$/;

/**
 * Removes the watermark and the running header: a bare page number plus at
 * most one "Глава …" line next to it at the top of the page. A "§ …" line next
 * to the number is kept: it may be the paragraph's real heading (grade 6 puts
 * "5\n§  1.  Десятичная запись дробей." at the top of a page); running "§"
 * headers are removed later by [sliceSections].
 */
export function stripPage(page: string): string {
  const lines = page.replace(WATERMARK, '').replace(/[\t\u00a0\u202f]/g, ' ').split('\n');
  const numberAt = lines.slice(0, 3).findIndex((l) => PAGE_NUMBER.test(l));
  if (numberAt >= 0) {
    const isHeader = (l?: string) => !!l && l.trim().length < 110 && /^(Глава|глава)/.test(l.trim());
    let from = numberAt;
    let to = numberAt;
    if (from > 0 && isHeader(lines[from - 1])) from--;
    else if (isHeader(lines[to + 1])) to++;
    if (from <= 1) lines.splice(from, to - from + 1);
  }
  return lines.join('\n');
}

/** Makes extracted text readable: hyphenation, thousands separators, runs of spaces. */
export function normalize(text: string): string {
  return text
    .replace(/\t/g, ' ')
    // «вы-\nчитания», «ве\n-\nличин», «ре -\nзультата» -> one word
    .replace(/(\p{Ll})[ \t]*\n?[ \t]*-[ \t]*\n\s*(\p{Ll})/gu, '$1$2')
    // «а)\n об одной величине» -> «а) об одной величине»
    .replace(/^[ \t]*([а-е]\))[ \t]*\n[ \t]*/gmu, '$1 ')
    .replace(/(?<=\d) {1,4}(?=\d{3}\b)/g, ' ') // «89   587» -> «89 587»
    .replace(/[  ]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const TOC_TITLE = /^\s*с\s*о\s*д\s*е\s*р\s*ж\s*а\s*н\s*и\s*е\s*$/im;

/** PDF page indexes (0-based) of the table of contents, at the end of the book. */
export function findTocPages(pages: string[]): number[] {
  const tail = pages.length - 15;
  const start = pages.findIndex((p, i) => i >= tail && TOC_TITLE.test(p) && /§/.test(p));
  if (start < 0) throw new Error('table of contents not found');
  const out = [start];
  for (let i = start + 1; i < pages.length && /§|Глава|глава/.test(pages[i]); i++) out.push(i);
  return out;
}

/**
 * Finds where each TOC entry starts, scanning forward so that § numbers that
 * restart per chapter resolve in order. A heading is a line "§ N." (optionally
 * "N*.") whose rest — or the next line — contains the first long word of the title.
 */
export function findSectionStarts(pages: string[], entries: TocEntry[], bodyEnd: number): { page: number; offset: number }[] {
  const stripped = pages.map(stripPage);
  const starts: { page: number; offset: number }[] = [];
  let cursor = { page: 1, offset: 0 };
  for (const e of entries) {
    const word = (e.title.match(/[\p{L}]{4,}/u)?.[0] ?? '').toLowerCase();
    const heading = new RegExp(`^[ ]*§[ ]*${e.number}[ ]*\\*?[ ]*\\.([^\\n]*)\\n?([^\\n]*)`, 'gm');
    let found: { page: number; offset: number } | undefined;
    for (let p = cursor.page; p < bodyEnd && !found; p++) {
      heading.lastIndex = p === cursor.page ? cursor.offset : 0;
      for (let m = heading.exec(stripped[p]); m; m = heading.exec(stripped[p])) {
        const near = `${m[1]} ${m[2]}`.toLowerCase().replace(/\s+/g, ' ');
        if (!word || near.replace(/ /g, '').includes(word)) {
          found = { page: p, offset: m.index };
          break;
        }
      }
    }
    if (!found) throw new Error(`heading of § ${e.number} «${e.title}» (chapter ${e.chapter}) not found`);
    starts.push(found);
    cursor = { page: found.page, offset: found.offset + 1 };
  }
  return starts;
}

/** Chapter-end blocks that are not part of the last paragraph before them. */
const SECTION_END = /^[ ]*(Итоговая самооценка|Математика вокруг нас\*?|Тест для самопроверки|Практическая математика|Увлекательная математика|Ответы|База знаний[^\n]*)[ ]*$/m;

/** Repeated running headers inside a section: "§ 8. Сложение и вычитание …" lines after the first. */
function dropRunningHeaders(text: string, number: number): string {
  const running = new RegExp(`^[ ]*§[ ]*${number}[ ]*\\*?\\.[^\\n]*$`, 'gm');
  let first = true;
  return text.replace(running, (line) => {
    if (first) {
      first = false;
      return line;
    }
    return '';
  });
}

/** Text of each section: from its heading to the next one (the last ends at «Ответы» or the TOC). */
export function sliceSections(pages: string[], entries: TocEntry[]): Section[] {
  const toc = findTocPages(pages);
  const answers = pages.findIndex((p, i) => i > pages.length / 2 && /^\s*Ответы\s*$/m.test(stripPage(p)) && !/§/.test(p));
  const bodyEnd = answers > 0 ? answers : toc[0];
  const stripped = pages.map(stripPage);
  const starts = findSectionStarts(pages, entries, bodyEnd);
  return entries.map((e, k) => {
    const from = starts[k];
    const to = starts[k + 1] ?? { page: bodyEnd, offset: 0 };
    const chunks: { page: number; text: string }[] = [];
    for (let p = from.page; p <= to.page && p < pages.length; p++) {
      chunks.push({ page: p, text: stripped[p].slice(p === from.page ? from.offset : 0, p === to.page ? to.offset : undefined) });
    }
    // Stop at a chapter-end block (not looking at the heading line itself).
    let last = to.offset === 0 ? to.page - 1 : to.page;
    let raw = chunks.map((c) => c.text).join('\n');
    const firstBreak = raw.indexOf('\n');
    const end = SECTION_END.exec(raw.slice(firstBreak + 1));
    if (end) {
      const cut = firstBreak + 1 + end.index;
      raw = raw.slice(0, cut);
      let seen = 0;
      last = chunks.find((c) => (seen += c.text.length + 1) > cut)?.page ?? last;
    }
    const text = normalize(dropRunningHeaders(raw, e.number));
    return { ...e, pdfPages: [from.page + 1, Math.max(from.page, last) + 1], text };
  });
}
