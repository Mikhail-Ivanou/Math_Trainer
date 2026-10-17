import { existsSync } from 'node:fs';

const envFile = new URL('../.env', import.meta.url).pathname;
if (existsSync(envFile)) process.loadEnvFile(envFile);

const BASE_URL = process.env.AIAI_BASE_URL ?? 'https://api.aiai.by/v1';
export const MODEL = process.env.AIAI_MODEL ?? 'claude-haiku-5.5';

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

/** One chat completion against aiai.by; returns the parsed JSON object from the reply. */
export async function chatJson<T>(system: string, user: string, opts: { maxTokens?: number; model?: string } = {}): Promise<{ data: T; usage?: ChatUsage }> {
  const key = process.env.AIAI_API_KEY;
  if (!key) throw new Error('AIAI_API_KEY is not set (backend/.env)');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model ?? MODEL,
        max_tokens: opts.maxTokens ?? 8000,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      throw new Error(`aiai.by ${res.status}: ${text.slice(0, 300)}`);
    }
    const body = JSON.parse(text);
    const content: string = body.choices?.[0]?.message?.content ?? '';
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error(`no JSON in reply: ${content.slice(0, 200)}`);
    return { data: JSON.parse(content.slice(start, end + 1)) as T, usage: body.usage };
  }
}
