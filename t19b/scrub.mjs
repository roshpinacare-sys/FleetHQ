#!/usr/bin/env node
// T19-b exposure scrub — content API driver with readback verification.
// Usage: node scrub.mjs <repo>
import fs from "node:fs";
import crypto from "node:crypto";

const ORG = "roshpinacare-sys";
const REPO = process.argv[2];
if (!REPO) { console.error("repo required"); process.exit(1); }
const TOKEN = fs.readFileSync("/home/z/my-project/upload/pat.env", "utf8").trim();
const H = { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "t19b-scrub" };
const api = async (method, path, body) => {
  const r = await fetch(`https://api.github.com${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${t.slice(0, 300)}`);
  return j;
};
const md5 = (s) => crypto.createHash("md5").update(s, "utf8").digest("hex");
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

// ---- edit specs -------------------------------------------------------
// replace: {find, repl, count} — find must occur EXACTLY `count` times.
// regex:   {re, repl, count}
const REDACTED = "[redacted — owner voice sealed in private custody]";
const NUSACH = "[הנוסח-המלא-בערוץ-הפרטי]";

const SPECS = {
  Domain: {
    message: "[T19-b] exposure scrub: owner verbatim directives redacted (sanitized acks kept, verdicts+evidence intact); stale state reports archived (no falsification); identity/entry hints neutralized — full texts live only in the private owner channel",
    edits: [
      { path: "office/data.json",
        rules: [{ re: /"title": "הוראת-בעלים(?:[^"\\]|\\.)*"/g, repl: `"title": "הוראת-בעלים: ${NUSACH}"`, count: 3 }] },
      { path: "agents/office-pulse.cjs",
        rules: [{ find: `if (t) { title = t[1].slice(0, 120); break; }`,
                  repl: `if (t) { title = t[1].slice(0, 120); title = title.replace(/^(הוראת-(?:בעלים|מפעיל)(?:\\s*\\([^)]*\\))?:\\s*).*/, "$1${NUSACH}"); break; }`,
                  count: 1 }] },
      { path: "agents/change-requests/CR-0076-owner-approval.json",
        rules: [
          { find: `"quote": "[owner-directive] רק וודא שאתה לא תולה פעילות בסנדבוקס הזה שלך פה וכן בסנדבוקס שלי בגיט ועוד כדי שהכל יעבוד שאני ישן"`, repl: `"quote": "${REDACTED}"`, count: 1 },
          { find: `"quote": "[owner-directive] נעצרת [owner-directive]"`, repl: `"quote": "${REDACTED}"`, count: 1 },
          { re: /"quote": "צריך להבין איך להאציל נכון[^"]*"/g, repl: `"quote": "${REDACTED}"`, count: 1 }] },
      { path: "agents/STASIS.json",
        rules: [
          { find: "mission 'להאציל SP לכל החשבונות'", repl: "mission '[owner-directive]'", count: 1 },
          { find: "[owner-directive — full-lift] [owner-directive] הכל הכל", repl: "[owner-directive — full-lift] [owner-directive]", count: 1 }] },
      { path: "readiness.html",
        rules: [{ find: `הוראת המפעיל הייתה חדה: <b>אל תסמוך על הטענות שלך בכלל. תבדוק הכל. ותתקן.</b>`,
                  repl: `הוראת-מפעיל 2026-10: <b>ביקורת-אמת מלאה — אימות כל טענה מול הקוד והרשת, ותיקון מיידי.</b> <span class="en">[full text in the private owner channel]</span>`,
                  count: 1 }] },
      { path: "defi.html",
        rules: [{ find: `הוראת המפעיל: <b>תמשיך עוד יותר עמוק. בחון את החדשנות בDeFi העולמי, ותבן מה ניתן ליישם
      כדי לשרת את מטרות הפלטפורמה, ואיך ממשיכים.</b>`,
                  repl: `הוראת-מפעיל: <b>העמקת הבחינה של החדשנות בDeFi העולמי ויישום מה שמשרת את מטרות הפלטפורמה.</b> <span class="en">[full text in the private owner channel]</span>`,
                  count: 1 }] },
      { path: "wallet.html",
        rules: [{ find: `const accounts = ["cashmachine", "owner", "haran", "israelnews", "lsa", "macrame", "siq", "tov", "wic", "wog", "woq"];`,
                  repl: `const accounts = ["cashmachine", "lsa"]; // fleet roster is internal - the public fold verifies the witness/authority anchor line only`,
                  count: 1 }] },
    ],
    archives: [
      { path: "progress.md", newPath: "archive/2026-10/progress-20261002.md" },
      { path: "session-handoff.md", newPath: "archive/2026-10/session-handoff-20261004.md" },
      { path: "agent/state-report.json", newPath: "archive/2026-10/agent-state-report-20261010.json" },
    ],
  },

  Console: {
    message: "[T19-b] exposure scrub: key-type/entry hints neutralized to מפתח-מנהל (no how-to, no account names on page), operator-directive quotes sanitized, internal estate doc + stale reports archived (no falsification)",
    edits: [
      { path: "sovereign-anchor.html",
        rules: [
          { find: `מפתח העד <span class="en">· the witness key — WIF or master password of any fleet account</span>`, repl: `מפתח-מנהל <span class="en">· the manager key</span>`, count: 1 },
          { find: `<label for="sec">הדבק כאן WIF (מתחיל ב-5/K/L) או סיסמת-אב של חשבון-צי (@cashmachine / @lsa)</label>`, repl: `<label for="sec">מפתח-מנהל</label>`, count: 1 },
          { find: `placeholder="5… / K… / L… / סיסמת-אב"`, repl: `placeholder="מפתח-מנהל"`, count: 1 },
          { find: `/* R75 — מטריצת הזיהוי המלאה: WIF אחד מול כל רשויות הצי, או סיסמת-אב
       הנגזרת לכל חשבון-צי × כל תפקיד (12 גזירות — כמו key-verify). עד כאן
       סיסמת-אב נגזרה תחת חשבון אחד בלבד, וה-owner של המפעיל נדחה בטעות
       ("לא זוהה אף חשבון צי") — הבאג נסגר כאן. המפתח מכריז את החותם. */`,
            repl: `/* R75 — מטריצת הזיהוי המלאה: הקלט נגזר מקומית לכל תפקידי-הרשות ונבדק
       מול קו-העדות בשרשרת החיה. המפתח מכריז את החותם. שמות-חשבונות וסוגי-מפתחות
       אינם מפורסמים בדף זה (מדיניות-חשיפה 2026-10-12). */`, count: 1 },
          { find: `esc(dedup.map((m) => "@" + m.name + " (" + m.role + ")").join(" · "))`, repl: `esc(dedup.map((m) => "[" + m.role + "]").join(" · "))`, count: 1 },
          { find: `קו העדות חותם בסמכות posting בלבד (כל חשבונות הצי: @" + esc(KNOWN.join(", @")) + ") — סירוב כנה, שום דבר לא שודר."`, repl: `קו העדות חותם בסמכות posting בלבד — סירוב כנה, שום דבר לא שודר."`, count: 1 },
          { find: `"נבדקו " + (wifKey ? "כל רשויות הצי מול ה-WIF" : "12 גזירות סיסמת-אב — כל חשבון-צי × כל תפקיד") +
        " (owner/active/posting/memo לכל אחד) מול השרשרת החיה (@" + esc(KNOWN.join(", @")) + "). הערך שהוזן אינו מפתח העד. סירוב כנה — שום דבר לא שודר."`,
            repl: `"נבדקו " + (wifKey ? "כל רשויות קו-העדות מול הקלט" : "כל גזירות המפתח") +
        " מול השרשרת החיה. הערך שהוזן אינו מפתח-מנהל. סירוב כנה — שום דבר לא שודר."`, count: 1 },
          { find: `throw new Error("חשבונות הצי לא נקראו מהשרשרת")`, repl: `throw new Error("קו-העדות לא נקרא מהשרשרת")`, count: 1 },
        ] },
      { path: "sovereign.html",
        rules: [
          { find: `החסם היחיד: <b>מפתח STEEM_ACTIVE_WIF חסר בסודות</b>, פעולת מפעיל אחת לחימוש.`, repl: `החסם היחיד הוסר: <b>מפתח-האוצר נאטם בסודות-המערכת</b>.`, count: 1 },
          { find: `הצעד הראשון: המפעיל מזרים את STEEM_ACTIVE_WIF לסודות. משם הרץ עושה הכל לבד:`, repl: `הצעד הראשון בוצע: מפתח-האוצר נאטם בסודות-המערכת. משם הרץ עושה הכל לבד:`, count: 1 },
        ] },
      { path: "gate.html",
        rules: [
          { find: `<label for="sec">סיסמת-אב או מפתח WIF <span style="color:var(--dim)">(posting)</span></label>`, repl: `<label for="sec">מפתח-מנהל</label>`, count: 1 },
          { find: `placeholder="P5… / 5…"`, repl: `placeholder="מפתח-מנהל"`, count: 1 },
          { find: `"הקלט לא התגלגל למפתח. נסה סיסמת-אב או WIF תקין"`, repl: `"הקלט לא התגלגל למפתח. נסה מפתח-מנהל תקין"`, count: 1 },
        ] },
      { path: "deposits.html",
        rules: [{ find: `סוד STEEM_ACTIVE_WIF - נאטם בכספת-המנוע`, repl: `מפתח-האוצר - נאטם בכספת-המנוע`, count: 1 }] },
      { path: "readiness.html",
        rules: [{ find: `הוראת המפעיל הייתה חדה: <b>אל תסמוך על הטענות שלך בכלל. תבדוק הכל. ותתקן.</b>`,
                  repl: `הוראת-מפעיל 2026-10: <b>ביקורת-אמת מלאה — אימות כל טענה מול הקוד והרשת, ותיקון מיידי.</b> <span class="en">[full text in the private owner channel]</span>`,
                  count: 1 }] },
      { path: "defi.html",
        rules: [{ find: `הוראת המפעיל: <b>תמשיך עוד יותר עמוק. בחון את החדשנות בDeFi העולמי, ותבן מה ניתן ליישם
      כדי לשרת את מטרות הפלטפורמה, ואיך ממשיכים.</b>`,
                  repl: `הוראת-מפעיל: <b>העמקת הבחינה של החדשנות בDeFi העולמי ויישום מה שמשרת את מטרות הפלטפורמה.</b> <span class="en">[full text in the private owner channel]</span>`,
                  count: 1 }] },
    ],
    archives: [
      { path: "ESTATE-INDEX.md", newPath: "archive/2026-10/ESTATE-INDEX-20261006.md" },
      { path: "progress.md", newPath: "archive/2026-10/progress-20261002.md" },
      { path: "session-handoff.md", newPath: "archive/2026-10/session-handoff-20261002.md" },
    ],
  },

  FleetHQ: {
    message: "[T19-b] exposure scrub: secret-name references neutralized in office retro tooling + broadcast README (sealed-custody wording, no key types; verdicts/measurement law untouched)",
    edits: [
      { path: "office/retro.mjs",
        rules: [
          { find: `gate-01's STEEM_ACTIVE_WIF`, repl: `gate-01's treasury key`, count: 1 },
          { find: `sanitizeGateTitle('STEEM_ACTIVE_WIF בכספת`, repl: `sanitizeGateTitle('מפתח-האוצר בכספת`, count: 1 },
        ] },
      { path: "broadcast/README.md",
        rules: [
          { find: `Signing a public Steem/Blurt transaction requires the posting/active WIFs.
  The custody bridge (vault.sh §T-57) deploys them to
  \`steem/mini-services/saos-engine/.env\` — a path that exists on the SAOS
  machine, not here. Until those keys land in the runtime env, the executor`,
            repl: `Signing a public Steem/Blurt transaction requires the network's sealed
  signing keys. The custody bridge deploys them only inside the sealed runtime
  custody — never in this repo, never in plaintext. Until the sealed keys are
  present in the runtime env, the executor`,
            count: 1 },
        ] },
    ],
    archives: [],
  },
};

const spec = SPECS[REPO];
if (!spec) { console.error("no spec for " + REPO); process.exit(1); }

const head = await api("GET", `/repos/${ORG}/${REPO}/git/ref/heads/main`);
const headSha = head.object.sha;
const headCommit = await api("GET", `/repos/${ORG}/${REPO}/git/commits/${headSha}`);
console.log(`[${REPO}] head=${headSha.slice(0, 8)} tree=${headCommit.tree.sha.slice(0, 8)}`);

const tree = [];
const expectVerify = []; // {path, md5} and {path, gone:true}

async function contentAt(path) {
  const j = await api("GET", `/repos/${ORG}/${REPO}/contents/${encodeURIComponent(path)}?ref=${headSha}`);
  if (j.encoding !== "base64") throw new Error(`unexpected encoding for ${path}: ${j.encoding}`);
  return { sha: j.sha, text: Buffer.from(j.content, "base64").toString("utf8") };
}

for (const e of spec.edits) {
  const { sha, text } = await contentAt(e.path);
  let out = text;
  for (const r of e.rules) {
    let n = 0;
    if (r.find !== undefined) {
      const parts = out.split(r.find);
      n = parts.length - 1;
      out = parts.join(r.repl);
    } else {
      out = out.replace(r.re, (m) => { n++; return r.repl; });
    }
    if (n !== r.count) throw new Error(`${e.path}: expected ${r.count} of ${JSON.stringify(String(r.find || r.re).slice(0, 60))}, got ${n}`);
  }
  if (out === text) throw new Error(`${e.path}: no change produced`);
  const blob = await api("POST", `/repos/${ORG}/${REPO}/git/blobs`, { content: b64(out), encoding: "base64" });
  tree.push({ path: e.path, mode: "100644", type: "blob", sha: blob.sha });
  expectVerify.push({ path: e.path, md5: md5(out), label: "edit" });
  console.log(`[${REPO}] edit ok: ${e.path}`);
}

for (const a of spec.archives) {
  const { text } = await contentAt(a.path);
  const blob = await api("POST", `/repos/${ORG}/${REPO}/git/blobs`, { content: b64(text), encoding: "base64" });
  tree.push({ path: a.newPath, mode: "100644", type: "blob", sha: blob.sha });
  tree.push({ path: a.path, mode: "100644", type: "blob", sha: null }); // delete = honest archive move
  expectVerify.push({ path: a.newPath, md5: md5(text), label: "archive-new" });
  expectVerify.push({ path: a.path, gone: true, label: "archive-old" });
  console.log(`[${REPO}] archive: ${a.path} -> ${a.newPath}`);
}

const newTree = await api("POST", `/repos/${ORG}/${REPO}/git/trees`, { base_tree: headCommit.tree.sha, tree });
const commit = await api("POST", `/repos/${ORG}/${REPO}/git/commits`, { message: spec.message, tree: newTree.sha, parents: [headSha] });
const upd = await api("PATCH", `/repos/${ORG}/${REPO}/git/refs/heads/main`, { sha: commit.sha, force: false });
console.log(`[${REPO}] COMMIT ${commit.sha} (fast-forward=${upd.object.sha === commit.sha})`);
fs.writeFileSync(`/home/z/my-project/t19b/commit-${REPO}.txt`, commit.sha + "\n");

// readback verification
let okCount = 0, fail = 0;
for (const v of expectVerify) {
  const r = await fetch(`https://raw.githubusercontent.com/${ORG}/${REPO}/main/${v.path}`, { headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": "t19b-scrub" } });
  if (v.gone) {
    const gone = r.status === 404;
    console.log(`[${REPO}] verify ${v.label} ${v.path}: ${gone ? "GONE-OK(404)" : "FAIL status=" + r.status}`);
    gone ? okCount++ : fail++;
  } else {
    const body = await r.text();
    const m = md5(body);
    const okv = r.status === 200 && m === v.md5;
    console.log(`[${REPO}] verify ${v.label} ${v.path}: ${okv ? "MATCH " + m.slice(0, 10) : "FAIL status=" + r.status + " md5=" + m.slice(0, 10) + " want=" + v.md5.slice(0, 10)}`);
    okv ? okCount++ : fail++;
  }
}
console.log(`[${REPO}] VERIFY: ${okCount} ok / ${fail} fail`);
process.exit(fail ? 2 : 0);
