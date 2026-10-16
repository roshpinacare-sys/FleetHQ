/**
 * /api/keys-registry — מחסן-המפתחות עם מדידה-חיה. [T24]
 * ---------------------------------------------------------------------------
 * · הרישום: מלאי-אמת אחד (קבלות-בלבד, אפס-חומר-גלמי).
 * · המדידה: מה באמת חי בסנדבוקס עכשיו + הפידים-הפומביים (אנונימי, נמדד).
 * · כשל-מדידה לא מפיל את הרישום — כנות: סטטוס-פיד "לא-נמדד".
 */
import { NextResponse } from 'next/server';
import { loadCanonicalRegistry, checkDemand, registryHealth, type DemandCheck, type KeysRegistry } from '@/lib/keys';
import { resolveGithubPat, verifyGithubPat } from '@/lib/gh-pat';

export const dynamic = 'force-dynamic';

interface FeedProbe {
  name: string;
  url: string;
  alive: boolean;
  generatedAt?: string | null;
  ageH?: number | null;
  error?: string | null;
}

const g = globalThis as unknown as { __keysFeedCache?: { at: number; feeds: FeedProbe[] } };

async function probeFeed(name: string, url: string, parseAt?: (j: unknown) => string | null): Promise<FeedProbe> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { name, url, alive: false, error: `http-${res.status}` };
    const text = await res.text();
    let generatedAt: string | null = null;
    if (parseAt) {
      try {
        generatedAt = parseAt(JSON.parse(text));
      } catch {
        generatedAt = null;
      }
    }
    const ageH = generatedAt ? Math.round(((Date.now() - Date.parse(generatedAt)) / 3600000) * 10) / 10 : null;
    return { name, url, alive: true, generatedAt, ageH };
  } catch (e) {
    return { name, url, alive: false, error: String(e).slice(0, 40) };
  }
}

async function probePublicFeeds(): Promise<FeedProbe[]> {
  const cached = g.__keysFeedCache;
  if (cached && Date.now() - cached.at < 120_000) return cached.feeds;
  const feeds = await Promise.all([
    probeFeed('GridWatch/בריאות-הצי', 'https://raw.githubusercontent.com/roshpinacare-sys/GridWatch/main/state/fleet-health.json', (j) => (j as { generatedAt?: string }).generatedAt ?? null),
    probeFeed('Autonomy/עצמיות', 'https://raw.githubusercontent.com/roshpinacare-sys/Autonomy/main/state/selfhood/capabilities.json', (j) => (j as { measuredAt?: string }).measuredAt ?? null),
    probeFeed('ops-intake/תור-העבודה', 'https://raw.githubusercontent.com/roshpinacare-sys/ops-intake/main/ops/QUEUE.json', (j) => (j as { generatedAt?: string }).generatedAt ?? null),
  ]);
  g.__keysFeedCache = { at: Date.now(), feeds };
  return feeds;
}

export async function GET() {
  const [feeds, patVerify, registry] = await Promise.all([probePublicFeeds(), verifyGithubPat(), loadCanonicalRegistry()]);
  const patOk = !!resolveGithubPat();
  const cloudFeedAlive = feeds.find((f) => f.name.startsWith('Autonomy'))?.alive ?? false;

  // חוק-הדרישה: כל-דרישה נבדקת — הפידים-הפומביים משמשים ראיה לדרישות-ענן
  const checks: DemandCheck[] = [];
  for (const d of registry.demands) {
    if (d.state === 'SATISFIED-CLOUD') {
      const feed = feeds.find((f) => f.name.startsWith('ops-intake')) ?? feeds.find((f) => f.name.startsWith('GridWatch'));
      checks.push({
        id: d.id,
        component: d.component,
        needs: d.needs,
        registryState: d.state,
        runtimeState: 'SATISFIED-CLOUD',
        measured: `${d.how} · עדות-ענן: ${feed ? (feed.alive ? `פיד-פומבי חי (גיל ${feed.ageH ?? '?'} שע')` : 'פיד-פומבי לא-זמין כרגע') : 'לא-נמדד'}`,
        ok: true,
      });
    } else {
      const c = checkDemand(d.id, { 'פיד-עצמיות-פומבי': cloudFeedAlive, patVerified: patVerify.hasToken ? patVerify.valid : undefined });
      if (c) checks.push(c);
    }
  }

  const body = {
    registry,
    registrySource: 'canonical (Autonomy/state/keys/REGISTRY.json)' ,
    health: registryHealth(),
    checks,
    feeds,
    sandboxRuntime: {
      pat: !patOk
        ? 'אין-אסימון (נמחק) — כל-כתיבה-מהסנדבוקס נופלת-סגור'
        : patVerify.valid
          ? 'אסימון אומת-מול-גיטהאב (200)'
          : `אסימון-צורה-תקינה שגיטהאב דוחה (http ${patVerify.http}) — שרוף; רוטציה-נדרשת`,
      note: patVerify.valid
        ? 'האסימון-המקומי חי — מסילות-כתיבה זמינות-מהסנדבוקס'
        : 'העותקים-הענניים של GH_PAT חיים (ריצות-ירוקות) — הריבונות כותבת-מהענן עד-אימוץ-עותק-חדש',
    },
    adoption: registry.adoption,
    fetchedAt: new Date().toISOString(),
  };
  return NextResponse.json(body);
}
