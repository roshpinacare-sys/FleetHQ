// LLM adapter. Provider priority:
//   1. z-ai-web-dev-sdk when it is resolvable (sandbox / bundled deployments)
//   2. any OpenAI-compatible endpoint via OPENAI_API_KEY (+ optional OPENAI_BASE_URL / OPENAI_MODEL)
//   3. nothing → the office falls back to the clearly-labeled sim backend.
// No keys are ever hardcoded or logged.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  text: string;
  provider: string;
}

let cached: { kind: 'zai'; mod: unknown } | { kind: 'openai'; key: string; base: string; model: string } | { kind: 'none' } | undefined;

async function detect(): Promise<typeof cached> {
  if (cached) return cached;
  try {
    // dynamic + escaped so the dependency stays optional in public checkouts
    const mod = await import(/* webpackIgnore: true */ 'z-ai-web-dev-sdk');
    cached = { kind: 'zai', mod };
    return cached;
  } catch {
    /* not available */
  }
  if (process.env.OPENAI_API_KEY) {
    cached = {
      kind: 'openai',
      key: process.env.OPENAI_API_KEY,
      base: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    };
    return cached;
  }
  cached = { kind: 'none' };
  return cached;
}

export async function llmAvailable(): Promise<{ ok: boolean; provider: string }> {
  const c = await detect();
  if (c.kind === 'zai') return { ok: true, provider: 'z-ai' };
  if (c.kind === 'openai') return { ok: true, provider: `openai:${c.model}` };
  return { ok: false, provider: 'none' };
}

// ---- global concurrency gate --------------------------------------------------------------
// One LLM call at a time with a small gap keeps the office readable (agents act in turn,
// like a real operations room) and respects provider rate limits.
// NOTE: the guide endpoint (/api/visitor-chat) shares this provider — keep the gaps
// generous so a patrol never starves the public chat (measured: hard 429 saturation).
let chain: Promise<unknown> = Promise.resolve();
const GAP_MS = 2600;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(() => new Promise((r) => setTimeout(r, GAP_MS)), () => new Promise((r) => setTimeout(r, GAP_MS)));
  return run as Promise<T>;
}

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = (e as Error).message ?? '';
      if (msg.includes('NO_LLM')) throw e;
      // 429s need LONG spacing — hammering keeps the shared quota saturated forever
      const wait = msg.includes('429') || msg.toLowerCase().includes('too many') ? 14000 * (i + 1) : 2500 * (i + 1) * (i + 1);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export async function chat(messages: ChatMessage[], _maxTokens = 900): Promise<ChatResult> {
  return enqueue(() => withRetry(() => chatRaw(messages, _maxTokens)));
}

async function chatRaw(messages: ChatMessage[], maxTokens = 900): Promise<ChatResult> {
  const c = await detect();
  if (c.kind === 'zai') {
    const ZAI = (c.mod as any).default ?? (c.mod as any);
    const zai = await ZAI.create();
    // the SDK expects the system prompt as the first message with role 'assistant'
    const mapped = messages.map((m, i) => ({
      role: m.role === 'system' ? (i === 0 ? 'assistant' : 'user') : m.role,
      content: m.role === 'system' && i > 0 ? `[הנחיית מערכת] ${m.content}` : m.content,
    }));
    const completion = await zai.chat.completions.create({
      messages: mapped,
      thinking: { type: 'disabled' },
    });
    const text = completion?.choices?.[0]?.message?.content ?? '';
    return { text, provider: 'z-ai' };
  }
  if (c.kind === 'openai') {
    const res = await fetch(`${c.base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.key}` },
      body: JSON.stringify({ model: c.model, messages, max_tokens: maxTokens, temperature: 0.4 }),
    });
    if (!res.ok) throw new Error(`llm http ${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { text: json.choices?.[0]?.message?.content ?? '', provider: `openai:${c.model}` };
  }
  throw new Error('NO_LLM');
}

/** Extract a JSON object from a model reply that may include prose or fences. */
export function extractJson<T = Record<string, unknown>>(text: string): T | undefined {
  if (!text) return undefined;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  if (start === -1) return undefined;
  // walk to the matching closing brace
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1)) as T;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}
