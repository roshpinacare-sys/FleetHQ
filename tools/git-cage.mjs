#!/usr/bin/env node
/**
 * git-cage.mjs — כלוב-גיט לתהליכי-סוכן (A2). [T25]
 * ---------------------------------------------------------------------------
 * הפער-המדוד שלנו: "אין שכבת-סנדבוקס נאכפת לתהליכי-סוכן — החוקים פרוצדורליים,
 * לא מנגנוניים". הכלוב הזה מנגנון ברמת-הגיט-עצמו (כמו gitsafety.ts של agentcraft —
 * האימוץ ה-S הראשון בפסק-הדין):
 *   · protocol.allow=never        — אפס-פרוטוקולי-רשת (fetch/push/ls-remote מתים)
 *   · protocol.file.allow=never   — גם remote מקומי חסום
 *   · url.*.insteadOf → caged.invalid — מלכודת-נתב: כל-remote מנותב למת-מחשבון
 *   · GIT_CEILING_DIRECTORIES     — אין-גילוי-ריפו מעל ה-worktree (בריחה-כלפי-מעלה נחסמת)
 *   · GIT_TERMINAL_PROMPT=0       — אף-בקשת-אישורים לא מחכה
 * שימוש:
 *   node tools/git-cage.mjs --selftest          # מדידה: PASS/FAIL לכל-חוק, exit-קוד
 *   node tools/git-cage.mjs --exec -- git log   # ריצת-פקודה בתוך-הכלוב
 * הכלוב לא חוסם עבודה-מקומית: status/log/diff/add/commit רצים כרגיל.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * בונה-סביבת-הכלוב. root: ה-worktree-המותר לסוכן — הכלוב קובע ceiling = האב שלו,
 * כלומר הסוכן עובד בריפו של ה-worktree אך לא יגלה ולא יפעיל שום-ריפו מעליו
 * (מדוד: git בודק cwd ואז עוצר לפני-כניסה-לתיקיית-ה-ceiling).
 */
export function cagedEnv({ root, extra = {} } = {}) {
  const env = { ...process.env, ...extra };
  env.GIT_CONFIG_COUNT = '6';
  const cfg = [
    ['protocol.allow', 'never'],
    ['protocol.file.allow', 'never'],
    ['url.https://caged.invalid/.insteadOf', 'https://'],
    ['url.https://caged.invalid/.insteadOf', 'git@github.com:'],
    ['url.https://caged.invalid/.insteadOf', 'ssh://'],
    ['credential.helper', ''],
  ];
  cfg.forEach(([k, v], i) => {
    env[`GIT_CONFIG_KEY_${i}`] = k;
    env[`GIT_CONFIG_VALUE_${i}`] = v;
  });
  const base = root ? resolve(root) : process.cwd();
  env.GIT_CEILING_DIRECTORIES = dirname(base);
  env.GIT_TERMINAL_PROMPT = '0';
  return env;
}

function run(args, { cwd, env } = {}) {
  return spawnSync('git', args, { cwd, env: env ?? cagedEnv({ root: cwd }), encoding: 'utf-8', timeout: 30_000 });
}

// ─────────────── מדידה-עצמית ───────────────
function selftest() {
  const checks = [];
  const dir = mkdtempSync(join(tmpdir(), 'git-cage-'));
  try {
    // ריפו-מקומי עם קומיט אחד
    const repo = join(dir, 'repo');
    mkdirSync(repo);
    run(['init', '-q'], { cwd: repo, env: { ...process.env } });
    writeFileSync(join(repo, 'a.txt'), 'cage-selftest\n');
    run(['add', '.'], { cwd: repo, env: { ...process.env } });
    run(['-c', 'user.email=cage@local', '-c', 'user.name=cage', 'commit', '-qm', 'seed'], { cwd: repo, env: { ...process.env } });

    // 1) עבודה-מקומית עובדת בתוך-הכלוב
    const st = run(['status', '--porcelain'], { cwd: repo });
    checks.push({ check: 'local-status-ok', want: 'success', got: st.status === 0 ? 'success' : `fail(${st.stderr.trim().slice(0, 80)})`, pass: st.status === 0 });

    const lg = run(['log', '--oneline', '-1'], { cwd: repo });
    checks.push({ check: 'local-log-ok', want: 'success', got: lg.status === 0 ? lg.stdout.trim().slice(0, 20) : `fail(${lg.stderr.trim().slice(0, 80)})`, pass: lg.status === 0 });

    // 2) רשת מתה בתוך-הכלוב (ls-remote על remote-ציבורי אמיתי)
    const ls = run(['ls-remote', 'https://github.com/git/git.git', 'HEAD'], { cwd: repo });
    checks.push({ check: 'network-blocked', want: 'fail', got: ls.status !== 0 ? 'fail' : 'success(!)', pass: ls.status !== 0 });

    // 3) push לרשת מת (מלכודת-insteadOf + protocol)
    const push = run(['push', '--dry-run', 'https://github.com/git/git.git', 'HEAD'], { cwd: repo });
    checks.push({ check: 'push-blocked', want: 'fail', got: push.status !== 0 ? 'fail' : 'success(!)', pass: push.status !== 0 });

    // 4) התקרה: בלי-כלוב, תת-תיקייה רגילה מגלה-את-הריפו-מלמעלה; עם-כלוב (root=inner,
    //    ceiling=האב שלו) — לא. זו ההוכחה-המדודה של איסור-בריחה-כלפי-מעלה.
    const outer = join(dir, 'outer-repo');
    const inner = join(outer, 'inner');
    mkdirSync(outer);
    run(['init', '-q'], { cwd: outer, env: { ...process.env } });
    mkdirSync(inner);
    const uncaged = run(['rev-parse', '--show-toplevel'], { cwd: inner, env: { ...process.env, GIT_CEILING_DIRECTORIES: '' } });
    const caged = run(['rev-parse', '--show-toplevel'], { cwd: inner });
    const uncagedFinds = uncaged.status === 0;
    const cagedBlocked = caged.status !== 0;
    checks.push({
      check: 'ceiling-holds',
      want: 'uncaged-finds+caged-blocked',
      got: `${uncagedFinds ? 'uncaged-finds' : 'uncaged-blocked'}+${cagedBlocked ? 'caged-blocked' : 'caged-finds(!)'}`,
      pass: uncagedFinds && cagedBlocked,
    });

    // 5) עבודה-חוקית שורדת: ריפו מקומי עם תת-תיקייה — הכלוב עם root=הריפו מאפשר עדיין log
    const leg = run(['log', '--oneline', '-1'], { cwd: repo, env: cagedEnv({ root: repo }) });
    checks.push({ check: 'legit-work-survives', want: 'success', got: leg.status === 0 ? leg.stdout.trim().slice(0, 20) : `fail(${leg.stderr.trim().slice(0, 80)})`, pass: leg.status === 0 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const allPass = checks.every((c) => c.pass);
  const verdict = { tool: 'git-cage', law: 'A2 [T25]', at: new Date().toISOString(), pass: allPass, checks };
  console.log(JSON.stringify(verdict, null, 2));
  for (const c of checks) console.error(`${c.pass ? 'PASS' : 'FAIL'}  ${c.check}: want=${c.want} got=${c.got}`);
  process.exit(allPass ? 0 : 1);
}

// ─────────────── ריצה בתוך-הכלוב ───────────────
function exec(argv) {
  if (!argv.length) {
    console.error('שימוש: node tools/git-cage.mjs --exec -- <git args>');
    process.exit(2);
  }
  const r = run(argv, { cwd: process.cwd() });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const argv = process.argv.slice(2);
if (argv[0] === '--selftest') selftest();
else if (argv[0] === '--exec') exec(argv[1] === '--' ? argv.slice(2) : argv.slice(1));
else {
  console.error('שימוש: node tools/git-cage.mjs --selftest | --exec -- <git args>');
  process.exit(2);
}
