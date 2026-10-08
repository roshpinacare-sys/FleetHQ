import { NextRequest, NextResponse } from 'next/server';
import { proxyToGateway } from '@/lib/gateway-proxy';

// /v1/* — the EXACT documented manifest contract (OPENAI_API_BASE=http://localhost:3000/v1).
// Same honest pipe as /api/v1/* — both live so no agent ever hits a 404 that
// MEMORY.md promised would work.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxyToGateway(req, path ?? []);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxyToGateway(req, path ?? []);
}
