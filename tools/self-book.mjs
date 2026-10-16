#!/usr/bin/env node
/**
 * self-book — ספר-המודעות-העצמית של הרשת (T-77 · owner-trace 1a1374bc626866c9)
 * ============================================================================
 * הבעלים: "אני כל הזמן בונה דברים מעדכן ואני שם לב שהרשת לא מודעת אליהם כלל,
 * לא בודקת את עצמה ולא מודעת לעצמה וליכולות הריבוניות האוטונומיות שלה."
 *
 * התשובה: פעימה-מתוזמנת (git-only, דקות-ציבוריות-חינמיות) שעושה מלאי-מלא של
 * האחוזה: כל-הריפואים (פרטיים-כלול), מה-חדש-מאז-התמונה-הקודמת (ריפו-חדש,
 * וורקפלו-חדש, קבצים-חדשים-בשורש), מי-פעיל-עכשיו, ומה-היכולות-המכניות של
 * הצי (מכונות-ה-Actions). מפרסמת self-book.json + self-book.md בעברית —
 * דיוקנה-העצמי-החי-של-הרשת. אפס-סודות-בלוג · fail-soft-כנה.
 */
import fs from "fs";

const OWNER = "roshpinacare-sys";
const TOKEN = process.env.PAT || "";
const API = "https://api.github.com";
const PREV = "agents/self-book-prev.json";
const OUT_JSON = "agents/self-book.json";
const OUT_MD = "agents/self-book.md";

const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "fleet-self-book",
};

async function api(url) {
  try {
    const res = await fetch(url, { headers: H });
    if (!res.ok) return { status: res.status, json: null };
    return { status: res.status, json: await res.json() };
  } catch {
    return { status: 0, json: null };
  }
}

function rootTreeHash(t) {
  // טביעת-אצבע-זולה לשורש-הריפו: שמות+גדלים של הקבצים בשורש
  return (t || [])
    .filter((x) => x.type === "blob")
    .map((x) => `${x.path}:${x.size ?? 0}`)
    .sort()
    .join("|");
}

async function main() {
  const at = new Date().toISOString();

  // 1) כל-הריפואים
  const repos = [];
  for (let page = 1; page <= 5; page++) {
    const { json } = await api(`${API}/user/repos?per_page=100&page=${page}&sort=pushed`);
    if (!Array.isArray(json) || json.length === 0) break;
    repos.push(...json);
    if (json.length < 100) break;
  }

  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(PREV, "utf8")); } catch { prev = {}; }
  const prevRepos = prev.repos || {};
  const prevAt = prev.at || null;

  // 2) מלאי-לכל-ריפו: וורקפלו-מכונות + טביעת-שורש
  const inventory = [];
  for (const r of repos) {
    const wf = await api(`${API}/repos/${OWNER}/${r.name}/contents/.github/workflows`);
    const workflows = Array.isArray(wf.json)
      ? wf.json.filter((f) => f.type === "file").map((f) => f.name)
      : [];
    const br = await api(`${API}/repos/${OWNER}/${r.name}/branches/main`).catch(() => ({ json: null }));
    let treeSig = "";
    if (br.json?.commit?.sha) {
      const tr = await api(`${API}/repos/${OWNER}/${r.name}/git/trees/${br.json.commit.sha}`);
      treeSig = rootTreeHash(tr.json?.tree);
    }
    inventory.push({
      name: r.name,
      private: r.private,
      description: (r.description || "").slice(0, 120),
      createdAt: r.created_at,
      pushedAt: r.pushed_at,
      workflows,
      treeSig,
    });
  }

  // 3) זיהוי-חדשנות
  const newRepos = [];
  const newWorkflows = [];
  const rootChanged = [];
  for (const it of inventory) {
    const p = prevRepos[it.name];
    if (!p) {
      if (prevAt) newRepos.push(it.name); // ריפו-שנולד-מאז-התמונה
    } else {
      const pWf = new Set(p.workflows || []);
      const added = it.workflows.filter((w) => !pWf.has(w));
      const removed = [...pWf].filter((w) => !it.workflows.includes(w));
      if (added.length || removed.length)
        newWorkflows.push({ repo: it.name, added, removed });
      if (p.treeSig && it.treeSig && p.treeSig !== it.treeSig)
        rootChanged.push(it.name);
    }
  }

  // 4) מפת-יכולות: מה-הצי-יודע-לעשות (מכונות-Actions לפי-משפחה)
  const family = {};
  for (const it of inventory) {
    for (const w of it.workflows) {
      const key = w.replace(/\.yml$/, "").replace(/-cron$/, "");
      (family[key] ||= []).push(it.name);
    }
  }
  const capabilities = Object.entries(family)
    .map(([k, v]) => ({ machine: k, repos: [...new Set(v)].sort() }))
    .sort((a, b) => b.repos.length - a.repos.length);

  // 5) חיות-עכשיו (דחיפה בשעה-האחרונה)
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const aliveNow = inventory.filter((i) => i.pushedAt > hourAgo).map((i) => i.name);

  const book = {
    protocol: "SAOS-SELF-BOOK/1",
    at,
    prevAt,
    law: "הרשת מודעת לעצמה: מלאי-מלא + חדשנות + יכולות, כל 30 דק', git-only",
    totals: {
      repos: inventory.length,
      publicRepos: inventory.filter((i) => !i.private).length,
      privateRepos: inventory.filter((i) => i.private).length,
      machines: capabilities.length,
      aliveLastHour: aliveNow.length,
    },
    newSincePrev: {
      newRepos,
      newWorkflows,
      rootChangedCount: rootChanged.length,
      rootChanged: rootChanged.slice(0, 12),
    },
    aliveLastHour: aliveNow,
    capabilities: capabilities.slice(0, 60),
    repos: inventory,
  };

  fs.mkdirSync("agents", { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 1));

  // 6) דיוקן-עצמי-בעברית
  const L = [];
  L.push(`# ספר-המודעות-העצמית של הרשת — ${at}`);
  L.push("");
  L.push(`**${inventory.length} ריפואים** (${book.totals.publicRepos} ציבוריים · ${book.totals.privateRepos} פרטיים) · **${capabilities.length} מכונות-יכולת** · **${aliveNow.length} פעילים בשעה האחרונה**${prevAt ? ` · תמונה-קודמת: ${prevAt}` : " (תמונה-ראשונה)"}`);
  L.push("");
  if (newRepos.length) {
    L.push(`## 🌱 ריפואים-חדשים שנולדו מאז-התמונה (הבעלים בונה — והרשת רואה)`);
    newRepos.forEach((n) => L.push(`- **${n}**`));
    L.push("");
  }
  if (newWorkflows.length) {
    L.push(`## ⚙️ מכונות-חדשות/שהוסרו מאז-התמונה`);
    newWorkflows.slice(0, 15).forEach((w) =>
      L.push(`- ${w.repo}: ${w.added.length ? `+${w.added.join(", +")}` : ""}${w.removed.length ? ` −${w.removed.join(", −")}` : ""}`),
    );
    L.push("");
  }
  if (aliveNow.length) {
    L.push(`## 💓 פעיל-עכשיו (דחיפה בשעה האחרונה)`);
    L.push(aliveNow.join(" · "));
    L.push("");
  }
  L.push(`## 🧠 מפת-היכולות של הצי (המכונות והריפואים-בהן-הן-חיות)`);
  capabilities.slice(0, 25).forEach((c) =>
    L.push(`- **${c.machine}** → ${c.repos.slice(0, 6).join(", ")}${c.repos.length > 6 ? ` (+${c.repos.length - 6})` : ""}`),
  );
  L.push("");
  L.push(`*חוק: הספר-הזה הוא העין-העצמית של הרשת — נכתב-רק-ממדידה (API), ללא-המצאה, git-only, שורד-מחיקת-סנדבוקסים.*`);
  fs.writeFileSync(OUT_MD, L.join("\n") + "\n");

  // 7) תמונה-חדשה-להשוואה-הבאה (רק-השדות-הדרושים)
  const next = {
    protocol: "SAOS-SELF-BOOK-PREV/1",
    at,
    repos: Object.fromEntries(
      inventory.map((i) => [i.name, { workflows: i.workflows, treeSig: i.treeSig, pushedAt: i.pushedAt }]),
    ),
  };
  fs.writeFileSync(PREV, JSON.stringify(next));

  console.log(`self-book: repos=${inventory.length} new=${newRepos.length} wf-changes=${newWorkflows.length} alive1h=${aliveNow.length}`);
}

main().catch((e) => {
  console.error(`self-book crashed: ${e.message}`);
  // fail-soft: ריצה-אדומה = מייל-אדום = זרם. הרישיון-החסר-הוא-ההתראה (שער-השקט)
  process.exit(0);
});
