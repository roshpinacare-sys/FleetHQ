// LLM adapter — SOVEREIGN MULTI-BRAIN CHAIN with deep failover.
//
// The crew is only as alive as its brains, so the office carries a fleet of
// independent providers and walks down the chain on ANY failure. Brains that
// need no signup are built in (Kilo free auto-router, LLM7 anonymous,
// Pollinations, OVH), keyed brains activate from env (xAI, OpenRouter, Groq,
// Cerebras, Mistral, Google AI Studio, GitHub Models, Together, any
// OpenAI-compatible), and the bundled z-ai SDK closes the chain. Failover is
// per PROVIDER+MODEL pair with an individual cooldown, so one dead model never
// hurts the others.
//
//   1. xAI Grok            (XAI_API_KEY)
//   2. OpenRouter          (OPENROUTER_API_KEY — 1 strong + :free rotation)
//   3. Groq                (GROQ_API_KEY — generous free tier)
//   4. Cerebras            (CEREBRAS_API_KEY — free tier)
//   5. Mistral La Plateforme (MISTRAL_API_KEY — free tier)
//   6. Google AI Studio    (GOOGLE_AI_API_KEY — free tier)
//   7. GitHub Models       (GITHUB_MODELS_TOKEN — free tier)
//   8. Together AI         (TOGETHER_API_KEY — free tier)
//   9. Kilo Code free auto (NO KEY — kilo-auto/free via kilocode.ai, verified live)
//  10. LLM7.io anonymous   (NO KEY — mistral-Nemo verified live; key raises limits)
//  11. Pollinations        (NO KEY — openai / openai-fast, verified live)
//  12. OVHcloud AI         (NO KEY — EU anonymous tier, ~2 RPM/model, verified live)
//  13. OpenAI-compatible   (OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL)
//  14. z-ai-web-dev-sdk    (bundled deployments)
//  15. nothing → the office falls back to the fit-routine / labeled sim path.
//
// Every keyed brain above activates THE MOMENT its env key appears — no code
// change needed. Model lists live in the VAULT (.env — gitignored, chmod 600)
// and their verified defaults are mirrored in .env.example committed to git.
//
// FRONT-DESK PRIORITY: the reception (Amit) and the crew share the same
// anonymous per-IP quotas. While a human visitor is waiting, the reception
// writes a tiny priority flag; this chain yields up to a few seconds so the
// visitor is never stuck behind crew chatter. The flag is ephemeral (/tmp),
// never sensitive, and its absence means "no priority, act normally".
//
// No keys are ever hardcoded or logged. Provider errors surface as honest,
// generic messages.

import { readFile } from 'node:fs/promises';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  text: string;
  provider: string;
}

interface Brain {
  name: string;
  base: string;
  key?: string; // undefined/empty → anonymous access (no auth header)
  models: string[];
  referer?: boolean; // send OpenRouter-style politeness headers
}

/** OpenAI-compatible keyed brain shorthand. */
function keyedBrain(name: string, base: string, key: string | undefined, models: string[]): Brain[] {
  if (!key) return [];
  return [{ name, base, key, models }];
}

function parseModels(envVal: string | undefined, fallback: string[]): string[] {
  const list = (envVal ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : fallback;
}

function buildBrains(): Brain[] {
  const brains: Brain[] = [];
  if (process.env.XAI_API_KEY) {
    brains.push({
      name: 'xai',
      base: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
      key: process.env.XAI_API_KEY,
      models: [process.env.XAI_MODEL || 'grok-4-fast-non-reasoning'],
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    brains.push({
      name: 'openrouter',
      base: 'https://openrouter.ai/api/v1',
      key: process.env.OPENROUTER_API_KEY,
      referer: true,
      models: parseModels(process.env.OPENROUTER_MODELS, [
        'deepseek/deepseek-chat-v3.1', // strong paid brain (key has credit)
        'nvidia/nemotron-3.5-lightning:free',
        'inclusionai/ling-3.0-flash-sante:free',
        'google/gemma-4-26b-a4b-it:free',
        'thinkingmachines/inkling:free',
        'cohere/north-mini-code:free',
        'nvidia/nemotron-3-super-120b-a12b:free',
        'nvidia/nemotron-3-ultra-550b-a55b:free',
        'poolside/laguna-s-2.1:free',
      ]),
    });
  }
  // ---- keyed free-tier brains: activate the moment a key appears in the vault ----
  brains.push(
    ...keyedBrain('groq', 'https://api.groq.com/openai/v1', process.env.GROQ_API_KEY, parseModels(process.env.GROQ_MODELS, ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'])),
    ...keyedBrain('cerebras', 'https://api.cerebras.ai/v1', process.env.CEREBRAS_API_KEY, parseModels(process.env.CEREBRAS_MODELS, ['llama-3.3-70b'])),
    ...keyedBrain('mistral', 'https://api.mistral.ai/v1', process.env.MISTRAL_API_KEY, parseModels(process.env.MISTRAL_MODELS, ['mistral-small-latest', 'open-mistral-nemo'])),
    ...keyedBrain('google-ai', 'https://generativelanguage.googleapis.com/v1beta/openai', process.env.GOOGLE_AI_API_KEY, parseModels(process.env.GOOGLE_AI_MODELS, ['gemini-2.0-flash', 'gemini-2.0-flash-lite'])),
    ...keyedBrain('github-models', 'https://models.github.ai/inference', process.env.GITHUB_MODELS_TOKEN, parseModels(process.env.GITHUB_MODELS, ['openai/gpt-4.1-mini', 'meta/Llama-3.3-70B-Instruct'])),
    ...keyedBrain('together', 'https://api.together.xyz/v1', process.env.TOGETHER_API_KEY, parseModels(process.env.TOGETHER_MODELS, ['meta-llama/Llama-3.3-70B-Instruct-Turbo'])),
  );
  // KEYLESS brain — Kilo Code free auto-router. VERIFIED LIVE (200) via
  // kilocode.ai/api/openrouter with model kilo-auto/free. The old api.kilo.ai
  // gateway endpoint is dead — do not "restore" it.
  brains.push({
    name: 'kilo',
    base: 'https://kilocode.ai/api/openrouter',
    key: process.env.KILO_API_KEY, // optional; anonymous works
    models: parseModels(process.env.KILO_MODELS, ['kilo-auto/free', 'nvidia/nemotron-3-ultra-550b-a55b:free']),
  });
  // KEYLESS brain — LLM7.io anonymous VERIFIED LIVE (200, mistral-Nemo).
  // Anonymous daily quota is drained on the big models; the small Nemo model
  // keeps answering. Optional LLM7_API_KEY (free from token.llm7.io) lifts it.
  brains.push({
    name: 'llm7',
    base: 'https://api.llm7.io/v1',
    key: process.env.LLM7_API_KEY,
    models: parseModels(process.env.LLM7_MODELS, [
      'mistral-Nemo-Instruct-2407',
      'DeepSeek-V4-Flash-0731',
      'GLM-5.3-Flash',
    ]),
  });
  if (process.env.OPENAI_API_KEY) {
    brains.push({
      name: 'openai',
      base: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      key: process.env.OPENAI_API_KEY,
      models: [process.env.OPENAI_MODEL || 'gpt-4o-mini'],
    });
  }
  // KEYLESS brain — Pollinations (text.pollinations.ai/openai). Their model
  // catalog is down to ONE live model — do not list legacy "openai" anymore.
  brains.push({
    name: 'pollinations',
    base: 'https://text.pollinations.ai/openai',
    key: process.env.POLLINATIONS_TOKEN, // optional tier token; anonymous works
    models: parseModels(process.env.POLLINATIONS_MODELS, ['openai-fast']),
  });
  // KEYLESS brain — OVHcloud AI Endpoints (EU anonymous tier, verified live).
  // ~2 RPM per MODEL per IP — so the rotation below is the capacity: seven
  // quality models ≈ 14 RPM aggregate. Verified live + good Hebrew quality.
  brains.push({
    name: 'ovh',
    base: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    key: process.env.OVH_API_KEY, // optional; anonymous works
    models: parseModels(process.env.OVH_MODELS, [
      'Mistral-Small-3.2-24B-Instruct-2506',
      'gpt-oss-120b',
      'Qwen3.5-397B-A17B',
      'Meta-Llama-3_3-70B-Instruct',
      'Qwen3.8-27B',
      'gpt-oss-20b',
      'Mistral-Nemo-Instruct-2407',
    ]),
  });
  return brains;
}

let cachedBrains: Brain[] | undefined;

/** Per brain+model cooldown: after a hard error that exact brain is skipped until this time. */
const cooldownUntil = new Map<string, number>();
const COOLDOWN_MS = 5 * 60_000; // auth / no-credits / dead model — stay away a while
const RATE_COOLDOWN_MS = 45_000; // 429 quotas recover in seconds-minutes — retry fast

const HARD_STATUS = new Set([401, 402, 403]); // auth / no-credits — long cooldown

async function detect(): Promise<Brain[]> {
  if (cachedBrains) return cachedBrains;
  cachedBrains = buildBrains();
  return cachedBrains;
}

// ---- front-desk priority (cross-process, file-based, ephemeral) ---------------------------
// The reception writes {until:<ms>} while a human waits; the crew yields.
const RECEPTION_FLAG =
  process.env.RECEPTION_PRIORITY_FILE || '/tmp/fleethq-reception-priority';
const RECEPTION_YIELD_MS = 9_000; // never wait forever — crew keeps working after this

async function yieldToReception(): Promise<void> {
  const deadline = Date.now() + RECEPTION_YIELD_MS;
  for (;;) {
    try {
      const raw = await readFile(RECEPTION_FLAG, 'utf8');
      const until = (JSON.parse(raw) as { until?: number }).until ?? 0;
      if (until <= Date.now() || Date.now() >= deadline) return;
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      return; // no flag file → nobody waiting → act normally
    }
  }
}

export async function llmAvailable(): Promise<{ ok: boolean; provider: string }> {
  const brains = await detect();
  const names = brains.map((b) => b.name);
  return names.length ? { ok: true, provider: names.join('→') } : { ok: false, provider: 'none' };
}

// ---- global concurrency gate --------------------------------------------------------------
// One LLM call at a time with a small gap keeps the office readable (agents act in turn,
// like a real operations room) and respects provider rate limits.
let chain: Promise<unknown> = Promise.resolve();
const GAP_MS = 1800;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(() => new Promise((r) => setTimeout(r, GAP_MS)), () => new Promise((r) => setTimeout(r, GAP_MS)));
  return run as Promise<T>;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('llm timeout')), ms)),
  ]);
}

/**
 * Quality gate — a Hebrew/English office rejects CJK-flood replies. Weak
 * anonymous routers sometimes answer Hebrew questions in mixed Chinese/Arabic
 * gibberish; that is WORSE than an honest failure, so it counts as a brain
 * failure and the chain keeps walking.
 */
export function qualityGate(text: string): boolean {
  if (!text || text.trim().length < 2) return false;
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length;
  if (cjk / Math.max(1, text.length) >= 0.08) return false;
  return true;
}

/** One attempt against one OpenAI-compatible brain+model. */
async function callBrain(b: Brain, model: string, messages: ChatMessage[], maxTokens: number): Promise<string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (b.key) headers.authorization = `Bearer ${b.key}`;
  if (b.referer) {
    headers['http-referer'] = 'https://fleet-hq.local';
    headers['x-title'] = 'Fleet HQ';
  }
  const body: Record<string, unknown> = { model, messages, max_tokens: maxTokens, temperature: 0.4 };
  if (b.referer) body.reasoning = { exclude: true }; // reasoning models: never bill/leak the scratchpad
  const res = await withTimeout(
    fetch(`${b.base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    45_000,
  );
  if (!res.ok) {
    const err = new Error(`llm http ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('llm empty reply');
  return text;
}

/** Final fallback: the bundled z-ai SDK (system prompt as first assistant message). */
async function callZai(messages: ChatMessage[]): Promise<ChatResult> {
  const mod = await import(/* webpackIgnore: true */ 'z-ai-web-dev-sdk');
  const ZAI = (mod as { default?: unknown } & Record<string, unknown>).default ?? mod;
  const zai = await withTimeout(
    (ZAI as { create: () => Promise<unknown> }).create(),
    20_000,
  );
  const mapped = messages.map((m, i) => ({
    role: m.role === 'system' ? (i === 0 ? 'assistant' : 'user') : m.role,
    content: m.role === 'system' && i > 0 ? `[הנחיית מערכת] ${m.content}` : m.content,
  }));
  const completion = (await withTimeout(
    (zai as { chat: { completions: { create: (a: unknown) => Promise<unknown> } } }).chat.completions.create({
      messages: mapped,
      thinking: { type: 'disabled' },
    }),
    60_000,
  )) as { choices?: Array<{ message?: { content?: string } }> };
  const text = completion?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('llm empty reply');
  return { text, provider: 'z-ai' };
}

/** Reasoning models sometimes leak their scratchpad into the content — cut it off. */
export function stripReasoning(text: string): string {
  const original = (text ?? '').trim();
  let t = original.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (/here(?:'|’)?s (?:a |the )?thinking process|let me think(?: through)?|internal reasoning process/i.test(t)) {
    const blocks = t.split(/\n{2,}/);
    let keep = -1;
    for (let i = 1; i < blocks.length; i++) {
      const first = (blocks[i]?.split('\n')[0] ?? '').trim();
      const reasoningStyle = /^(\d+[\.)]|\*\*|-\s|\u2022)/.test(first) || /:$/.test(first);
      if (!reasoningStyle && (blocks[i]?.length ?? 0) > 40) {
        keep = i;
        break;
      }
    }
    if (keep > 0) t = blocks.slice(keep).join('\n\n').trim();
  }
  return t.trim() || original;
}

async function chatRaw(messages: ChatMessage[], maxTokens: number): Promise<ChatResult> {
  await yieldToReception(); // a human at the front desk goes first
  const brains = await detect();
  const now = Date.now();
  let lastErr: unknown;
  for (const b of brains) {
    for (const model of b.models) {
      const id = `${b.name}/${model}`;
      if ((cooldownUntil.get(id) ?? 0) > now) continue; // this brain is cooling — next
      try {
        const text = stripReasoning(await callBrain(b, model, messages, maxTokens));
        if (!qualityGate(text)) throw new Error('llm off-topic reply'); // garbage in → chain keeps walking
        return { text, provider: id };
      } catch (e) {
        lastErr = e;
        const status = (e as Error & { status?: number }).status;
        const msg = (e as Error).message ?? '';
        const isRate =
          status === 429 || msg.includes('429') || msg.toLowerCase().includes('too many');
        if (isRate) cooldownUntil.set(id, Date.now() + RATE_COOLDOWN_MS);
        if ((status && HARD_STATUS.has(status)) || status === 404 || status === 400 || msg.includes('not available') || msg.includes('unavailable') || msg.includes('No endpoints')) {
          // dead model / bad key — cool it down too so we stop asking it
          cooldownUntil.set(id, Date.now() + COOLDOWN_MS);
        }
        // else: transient — just try the next brain
      }
    }
  }
  // every env brain failed — try the bundled SDK as the last living brain
  try {
    const z = await callZai(messages);
    if (!qualityGate(z.text)) throw new Error('llm off-topic reply');
    return z;
  } catch (e) {
    lastErr = e;
  }
  throw lastErr ?? new Error('NO_LLM');
}

export async function chat(messages: ChatMessage[], _maxTokens = 900): Promise<ChatResult> {
  return enqueue(() => chatRaw(messages, _maxTokens));
}

/** Extract a JSON object from a model reply that may include prose or fences. */
export function extractJson<T = Record<string, unknown>>(text: string): T | undefined {
  if (!text) return undefined;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? (fenced[1] ?? text) : text;
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
