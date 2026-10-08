// ============================================================================
// SOVEREIGN GATEWAY — the office's OWN local OpenAI-compatible endpoint.
//
// ONE stable local address that any agent, tool or script can point at
// (OPENAI_API_BASE=http://127.0.0.1:3011/v1, any string as the key — zero
// auth by design). Behind it walks the full sovereign multi-brain chain with
// real-time failover: 429 / 403 / timeout / network death never crash the
// caller — the gateway silently shifts to the next brain+model, tracks
// per-brain cooldowns in ONE place for ALL consumers, and answers honestly
// when every route is saturated.
//
//   GET  /health             honest brain states (no secrets)
//   GET  /v1/models          union of every live brain's models (+ "auto")
//   POST /v1/chat/completions OpenAI-compatible; model "auto" = walk the chain
//   GET  /v1/system-prompt   the sovereign agent prompt (also SOVEREIGN-PROMPT.md)
//
// Sovereign network discipline (env):
//   AI_TIMEOUT  overall answer deadline in ms   (default 60000)
//   MAX_RETRIES max brain+model attempts        (default 5)
//   DUCKAI_URL  optional local reverse-engineered bridge (duckai) — activates
//               the slot the moment the env var exists (runs on any machine
//               with DuckDuckGo access; this sandbox blocks DDG — honest).
//
// The gateway stores/transmits NO telemetry and NO identity tokens. It logs
// brain ids and latencies only — never message content, never keys.
// ============================================================================

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const PORT = Number(process.env.GATEWAY_PORT || 3011);
const HERE = dirname(new URL(import.meta.url).pathname);

// ---- env: the gateway is a standalone mini-service, so it deliberately reads
// the office's own env files (vault merge-deploy writes them at the repo root).
// Real process env always wins; nothing is ever logged.
function loadEnvFile(path: string): void {
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue; // real env wins
      let val = (m[2] ?? '').trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (val) process.env[key] = val;
    }
  } catch {
    // missing file is normal (fresh machine before unseal)
  }
}
loadEnvFile(process.env.GATEWAY_ENV_FILE || join(HERE, '../../.env.local'));
loadEnvFile(join(HERE, '../../.env'));
loadEnvFile(join(HERE, '.env'));

// ---- brains -------------------------------------------------------------------------------
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
interface Brain {
  name: string;
  base: string;
  key?: string; // undefined → anonymous access (no auth header)
  models: string[];
  referer?: boolean;
}

function parseModels(envVal: string | undefined, fallback: string[]): string[] {
  const list = (envVal ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : fallback;
}

function keyedBrain(name: string, base: string, key: string | undefined, models: string[]): Brain[] {
  if (!key) return [];
  return [{ name, base, key, models }];
}

/** THE definitive sovereign chain. The consumers' direct chains are the
 *  fallback copies of this doctrine — this is the single source of truth. */
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
  const orKeys = [
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_API_KEY_2,
    process.env.OPENROUTER_API_KEY_3,
  ].filter((k): k is string => typeof k === 'string' && k.trim().length > 10);
  const orModels = parseModels(process.env.OPENROUTER_MODELS, [
    'deepseek/deepseek-chat-v3.1',
    'nvidia/nemotron-3.5-lightning:free',
    'inclusionai/ling-3.0-flash-sante:free',
    'google/gemma-4-26b-a4b-it:free',
    'thinkingmachines/inkling:free',
    'cohere/north-mini-code:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'poolside/laguna-s-2.1:free',
  ]);
  for (const [i, key] of orKeys.entries()) {
    brains.push({
      name: orKeys.length > 1 ? `openrouter-${i + 1}` : 'openrouter',
      base: 'https://openrouter.ai/api/v1',
      key,
      referer: true,
      models: orModels,
    });
  }
  brains.push(
    ...keyedBrain('groq', 'https://api.groq.com/openai/v1', process.env.GROQ_API_KEY, parseModels(process.env.GROQ_MODELS, ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'])),
    ...keyedBrain('cerebras', 'https://api.cerebras.ai/v1', process.env.CEREBRAS_API_KEY, parseModels(process.env.CEREBRAS_MODELS, ['llama-3.3-70b'])),
    ...keyedBrain('mistral', 'https://api.mistral.ai/v1', process.env.MISTRAL_API_KEY, parseModels(process.env.MISTRAL_MODELS, ['mistral-small-latest', 'open-mistral-nemo'])),
    ...keyedBrain('google-ai', 'https://generativelanguage.googleapis.com/v1beta/openai', process.env.GOOGLE_AI_API_KEY, parseModels(process.env.GOOGLE_AI_MODELS, ['gemini-2.0-flash', 'gemini-2.0-flash-lite'])),
    ...keyedBrain('github-models', 'https://models.github.ai/inference', process.env.GITHUB_MODELS_TOKEN, parseModels(process.env.GITHUB_MODELS, ['openai/gpt-4.1-mini', 'meta/Llama-3.3-70B-Instruct'])),
    ...keyedBrain('together', 'https://api.together.xyz/v1', process.env.TOGETHER_API_KEY, parseModels(process.env.TOGETHER_MODELS, ['meta-llama/Llama-3.3-70B-Instruct-Turbo'])),
  );
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    brains.push({
      name: 'cloudflare-ai',
      base: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
      key: process.env.CLOUDFLARE_API_TOKEN,
      models: parseModels(process.env.CLOUDFLARE_AI_MODELS, [
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        '@cf/meta/llama-4-scout-17b-16e-instruct',
        '@cf/mistralai/mistral-small-3.1-24b-instruct',
        '@cf/qwen/qwen2.5-coder-32b-instruct',
      ]),
    });
  }
  // LOCAL REVERSE-ENGINEERED BRIDGE — duckai (github.com/amirkabiri/duckai):
  // an OpenAI-compatible server over DuckDuckGo's free AI backend. Zero auth,
  // zero cost. The code is rescued in mini-services/duckai — run it on any
  // machine with DDG access and set DUCKAI_URL; the slot lights up instantly.
  // From THIS sandbox DDG is network-blocked (measured twice) — the slot stays
  // off here and waits honestly.
  if (process.env.DUCKAI_URL) {
    brains.push({
      name: 'duckai',
      base: process.env.DUCKAI_URL,
      key: 'unused', // duckai accepts any string
      models: parseModels(process.env.DUCKAI_MODELS, [
        'gpt-4o-mini',
        'claude-3-5-haiku-latest',
        'gpt-5-mini',
        'mistralai/Mistral-Small-24B-Instruct-2501',
      ]),
    });
  }
  brains.push({
    name: 'kilo',
    base: 'https://kilocode.ai/api/openrouter',
    key: process.env.KILO_API_KEY,
    models: parseModels(process.env.KILO_MODELS, ['kilo-auto/free', 'nvidia/nemotron-3-ultra-550b-a55b:free']),
  });
  brains.push({
    name: 'llm7',
    base: 'https://api.llm7.io/v1',
    key: process.env.LLM7_API_KEY,
    models: parseModels(process.env.LLM7_MODELS, ['mistral-Nemo-Instruct-2407', 'DeepSeek-V4-Flash-0731', 'GLM-5.3-Flash']),
  });
  brains.push({
    name: 'pollinations',
    base: 'https://text.pollinations.ai/openai',
    key: process.env.POLLINATIONS_TOKEN,
    models: parseModels(process.env.POLLINATIONS_MODELS, ['openai-fast']),
  });
  brains.push({
    name: 'ovh',
    base: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    key: process.env.OVH_API_KEY,
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
function brains(): Brain[] {
  if (!cachedBrains) cachedBrains = buildBrains();
  return cachedBrains;
}

// ---- cooldowns (ONE central place for ALL consumers) ---------------------------------------
const cooldownUntil = new Map<string, number>();
const HARD_COOLDOWN_MS = 5 * 60_000; // auth / no-credits / dead model
const RATE_COOLDOWN_MS = 45_000; // 429 — quotas recover fast
const NET_COOLDOWN_MS = 15_000; // network-level death — cheap retry soon
const HARD_STATUS = new Set([401, 402, 403]);

// jittered cooldown (sovereign doctrine: thundering-herd avoidance — every
// cooldown lands in ±15% of its nominal value so parallel chains de-sync)
function cool(id: string, ms: number): void {
  const jittered = Math.round(ms * (0.85 + Math.random() * 0.3));
  cooldownUntil.set(id, Date.now() + jittered);
}

// ---- honest counters ----------------------------------------------------------------------
const stats = {
  startedAt: Date.now(),
  requests: 0,
  answered: 0,
  failed: 0,
  lastAnsweredVia: '',
  lastLatencyMs: 0,
};

// ---- front-desk priority (same file convention as the whole office) ------------------------
const RECEPTION_FLAG = process.env.RECEPTION_PRIORITY_FILE || '/tmp/fleethq-reception-priority';
async function yieldToReception(isPriority: boolean, deadline: number): Promise<void> {
  if (isPriority) return; // the visitor's own request never yields to itself
  while (Date.now() < deadline) {
    try {
      const raw = readFileSync(RECEPTION_FLAG, 'utf8');
      const until = (JSON.parse(raw) as { until?: number }).until ?? 0;
      if (until <= Date.now()) return;
      await new Promise((r) => setTimeout(r, 400));
    } catch {
      return; // no flag → nobody waiting
    }
  }
}

// ---- quality -------------------------------------------------------------------------------
function qualityGate(text: string): boolean {
  if (!text || text.trim().length < 2) return false;
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length;
  return cjk / Math.max(1, text.length) < 0.08;
}

function stripReasoning(text: string): string {
  const original = (text ?? '').trim();
  const hadThink = /<think>/i.test(original);
  let t = original.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (/here(?:'|’)?s (?:a |the )?thinking process|let me think(?: through)?|internal reasoning process/i.test(t)) {
    const blocks = t.split(/\n{2,}/);
    let keep = -1;
    for (let i = 1; i < blocks.length; i++) {
      const first = (blocks[i]?.split('\n')[0] ?? '').trim();
      const reasoningStyle = /^(\d+[\.)]|\*\*|-\s|\u2022)/.test(first) || /:$/.test(first);
      if (!reasoningStyle && (blocks[i]?.length ?? 0) > 25) {
        keep = i;
        break;
      }
    }
    if (keep > 0) {
      t = blocks.slice(keep).join('\n\n').trim();
    } else {
      // reasoning-only content: the scratchpad ran to the end (or the answer is
      // buried inside numbered reasoning). Shipping a scratchpad to a human is
      // WORSE than failing — signal failure so the chain walks to the next brain.
      return '';
    }
  }
  return t.trim() || (hadThink ? '' : original);
}

// ---- one attempt ---------------------------------------------------------------------------
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

async function callBrain(b: Brain, model: string, messages: ChatMessage[], maxTokens: number, budgetMs: number): Promise<string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (b.key) headers.authorization = `Bearer ${b.key}`;
  if (b.referer) {
    headers['http-referer'] = 'https://fleet-hq.local';
    headers['x-title'] = 'Fleet HQ';
  }
  const body: Record<string, unknown> = { model, messages, max_tokens: maxTokens, temperature: 0.4 };
  if (b.referer) body.reasoning = { exclude: true };
  const res = await withTimeout(
    fetch(`${b.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) }),
    Math.min(Math.max(budgetMs, 8000), 45_000),
  );
  if (!res.ok) {
    const err = new Error(`llm http ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('empty reply');
  return text;
}

async function callZai(messages: ChatMessage[]): Promise<string> {
  const mod = await import('z-ai-web-dev-sdk');
  const ZAI = (mod as { default?: unknown }).default ?? mod;
  const zai = await withTimeout((ZAI as { create: () => Promise<unknown> }).create(), 20_000);
  const mapped = messages.map((m, i) => ({
    role: m.role === 'system' ? (i === 0 ? 'assistant' : 'user') : m.role,
    content: m.role === 'system' && i > 0 ? `[system note] ${m.content}` : m.content,
  }));
  const completion = (await withTimeout(
    (zai as { chat: { completions: { create: (a: unknown) => Promise<unknown> } } }).chat.completions.create({
      messages: mapped,
      thinking: { type: 'disabled' },
    }),
    60_000,
  )) as { choices?: Array<{ message?: { content?: string } }> };
  const text = completion?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('empty reply');
  return text;
}


/** Meta-commentary sieve: free models emit drafting chatter ("Let's refine…",
 *  "Draft: …"), self-check tails ("Check word count: …") and wrapped quotes.
 *  Keep only the usable answer: cut self-check tails, extract the LAST
 *  Draft/Final/Answer segment, drop leading meta lines, unwrap quotes. */
function polish(text: string): string {
  let t = (text ?? '').trim();
  const tail = t.search(/\n\s*(?:check\b|word count\b|constraints?\s*:)/i);
  if (tail > 0) t = t.slice(0, tail).trim();
  const segs = [...t.matchAll(/(?:^|\n)\s*(?:final(?:\s+answer)?|draft|answer)\s*:\s*/gi)];
  if (segs.length) {
    const last = segs[segs.length - 1];
    t = t.slice((last.index ?? 0) + last[0].length).trim();
  } else if (/^let'?s\s+(refine|make|draft|craft|write|think|polish)/i.test(t)) {
    const nl = t.indexOf('\n');
    if (nl > 0) t = t.slice(nl + 1).trim();
  }
  if (/^"[\s\S]+"$/.test(t)) t = t.slice(1, -1).trim();
  return t;
}
// ---- the sovereign walk ---------------------------------------------------------------------
interface WalkResult {
  text: string;
  brain: string;
  attempts: number;
  latencyMs: number;
}
async function walkChain(
  messages: ChatMessage[],
  maxTokens: number,
  deadline: number,
  maxAttempts: number,
  isPriority: boolean,
): Promise<WalkResult> {
  let lastErr: unknown;
  let attempts = 0;
  let rateHits = 0; // sovereign doctrine: repeated 429 → degrade per-attempt load (max_tokens), not the deadline
  for (const b of brains()) {
    for (const model of b.models) {
      const id = `${b.name}/${model}`;
      if ((cooldownUntil.get(id) ?? 0) > Date.now()) continue;
      if (attempts >= maxAttempts || Date.now() >= deadline) {
        throw lastErr ?? new Error('attempt budget exhausted before any live brain');
      }
      await yieldToReception(isPriority, Math.min(deadline, Date.now() + 3000));
      attempts++;
      const budget = deadline - Date.now();
      const t0 = Date.now();
      // degradation ladder: every 429 in this walk shrinks the ask (floor 384)
      const degrade = Math.max(384, Math.round(maxTokens * Math.pow(0.75, rateHits)));
      try {
        const text = polish(stripReasoning(await callBrain(b, model, messages, degrade, budget)));
        if (!qualityGate(text)) throw new Error('off-topic reply');
        cooldownUntil.delete(id);
        stats.lastAnsweredVia = id;
        stats.lastLatencyMs = Date.now() - t0;
        return { text, brain: id, attempts, latencyMs: stats.lastLatencyMs };
      } catch (e) {
        lastErr = e;
        const status = (e as Error & { status?: number }).status;
        const msg = (e as Error).message ?? '';
        const m = msg.toLowerCase();
        // honest ops log — brain id + failure class only, never content, never keys
        console.log(`[gateway] brain failed: ${id} → ${status ?? 'network'} ${msg.slice(0, 120)}`);
        if (status === 429 || m.includes('429') || m.includes('too many')) {
          rateHits++;
          cool(id, RATE_COOLDOWN_MS);
        } else if ((status && HARD_STATUS.has(status)) || status === 404 || status === 400 || m.includes('not available') || m.includes('unavailable') || m.includes('no endpoints')) {
          cool(id, HARD_COOLDOWN_MS);
        } else if (!status) {
          // network-level death (timeout / refused / dns) — cheap fast retry
          cool(id, NET_COOLDOWN_MS);
        }
      }
    }
  }
  // every env brain failed — the bundled platform SDK is the last living brain
  try {
    const t0 = Date.now();
    const text = polish(stripReasoning(await callZai(messages)));
    if (qualityGate(text)) {
      stats.lastAnsweredVia = 'z-ai';
      return { text, brain: 'z-ai', attempts, latencyMs: Date.now() - t0 };
    }
  } catch (e) {
    lastErr = e;
  }
  throw lastErr ?? new Error('NO_LLM');
}

// ---- http plumbing --------------------------------------------------------------------------
function json(res: ServerResponse, code: number, obj: unknown): void {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 512 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

let systemPromptCache: string | undefined;
async function systemPrompt(): Promise<string> {
  if (systemPromptCache) return systemPromptCache;
  try {
    systemPromptCache = readFileSync(join(HERE, 'SOVEREIGN-PROMPT.md'), 'utf8');
  } catch {
    systemPromptCache = 'You are a sovereign autonomous agent. Your gateway was asked for a prompt file that is missing — operate with honest failover discipline.';
  }
  return systemPromptCache;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = (req.url ?? '/').split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && (url === '/health' || url === '/')) {
    const now = Date.now();
    const state = brains().flatMap((b) =>
      b.models.map((m) => {
        const id = `${b.name}/${m}`;
        const until = cooldownUntil.get(id) ?? 0;
        return { id, state: until > now ? 'cooling' : 'live', cooling_for_s: until > now ? Math.ceil((until - now) / 1000) : 0 };
      }),
    );
    json(res, 200, {
      ok: true,
      service: 'sovereign-gateway',
      uptime_s: Math.round((now - stats.startedAt) / 1000),
      requests: stats.requests,
      answered: stats.answered,
      failed: stats.failed,
      last_answered_via: stats.lastAnsweredVia || null,
      last_latency_ms: stats.lastLatencyMs || null,
      brains: state,
    });
    return;
  }

  if (req.method === 'GET' && url === '/v1/system-prompt') {
    json(res, 200, { prompt: await systemPrompt() });
    return;
  }

  if (req.method === 'GET' && url === '/v1/models') {
    const ids = ['auto', ...new Set(brains().flatMap((b) => b.models))];
    json(res, 200, {
      object: 'list',
      data: ids.map((id) => ({ id, object: 'model', created: Math.floor(stats.startedAt / 1000), owned_by: 'sovereign-gateway' })),
    });
    return;
  }

  if (req.method === 'POST' && (url === '/v1/chat/completions' || url === '/chat/completions')) {
    stats.requests++;
    let body: {
      model?: unknown;
      messages?: unknown;
      max_tokens?: unknown;
      stream?: unknown;
    };
    try {
      body = JSON.parse(await readBody(req)) as typeof body;
    } catch {
      json(res, 400, { error: { message: 'invalid JSON body', type: 'invalid_request_error' } });
      return;
    }
    if (body.stream === true) {
      // honest limitation: the gateway answers in one complete OpenAI JSON
      json(res, 400, { error: { message: 'streaming is not supported by the sovereign gateway; use stream:false', type: 'invalid_request_error' } });
      return;
    }
    const messages = Array.isArray(body.messages)
      ? (body.messages as ChatMessage[])
          .filter((m) => m && typeof m.content === 'string' && ['system', 'user', 'assistant'].includes(m.role))
          .map((m) => ({ role: m.role, content: (m.content ?? '').slice(0, 32_000) }))
      : [];
    if (!messages.length) {
      json(res, 400, { error: { message: 'messages[] required', type: 'invalid_request_error' } });
      return;
    }
    const maxTokens = Math.max(256, Math.min(4096, Number(body.max_tokens) || 900)); // floor: reasoning models starve below 256 and ship a naked scratchpad
    const deadline = Date.now() + Math.max(5_000, Math.min(120_000, Number(process.env.AI_TIMEOUT) || 60_000));
    const maxAttempts = Math.max(1, Math.min(24, Number(process.env.MAX_RETRIES) || 8)); // 8: free reasoning models can burn 2-3 attempts on scratchpads before a clean brain answers
    const isPriority = (req.headers['x-reception-priority'] ?? '') === '1';

    try {
      const r = await walkChain(messages, maxTokens, deadline, maxAttempts, isPriority);
      stats.answered++;
      stats.lastLatencyMs = r.latencyMs;
      console.log(`[gateway] served via ${r.brain} (${r.attempts} attempt(s), ${r.latencyMs}ms)`);
      json(res, 200, {
        id: `gw-${Date.now().toString(36)}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: typeof body.model === 'string' ? body.model : 'auto',
        choices: [{ index: 0, message: { role: 'assistant', content: r.text }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: Math.ceil(messages.reduce((a, m) => a + m.content.length, 0) / 4),
          completion_tokens: Math.ceil(r.text.length / 4),
        },
        gateway: { brain: r.brain, attempts: r.attempts, latency_ms: r.latencyMs },
      });
    } catch (e) {
      stats.failed++;
      // honest failure — the caller's own fallback chain takes over from here
      json(res, 502, {
        error: { message: 'sovereign gateway: every brain is saturated or cooling', type: 'gateway_exhausted', detail: (e as Error).message },
      });
    }
    return;
  }

  json(res, 404, { error: { message: 'not found', type: 'invalid_request_error' } });
}

const server = createServer((req, res) => {
  handle(req, res).catch(() => {
    try {
      json(res, 500, { error: { message: 'gateway internal error' } });
    } catch {
      /* response already gone */
    }
  });
});

server.listen(PORT, () => {
  console.log(`[sovereign-gateway] listening on :${PORT} — OPENAI_API_BASE=http://127.0.0.1:${PORT}/v1 (any string as key)`);
  console.log(`[sovereign-gateway] brains: ${brains().map((b) => b.name).join('→') || 'NONE (keyless honest mode)'}`);
  if (process.env.DUCKAI_URL) console.log(`[sovereign-gateway] duckai bridge armed at ${process.env.DUCKAI_URL}`);
});
