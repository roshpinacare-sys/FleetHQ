#!/usr/bin/env node
// tools/value-scan.mjs — T-59: סריקת-ערך אוטונומית מראיות חיות (אפס סודות, אפס המצאות).
// קורא: GOVERNANCE/FLEET-GRAPH.json + office/state/office-state.json (worktree)
//       + משואה ריבונית + מפת-זרימה + pnl-desk (raw keyless, עם timeout וכנות-כשל).
// כותב: office/state/value-scan.json — החוזה של WorldsPayload.valueScan (types.ts).
// כנות: מקור שנפל = שדה חסר, לעולם לא מילוי. אין שינוי generatedAt בלי דלתא-תוכן אמיתית.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const RAW = 'https://raw.githubusercontent.com/roshpinacare-sys'
const OUT = path.join(process.cwd(), 'office', 'state', 'value-scan.json')

async function fetchJson(url, ms = 9000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null // כנה: מקור שנפל
  }
}

async function main() {
  const [graph, office, beacon, flow, pnl] = await Promise.all([
    readFile(path.join(process.cwd(), 'GOVERNANCE', 'FLEET-GRAPH.json'), 'utf-8').then((t) => JSON.parse(t)).catch(() => null),
    readFile(path.join(process.cwd(), 'office', 'state', 'office-state.json'), 'utf-8').then((t) => JSON.parse(t)).catch(() => null),
    fetchJson(`${RAW}/sovereign-beacon/main/state.json`),
    fetchJson(`${RAW}/Sandbox/main/ops/flow/flow-map.json`),
    fetchJson(`${RAW}/Domain/main/dex/pnl-desk.json`),
  ])

  const opportunities = []
  const metrics = {}

  // 1) תור-החייאה (מדידה: FLEET-GRAPH revivalQueue)
  const revival = Array.isArray(graph?.revivalQueue) ? graph.revivalQueue : []
  metrics.revivalLanes = revival.length
  for (const r of revival) {
    opportunities.push({
      id: `scan-revival-${r.repo}`, area: 'revival',
      titleHe: `תחיית ${r.repo} — ${r.lane}`,
      valueHe: r.next ?? '',
      evidence: `FLEET-GRAPH revivalQueue · repo=${r.repo}`,
      source: 'FleetHQ GOVERNANCE/FLEET-GRAPH.json', effort: 'L',
    })
  }

  // 2) צינור-הכלכלה (מדידה: economics.pipeline)
  const econ = Array.isArray(graph?.economics?.pipeline) ? graph.economics.pipeline : []
  metrics.econSteps = econ.length
  for (const [i, p] of econ.entries()) {
    opportunities.push({
      id: `scan-econ-${i}`, area: 'economics',
      titleHe: p.step ?? `צעד-כלכלי ${i + 1}`,
      valueHe: p.value ?? '',
      evidence: 'FLEET-GRAPH economics.pipeline',
      source: 'FleetHQ GOVERNANCE/FLEET-GRAPH.json', effort: 'M',
    })
  }

  // 3) קשתות-מדיניות מוכרזות שיכולות לחיות (מדידה: edges status=policy)
  const edges = Array.isArray(graph?.edges) ? graph.edges : []
  const policyEdges = edges.filter((e) => e.status === 'policy')
  metrics.policyEdges = policyEdges.length
  for (const e of policyEdges) {
    opportunities.push({
      id: `scan-policy-${e.from}-${e.to}`, area: 'flow',
      titleHe: `הפעלת קשת ${e.from}→${e.to}`,
      valueHe: `${e.artifact ?? ''} — קשת מדיניות מוצהרת שיכולה לחיות עכשיו`,
      evidence: `edge status=policy · ${e.mode ?? ''}`,
      source: 'FleetHQ GOVERNANCE/FLEET-GRAPH.json', effort: 'S',
    })
  }

  // 4) משרד: חסימות/תקלות מדודות (מדידה: office-state)
  const tasks = Array.isArray(office?.tasks) ? office.tasks : []
  const agents = Array.isArray(office?.agents) ? office.agents : []
  const blocked = tasks.filter((t) => t.status === 'blocked')
  const errAgents = agents.filter((a) => a.state === 'error')
  metrics.blockedTasks = blocked.length
  metrics.errorAgents = errAgents.length
  metrics.openTasks = tasks.filter((t) => t.status === 'open').length
  metrics.totalTasks = tasks.length
  if (blocked.length > 0) {
    opportunities.push({
      id: 'scan-unblock', area: 'office',
      titleHe: 'קצין-שחרור-חסימות',
      valueHe: `${blocked.length} משימות חסומות ממתינות לשחרור · ראשונה: ${String(blocked[0].title ?? '').slice(0, 60)}`,
      evidence: `office-state tasks status=blocked · capturedAt=${office?.capturedAt ?? '?'}`,
      source: 'FleetHQ office/state/office-state.json', effort: 'S',
    })
  }
  if (errAgents.length > 0) {
    opportunities.push({
      id: 'scan-fix', area: 'office',
      titleHe: 'מהנדס-תיקון (משמרת א)',
      valueHe: `סוכן ${errAgents[0].id ?? '?'} בתקלה מדוד: ${String(errAgents[0].activity ?? '').slice(0, 60)}`,
      evidence: 'office-state agents state=error',
      source: 'FleetHQ office/state/office-state.json', effort: 'S',
    })
  }

  // 5) אוצרה מתחת לרצפה (מדידה: משואה keyless)
  const bp = beacon?.lastPulse ?? beacon?.pulses?.[0] ?? null
  const treasury = typeof bp?.treasuryNetSp === 'number' ? bp.treasuryNetSp : null
  metrics.treasurySp = treasury
  if (treasury !== null && treasury < 3000) {
    opportunities.push({
      id: 'scan-treasury', area: 'economics',
      titleHe: 'חיזוק-אוצרה (ייעוץ בלבד · הכרעה = בעלים)',
      valueHe: `אוצרה ${treasury.toFixed(1)} SP מתחת לרצפת 3,000 — פער נמדד ${(3000 - treasury).toFixed(1)} SP`,
      evidence: `beacon lastPulse at=${bp?.at ?? '?'} · minOperatorSp=${bp?.minOperatorSp ?? '?'}`,
      source: 'sovereign-beacon state.json (keyless)', effort: 'M',
    })
  }

  // 6) יתומים/רוחות-רפאים במפת-הזרימה (מדידה: flow-map)
  const orphans = Array.isArray(flow?.orphans) ? flow.orphans.length : 0
  const ghosts = Array.isArray(flow?.ghosts) ? flow.ghosts.length : 0
  metrics.orphans = orphans
  metrics.ghosts = ghosts
  metrics.flowNodes = Array.isArray(flow?.nodes) ? flow.nodes.length : 0
  if (orphans + ghosts > 0) {
    opportunities.push({
      id: 'scan-artery', area: 'flow',
      titleHe: 'מחבר-עורקים (everything-uses-everything)',
      valueHe: `${orphans} יתומים · ${ghosts} רוחות-רפאים — צמתים שלא מזינים דבר`,
      evidence: `flow-map.json generatedAt=${flow?.generatedAt ?? '?'}`,
      source: 'Sandbox ops/flow/flow-map.json (keyless)', effort: 'S',
    })
  }

  // 7) מושל-כלכלי (מדידה: pnl verdict)
  const verdict = pnl?.verdict ?? null
  metrics.dexVerdict = verdict
  if (verdict === 'EDGE-NEGATIVE-GRID-HOLD') {
    opportunities.push({
      id: 'scan-dex', area: 'economics',
      titleHe: 'מפעיל-שוק (DEX): מציאת-קצה-חיובי',
      valueHe: `המושל מחזיק (lifetime edge ${pnl?.lifetime?.edgePct ?? '?'}%) — הזדמנות: מסלול עם edge ≥ +1% לשחרור ההחזקה`,
      evidence: `pnl-desk verdict=${verdict} · law: ${pnl?.law ?? '?'}`,
      source: 'Domain dex/pnl-desk.json (keyless)', effort: 'M',
    })
  }

  const capped = opportunities.slice(0, 12)
  const out = {
    schema: 'worlds.value-scan/1',
    generatedAt: new Date().toISOString(),
    verdictHe: capped.length
      ? `נמדדו ${capped.length} הזדמנויות-ערך מראיות חיות (גרף + משרד + שרשרת)`
      : 'לא נמדדו הזדמנויות כרגע — כנות מלאה',
    topIds: capped.slice(0, 5).map((o) => o.id),
    metrics,
    opportunities: capped,
  }

  // דלתא-כנות: אין שינוי תוכן אמיתי → לא נכתוב generatedAt חדש (מונע רעש-קומיטים)
  let prev = null
  try {
    prev = JSON.parse(await readFile(OUT, 'utf-8'))
  } catch { /* אין קובץ קודם */ }
  if (prev) {
    const canon = (o) => JSON.stringify({ ...o, generatedAt: '' })
    if (canon(prev) === canon(out)) {
      console.log('SCAN-OK no-delta (content identical — generatedAt untouched)')
      return
    }
  }
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n', 'utf-8')
  console.log(`SCAN-OK opportunities=${capped.length} metrics=${Object.keys(metrics).length}`)
}

main().catch((e) => { console.error('SCAN-FAILED:', e?.message ?? e); process.exit(1) })
