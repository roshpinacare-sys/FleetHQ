import { NextRequest, NextResponse } from 'next/server';
import { proxyToGateway } from '@/lib/gateway-proxy';

// /api/v1/* — OpenAI-compatible proxy into the sovereign gateway (:3011).
// See src/lib/gateway-proxy.ts — the shared honest pipe.

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
