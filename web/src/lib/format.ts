/** Answers the textbook way (same as formatAnswer / formatExpression in app/lib/topic_screen.dart). */
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };

export function formatExpression(e: string): string {
  let s = e.replace(/ /g, '').replace(/\^(-?\d+)/g, (_, p: string) => [...p].map((c) => SUP[c]).join(''));
  s = s.replace(/\*/g, '·').replace(/\//g, ' : ');
  s = s.replace(/(?<=[^(\s])([+-])/g, (_, op: string) => ` ${op === '-' ? '−' : '+'} `);
  return s.replace(/-/g, '−');
}

/** "12450" -> "12 450", "2.5" -> "2,5", "-7/3" -> "−7/3". */
export function formatAnswer(answer: string, unit?: string): string {
  const m = /^(-?)(\d+)([.,]\d+)?(\/\d+)?$/.exec(answer.trim());
  const text = m
    ? `${m[1] ? '−' : ''}${m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${(m[3] ?? '').replace('.', ',')}${m[4] ?? ''}`
    : formatExpression(answer);
  return unit ? `${text} ${unit}` : text;
}
