/**
 * RecruitmentBoard.tsx — לוח-הגיוס והערך. [T13 · T14]
 * ---------------------------------------------------------------------------
 * הלולאה שהבעלים דרש: "שכל הזמן ישאלו מה הפוטנציאל, מה פתוח, ומה יכול
 * לתת לנו עוד ערך" — נענית כאן עם מדידות-בלבד:
 *  · הכרעות: הריבונות מכריעה בעצמה (sovereign-decider על הגיט 24/7) [T14]
 *  · גיוס: תפקידים שנגזרו מראיות מדודות (roles.ts — אפס-המצאות)
 *  · ערך: הזדמנויות מסריקת-הערך האוטונומית (value-scan.yml על הגיט, כל 30 דק')
 * לוח-ריק = כנות ("אין ראיות מדודות"), לעולם לא תפקידים מדומיינים.
 */
'use client';

import { useMemo } from 'react';
import type { SovereignDecision, WorldsPayload } from '@/lib/worlds/types';
import { deriveRecruitment, deriveValue } from '@/lib/worlds/roles';
import { ageHe } from '@/lib/worlds/bridge';

const SEV: Record<string, string> = {
  red: 'border-red-700/40 bg-red-500/10 text-red-800 dark:text-red-300',
  amber: 'border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  teal: 'border-emerald-700/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
};

const DEC_STATUS: Record<string, { he: string; cls: string }> = {
  ENFORCED: { he: 'אוכף', cls: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-700/40' },
  'STAGED-EXEC': { he: 'מוכן-לביצוע-מפתח', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-600/40' },
  OBSERVING: { he: 'צופה · ממשיך-למדוד', cls: 'bg-black/5 text-[color:var(--ink-2)] border-[color:var(--line)]' },
  REVOKED: { he: 'בוטל', cls: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-700/40' },
};

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3.5 shadow-sm">{children}</div>;
}

/** כרטיס-הכרעה — פסק + סטטוס + אופציות-מנוקבות + עדויות (אנטי-זיופים בתצוגה) */
function DecisionCard({ d }: { d: SovereignDecision }) {
  const st = DEC_STATUS[d.status] ?? DEC_STATUS.OBSERVING;
  return (
    <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[13.5px] font-bold text-[color:var(--ink)]">{d.titleHe}</div>
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.he}</span>
        {d.priority && (
          <span className="shrink-0 rounded bg-[color:var(--accent-dim)] px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--accent)]">
            {d.priority} · {d.area}
          </span>
        )}
      </div>
      <div className="mt-1 text-[12.5px] leading-relaxed text-[color:var(--ink)]">{d.verdictHe}</div>
      {d.options && d.options.length > 0 && (
        <div className="mt-2 space-y-1">
          {d.options.map((o) => (
            <div key={o.id} className="flex items-start gap-2 text-[11.5px] leading-relaxed">
              <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                o.status === 'CHOSEN' ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300'
                : o.status === 'REJECTED' ? 'bg-red-500/10 text-red-700 dark:text-red-300 line-through opacity-70'
                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'}`}>
                {o.status === 'CHOSEN' ? `נבחרה · ${o.total} נק'` : o.status === 'REJECTED' ? `נדחתה · ${o.total} נק'` : o.status}
              </span>
              <span className="text-[color:var(--ink-2)]">{o.he}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 border-t border-[color:var(--line)] pt-1.5 text-[11px] leading-relaxed text-[color:var(--ink-3)]">
        {d.evidence.slice(0, 4).map((e, i) => <div key={i}>· {e}</div>)}
        <div className="mt-1 opacity-80">הוכרע {ageHe(Math.max(0, (Date.now() - Date.parse(d.decidedAt)) / 1000))} · {d.decidedBy}</div>
      </div>
    </div>
  );
}

export function RecruitmentBoard({ p }: { p: WorldsPayload | null }) {
  const roles = useMemo(() => deriveRecruitment(p), [p]);
  const value = useMemo(() => deriveValue(p), [p]);
  const decisions = useMemo(
    () => (p?.decisions.ok && Array.isArray(p.decisions.data?.decisions) ? p.decisions.data!.decisions! : []),
    [p],
  );
  const decMeta = p?.decisions.data ?? null;
  const chainMatch = decMeta?.chainVerify?.beaconChainMatch;

  const questions = useMemo(() => {
    const treasury = p?.beacon.data?.lastPulse?.treasuryNetSp ?? null;
    const dex = p?.dex.data;
    const orphans = Array.isArray(p?.flow.data?.orphans) ? p!.flow.data!.orphans!.length : 0;
    const ghosts = Array.isArray(p?.flow.data?.ghosts) ? p!.flow.data!.ghosts!.length : 0;
    const blocked = (p?.foreman.data?.tasks ?? []).filter((t) => t.status === 'blocked').length;
    return [
      {
        q: 'מה הפוטנציאל?',
        a: treasury !== null
          ? `אוצרה ${treasury.toFixed(1)} SP (רצפה 3,000 — פער ${Math.max(0, 3000 - treasury).toFixed(1)}) · DEX ${dex?.verdict ?? '?'}${typeof dex?.openOrdersNow === 'number' ? ` · ${dex.openOrdersNow} פקודות פתוחות` : ''}`
          : 'לא ידוע — מקורות כלכליים לא זמינים',
      },
      {
        q: 'מה פתוח?',
        a: `${roles.length} תפקידי-גיוס עם ראיות · ${blocked} משימות חסומות · ${orphans} יתומים + ${ghosts} רוחות-רפאים במפת-הזרימה`,
      },
      {
        q: 'מה יכול לתת ערך נוסף?',
        a: value.ops.length
          ? `${value.ops.length} הזדמנויות מסריקת-הערך · ראשונה: ${value.ops[0].titleHe}`
          : 'סריקת-הערך האוטונומית טרם פרסמה — value-scan.yml רץ על הגיט כל 30 דק׳',
      },
    ];
  }, [p, roles.length, value.ops]);

  return (
    <div className="h-full w-full overflow-y-auto px-4 pb-6 pt-4 rtl" dir="rtl"
         style={{ scrollbarWidth: 'thin' }}>
      <div className="mx-auto max-w-4xl space-y-4">
        {/* הכרעות-הריבונות — מוכרעות-ממש, לא ממתינות-לבעלים [T14] */}
        <section aria-labelledby="decisions-h">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="decisions-h" className="text-[15px] font-bold text-[color:var(--ink)]">
              הכרעות-הריבונות — מוכרעות-ממש על-הגיט 24/7
            </h2>
            <span className="text-[11px] text-[color:var(--ink-3)]">
              צו-הריבונות (CHARTER) · אין-המתנה-להוראות · כל הכרעה = מדידה + קריטריונים + אימות
            </span>
          </div>
          {!p?.decisions.ok || !decMeta ? (
            <Card><p className="text-[12.5px] text-[color:var(--ink-2)]">
              מנוע-ההכרעה (sovereign-decider.yml) טרם פרסם — כנות, לא מילוי.
            </p></Card>
          ) : (
            <div className="space-y-2.5">
              {/* שורת-אימות: המנוע מודד-את-השרשרת-בעצמו בכל פעימה */}
              <div className="flex flex-wrap items-center gap-1.5">
                {typeof chainMatch === 'boolean' && (
                  <span className={`sl-chip ${chainMatch ? 'bg-[color:var(--surface-2)]/95' : 'bg-amber-500/15 text-amber-700'}`}>
                    {chainMatch
                      ? `ביקורת-אמת: ההכרעות נמדדות מול השרשרת · אוצרה ${decMeta.chainVerify?.treasuryNetSp ?? '?'} SP · תואם`
                      : 'ביקורת-אמת: אי-התאמה נמדדה בין מדידת-המנוע למשואה — דגל כנה'}
                  </span>
                )}
                {decMeta.generatedAt && (
                  <span className="sl-chip bg-[color:var(--surface-2)]/95">
                    הוכרע {ageHe(Math.max(0, (Date.now() - Date.parse(decMeta.generatedAt)) / 1000))}
                  </span>
                )}
                {(decMeta.degraded ?? []).length > 0 && (
                  <span className="sl-chip bg-amber-500/15 text-amber-700">מקורות-חסרים: {decMeta.degraded!.join(', ')}</span>
                )}
              </div>
              {(decisions.length === 0) ? (
                <Card><p className="text-[12.5px] text-[color:var(--ink-2)]">הפנקס ריק-כרגע — כנות.</p></Card>
              ) : (
                <div className="grid max-h-96 gap-2.5 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                  {decisions.map((d) => <DecisionCard key={d.id} d={d} />)}
                </div>
              )}
            </div>
          )}
        </section>
        {/* שלוש-השאלות החיות */}
        <div className="grid gap-3 sm:grid-cols-3">
          {questions.map((x) => (
            <Card key={x.q}>
              <div className="mb-1 text-[13.5px] font-bold text-[color:var(--ink)]">{x.q}</div>
              <div className="text-[12px] leading-relaxed text-[color:var(--ink-2)]">{x.a}</div>
            </Card>
          ))}
        </div>

        {/* גיוס עובדים — רק מראיות */}
        <section aria-labelledby="recruit-h">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 id="recruit-h" className="text-[15px] font-bold text-[color:var(--ink)]">גיוס עובדים — תפקידים עם ראיות מדודות</h2>
            <span className="text-[11px] text-[color:var(--ink-3)]">כל תפקיד = עדות + מקור · אפס המצאות</span>
          </div>
          {roles.length === 0 ? (
            <Card><p className="text-[12.5px] text-[color:var(--ink-2)]">
              אין בקשות-גיוס מדודות כרגע — האורגניזם ברי-כיסוי לפי המדידות הקיימות. כנות מלאה.
            </p></Card>
          ) : (
            <div className="grid max-h-96 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2" style={{ scrollbarWidth: 'thin' }}>
              {roles.map((r) => (
                <div key={r.id} className={`rounded-xl border p-3.5 ${SEV[r.severity]}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[13.5px] font-bold">{r.titleHe}</div>
                    <span className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold">ראיה</span>
                  </div>
                  <div className="mt-1 text-[12px] leading-relaxed">{r.whyHe}</div>
                  <div className="mt-1.5 border-t border-black/10 pt-1.5 text-[11px] leading-relaxed opacity-80">
                    {r.evidence} · מקור: {r.source}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* סריקת-ערך אוטונומית */}
        <section aria-labelledby="value-h">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 id="value-h" className="text-[15px] font-bold text-[color:var(--ink)]">סריקת-ערך אוטונומית (value-scan · על הגיט 24/7)</h2>
            <span className="text-[11px] text-[color:var(--ink-3)]">
              {value.scannedAt ? `נסרק ${ageHe(Math.max(0, (Date.now() - Date.parse(value.scannedAt)) / 1000))}` : 'טרם פורסמה'}
            </span>
          </div>
          {value.verdictHe ? (
            <Card><p className="mb-2 text-[12.5px] font-semibold text-[color:var(--ink)]">פסק הסריקה: {value.verdictHe}</p></Card>
          ) : null}
          {value.ops.length === 0 ? (
            <Card><p className="text-[12.5px] text-[color:var(--ink-2)]">
              המנוע האוטונומי (value-scan.yml) יפרסם לכאן הזדמנויות-ערך — כל אחת עם ראיה מדודה ומקור.
              עד-אז: כנות, לא מילוי.
            </p></Card>
          ) : (
            <div className="grid max-h-96 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2" style={{ scrollbarWidth: 'thin' }}>
              {value.ops.map((o) => (
                <div key={o.id} className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-bold text-[color:var(--ink)]">{o.titleHe}</div>
                    <span className="rounded bg-[color:var(--accent-dim)] px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--accent)]">
                      {o.area} · מאמץ {o.effort}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] leading-relaxed text-[color:var(--ink-2)]">{o.valueHe}</div>
                  <div className="mt-1.5 border-t border-[color:var(--line)] pt-1.5 text-[11px] leading-relaxed text-[color:var(--ink-3)]">
                    ראיה: {o.evidence} · מקור: {o.source}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
