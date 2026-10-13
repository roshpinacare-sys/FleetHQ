import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// gateway-proxy — the one honest pipe into the sovereign gateway (:3011).
// Used by BOTH /api/v1/* and /v1/* (the manifest's documented
// OPENAI_API_BASE=http://localhost:3000/v1 contract — exact path honored).
// Zero auth by design (local office), no content logging, no transformation.
// ============================================================================

const GATEWAY = 'http://127.0.0.1:3011';

export async function proxyToGateway(req: NextRequest, path: string[]): Promise<NextResponse> {
  // callers arrive as [.../v1/<rest>] — map onto the gateway's REAL routes:
  //   health, telemetry           → /health, /telemetry      (office endpoints)
  //   chat/completions, models,   → /v1/<rest>               (OpenAI-compatible)
  //   system-prompt
  const rest = path[0] === 'v1' ? path.slice(1) : path;
  let suffix: string;
  if (rest[0] === 'health') suffix = 'health';
  else if (rest[0] === 'telemetry') suffix = 'telemetry';
  else suffix = `v1/${rest.join('/')}`;
  const target = `${GATEWAY}/${suffix}`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  // pass the front-desk priority flag through — reception outranks crew chats
  const prio = req.headers.get('x-reception-priority');
  if (prio) headers['x-reception-priority'] = prio;

  try {
    const init: RequestInit = { method: req.method, headers };
    if (req.method === 'POST' || req.method === 'PUT') {
      init.body = await req.text(); // size-guarded upstream (gateway caps at 512KB)
    }
    const res = await fetch(target, init);
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'x-sovereign-gateway': 'proxied',
      },
    });
  } catch (e) {
    // gateway down → honest 502 (the supervisor route will respawn it)
    return NextResponse.json(
      { error: { message: 'sovereign gateway unreachable', type: 'gateway_unreachable', detail: (e as Error).message } },
      { status: 502 },
    );
  }
}

export async function handleGatewayProxy(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }): Promise<NextResponse> {
  const { path } = await ctx.params;
  return proxyToGateway(req, path ?? []);
}
