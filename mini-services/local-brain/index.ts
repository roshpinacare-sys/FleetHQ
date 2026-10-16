// local-brain — the sovereign's air-gap heartbeat organ (rebuilt T32).
//
// WHY THIS EXISTS (drill Task-55, rebuilt after wipe): when every external
// brain family is unreachable (air-gap / kill-switch), the sovereign gateway
// mounts THIS slot (family "duckai", LOCAL_LLM_URL) and the chain never dies.
// Honest contract: this stub never pretends to think. It answers with a
// heartbeat report — who it is, that it is alive, and that real weights
// (GGUF ≥2.2GB free RAM law) are required for thought. A lie-free brain.
//
// OpenAI-compatible surface (what sovereign-gateway's local-llm slot calls):
//   GET  /health                  → { ok, service, uptime_s, note }
//   GET  /v1/models               → { object:"list", data:[{id,...}] }
//   POST /v1/chat/completions     → OpenAI-shaped answer, heartbeat-honest
//
// Port: LOCAL_BRAIN_PORT (default 8080). ~35MB RSS. Zero network egress.

const PORT = Number(process.env.LOCAL_BRAIN_PORT || 8080);
const MODEL_ID = process.env.LOCAL_BRAIN_MODEL || 'sovereign-heartbeat-1';
const BOOTED_AT = Date.now();

function heartbeatAnswer(messages: Array<{ role?: string; content?: unknown }>): string {
  const last = messages.length ? messages[messages.length - 1] : null;
  const asked = typeof last?.content === 'string' && last.content.trim()
    ? last.content.trim().slice(0, 120)
    : '(empty prompt)';
  return [
    `[local-brain heartbeat] alive, air-gap slot mounted.`,
    `uptime_s=${Math.round((Date.now() - BOOTED_AT) / 1000)}`,
    `received=${JSON.stringify(asked)}`,
    `honesty=this is the stub organ: it reports heartbeat only, it does not think.`,
    `thought=requires real weights on a host with ≥2.2GB free RAM (RAM law, Task-55).`,
  ].join(' ');
}

function pickText(body: unknown): { messages: Array<{ role?: string; content?: unknown }>; stream: boolean } {
  const b = (body ?? {}) as { messages?: Array<{ role?: string; content?: unknown }>; stream?: boolean };
  return { messages: Array.isArray(b.messages) ? b.messages : [], stream: Boolean(b.stream) };
}

Bun.serve({
  port: PORT,
  idleTimeout: 30,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/health' && req.method === 'GET') {
      return Response.json({
        ok: true,
        service: 'local-brain',
        model: MODEL_ID,
        uptime_s: Math.round((Date.now() - BOOTED_AT) / 1000),
        note: 'air-gap heartbeat stub — honest, never pretends to think',
      });
    }

    if (url.pathname === '/v1/models' && req.method === 'GET') {
      return Response.json({
        object: 'list',
        data: [{ id: MODEL_ID, object: 'model', owned_by: 'sovereign-local-brain' }],
      });
    }

    if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
      let body: unknown = null;
      try { body = await req.json(); } catch { /* empty body → empty messages */ }
      const { messages, stream } = pickText(body);
      const answer = heartbeatAnswer(messages);
      const id = `chatcmpl-local-brain-${Date.now().toString(36)}`;
      const created = Math.floor(Date.now() / 1000);

      if (stream) {
        const enc = new TextEncoder();
        const chunk = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
        const streamRes = new ReadableStream({
          start(controller) {
            controller.enqueue(chunk({ id, object: 'chat.completion.chunk', created, model: MODEL_ID, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] }));
            controller.enqueue(chunk({ id, object: 'chat.completion.chunk', created, model: MODEL_ID, choices: [{ index: 0, delta: { content: answer }, finish_reason: null }] }));
            controller.enqueue(chunk({ id, object: 'chat.completion.chunk', created, model: MODEL_ID, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }));
            controller.enqueue(enc.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return new Response(streamRes, { headers: { 'content-type': 'text/event-stream' } });
      }

      return Response.json({
        id,
        object: 'chat.completion',
        created,
        model: MODEL_ID,
        choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }

    return Response.json({ error: { message: `no route: ${req.method} ${url.pathname}`, type: 'not_found' } }, { status: 404 });
  },
});

console.log(`[local-brain] heartbeat organ listening on :${PORT} (model=${MODEL_ID}, honest stub)`);
