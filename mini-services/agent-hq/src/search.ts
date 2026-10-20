// ============================================================================
// SEARCH — the sovereign web-research lane (Task 48)
// ----------------------------------------------------------------------------
// The office could only learn from its own books and its own git. The owner
// sealed two research providers into the vault (2026-10-10, verified live
// pre-seal): Tavily (two dev keys, search + page extract) and Jina AI
// (r.jina.ai reader). This module turns those sealed slots into a REAL crew
// capability:
//
//   webSearch(query)  — Tavily search, key #1 → #2 failover (per-lane cooldown)
//   readPage(url)     — Jina reader (markdown extraction of a public page)
//   searchStatus()    — the honest capability view (which lanes exist, never
//                       which values they carry)
//
// Laws:
//   1. ENV-ACTIVATED: a lane exists only if its vault slot was deployed into
//      the runtime env. No key → no capability → the prompt never lies.
//   2. NOTHING SECRET LEAVES: results are page content from the open web and
//      pass through scrubSecrets before returning (the office gate scrubs
//      again downstream — defense in depth).
//   3. SSRF GUARD: read_page accepts public http(s) URLs only — loopback,
//      RFC1918, link-local and metadata endpoints are refused BEFORE any
//      request (the crew passes model-chosen URLs — they are untrusted input).
//   4. BOUNDED: every fetch is timeout-capped and byte-capped so one slow
//      page can never stall a worker's task loop.
//   5. FAIL HONEST: a dead lane reports its failure kind (never a fabricated
//      result) and cools down instead of being hammered.
// ============================================================================

import { scrubSecrets } from './security';
import type { SearchCapabilityView } from './types';

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const JINA_READER = 'https://r.jina.ai/';
const FETCH_TIMEOUT_MS = 9000;
const MAX_RESULT_CHARS = 1600;
const MAX_PAGE_CHARS = 2400;
const LANE_COOLDOWN_MS = 45_000;

interface LaneState {
  lastErrorAt: number;
  lastErrorKind: string;
  calls: number;
  successes: number;
}

const lanes: Record<'tavily1' | 'tavily2' | 'jina', LaneState> = {
  tavily1: { lastErrorAt: 0, lastErrorKind: '', calls: 0, successes: 0 },
  tavily2: { lastErrorAt: 0, lastErrorKind: '', calls: 0, successes: 0 },
  jina: { lastErrorAt: 0, lastErrorKind: '', calls: 0, successes: 0 },
};

function laneReady(l: LaneState): boolean {
  return Date.now() - l.lastErrorAt > LANE_COOLDOWN_MS;
}

function noteFailure(l: LaneState, kind: string): void {
  l.lastErrorAt = Date.now();
  l.lastErrorKind = kind;
}

function noteSuccess(l: LaneState): void {
  l.lastErrorKind = '';
  l.lastErrorAt = 0;
  l.successes++;
}

/** Bounded fetch that never throws (returns null on any failure). */
async function boundedFetch(url: string, init: RequestInit): Promise<Response | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: ac.signal });
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}

/** SSRF guard: public http(s) URLs only. Returns a refusal string or ''. */
export function guardPublicUrl(raw: string): string {
  const u = String(raw ?? '').trim();
  if (!u) return 'ERROR: read_page needs a url';
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return 'ERROR: url does not parse';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'ERROR: only http(s) urls are allowed';
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local'))
    return 'ERROR: private hosts are refused';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || a >= 224)
      return 'ERROR: private/loopback addresses are refused';
  }
  if (host === '::1' || host === '[::1]' || host.startsWith('fd') || host.startsWith('fe80:')) return 'ERROR: private addresses are refused';
  return '';
}

/** Tavily web search — walks sealed key #1 → #2 with per-lane cooldown. */
export async function webSearch(query: string, maxResults = 5): Promise<string> {
  const q = String(query ?? '').trim().slice(0, 200);
  if (!q) return 'ERROR: web_search needs a query';
  const keys = [process.env.TAVILY_API_KEY_1, process.env.TAVILY_API_KEY_2]
    .map((k) => String(k ?? '').trim())
    .filter(Boolean);
  if (!keys.length) return 'ERROR: no search lane configured (vault slot TAVILY_API_KEY missing from runtime env)';

  const attempts: Array<{ lane: LaneState; key: string; label: string }> = [
    { lane: lanes.tavily1, key: keys[0], label: 'tavily#1' },
    ...(keys[1] ? [{ lane: lanes.tavily2, key: keys[1], label: 'tavily#2' }] : []),
  ];
  const failures: string[] = [];
  for (const at of attempts) {
    if (!laneReady(at.lane)) {
      failures.push(`${at.label}: cooling down (${at.lane.lastErrorKind})`);
      continue;
    }
    at.lane.calls++;
    const res = await boundedFetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: at.key, query: q, max_results: Math.min(Math.max(maxResults, 1), 8), search_depth: 'basic' }),
    });
    if (!res || !res.ok) {
      noteFailure(at.lane, res ? `http-${res.status}` : 'network');
      failures.push(`${at.label}: ${res ? `http-${res.status}` : 'network'}`);
      continue;
    }
    let body: { results?: Array<{ title?: string; url?: string; content?: string }> } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      noteFailure(at.lane, 'bad-json');
      failures.push(`${at.label}: bad-json`);
      continue;
    }
    const rows = (body.results ?? []).slice(0, maxResults).map((r, i) => {
      const snippet = String(r.content ?? '').replace(/\s+/g, ' ').slice(0, 220);
      return `${i + 1}. ${String(r.title ?? '').slice(0, 90)}\n   ${r.url ?? ''}\n   ${snippet}`;
    });
    if (!rows.length) {
      noteFailure(at.lane, 'empty-results');
      failures.push(`${at.label}: empty-results`);
      continue;
    }
    noteSuccess(at.lane);
    // SECURITY: open-web content crosses toward the model — scrub at the gate.
    return scrubSecrets(`search(${q}) via ${at.label}:\n${rows.join('\n')}`).slice(0, MAX_RESULT_CHARS);
  }
  return scrubSecrets(`ERROR: all search lanes failed — ${failures.join(' · ')}`);
}

/** Jina reader — public page → markdown, byte-capped. */
export async function readPage(rawUrl: string): Promise<string> {
  const bad = guardPublicUrl(rawUrl);
  if (bad) return bad;
  const key = String(process.env.JINA_API_KEY ?? '').trim();
  if (!key) return 'ERROR: no reader lane configured (vault slot JINA_API_KEY missing from runtime env)';
  if (!laneReady(lanes.jina)) return `ERROR: reader lane cooling down (${lanes.jina.lastErrorKind})`;
  lanes.jina.calls++;
  const res = await boundedFetch(JINA_READER + String(rawUrl).trim(), {
    headers: { Authorization: `Bearer ${key}`, 'X-Return-Format': 'text' },
  });
  if (!res || !res.ok) {
    noteFailure(lanes.jina, res ? `http-${res.status}` : 'network');
    return `ERROR: reader lane failed (${res ? `http-${res.status}` : 'network'})`;
  }
  let text = '';
  try {
    text = await res.text();
  } catch {
    noteFailure(lanes.jina, 'read-error');
    return 'ERROR: reader lane failed (read-error)';
  }
  noteSuccess(lanes.jina);
  const clipped = text.slice(0, MAX_PAGE_CHARS);
  // SECURITY: page content crosses toward the model — scrub at the gate.
  return scrubSecrets(clipped).slice(0, MAX_PAGE_CHARS);
}

/** The honest capability view — which lanes EXIST, never what they carry. */
export type { SearchCapabilityView };

export function searchStatus(): SearchCapabilityView {
  const k1 = String(process.env.TAVILY_API_KEY_1 ?? '').trim().length > 0;
  const k2 = String(process.env.TAVILY_API_KEY_2 ?? '').trim().length > 0;
  const j = String(process.env.JINA_API_KEY ?? '').trim().length > 0;
  const all = [lanes.tavily1, lanes.tavily2, lanes.jina];
  return {
    search: k1 || k2,
    reader: j,
    searchLanes: (k1 ? 1 : 0) + (k2 ? 1 : 0),
    calls: all.reduce((a, l) => a + l.calls, 0),
    successes: all.reduce((a, l) => a + l.successes, 0),
  };
}
