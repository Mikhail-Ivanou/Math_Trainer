import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// pdf-parse's index.js runs a self-test on require; the inner module doesn't.
const pdfParse: (data: Buffer, options?: Record<string, unknown>) => Promise<{ numpages: number }> =
  require('pdf-parse/lib/pdf-parse.js');

interface TextItem {
  str: string;
  transform: number[];
}

/** Text of every PDF page, with a line break wherever the baseline changes. */
export async function pdfPages(data: Buffer): Promise<string[]> {
  const pages: string[] = [];
  await pdfParse(data, {
    pagerender: async (page: { getTextContent(): Promise<{ items: TextItem[] }> }) => {
      const { items } = await page.getTextContent();
      let text = '';
      let lastY: number | undefined;
      for (const item of items) {
        if (lastY !== undefined && lastY !== item.transform[5]) text += '\n';
        text += item.str;
        lastY = item.transform[5];
      }
      pages.push(text);
      return text;
    },
  });
  return pages;
}
