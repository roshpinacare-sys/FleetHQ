import json, datetime, collections
RAW="/home/z/my-project/t24/raw/"
def iso(ms):
    return datetime.datetime.fromtimestamp(ms/1000, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ') if ms else None
GEN="2026-10-13T23:42:00Z"
def ageMin(ts):
    t=datetime.datetime.fromisoformat(ts.replace("Z","+00:00"))
    g=datetime.datetime.fromisoformat(GEN.replace("Z","+00:00"))
    return round((g-t).total_seconds()/60,1)

f=json.load(open(RAW+"foreman-state.1"))
ws=json.load(open(RAW+"world-state.1"))
q=json.load(open(RAW+"queue.1"))
recs=[json.loads(l) for l in open(RAW+"receipts.1") if l.strip()]
NOW_MS=ws["t"]; H24=86400000

HE={"aluf":"אלוף","erez":"ארז","tamar":"תמר","gal":"גל","shachar":"שחר","yarden":"ירדן","noa":"נועה"}
ROLE={
 "aluf":"מפקדת-המשמרת — דוכן-ההחלטות ולוח-המשימות (ספרים: work-orders, decisions)",
 "erez":"מבקרת-פנים — ספרי-הביקורת (claims-audit ואילך: workflow-audit, harness-audit, deep-audit, capability-matrix)",
 "tamar":"כלכלנית-הצי — econ-book, fleet-roster, sovereign-policy",
 "gal":"מפעילת-שוק — dex-book, fills-ledger (ובקרת-רישום market-grid/truth-history)",
 "shachar":"קצינת-מודיעין — fleet-indicators, fleet-census, pulse-book, learning-summary",
 "yarden":"מהנדסת-תשתיות — registry, coord-bus, status, mirror",
 "noa":"פקידת-קבלה באפליקציה-המקומית בלבד — אינה בצוות-הענן הקנוני",
}
WS_AGENT={a["id"]:a for a in ws["agents"]}
FM_AGENT={a["id"]:a for a in f["agents"]}

crew=[]
for cid in ["aluf","erez","tamar","gal","shachar","yarden","noa"]:
    wa=WS_AGENT.get(cid); fa=FM_AGENT.get(cid)
    done24=[]; blocked=[]; doing=[]; total_done=0
    for t in f["tasks"]:
        if t.get("assignee")!=cid: continue
        up=t.get("updatedAt") or 0
        if t.get("status")=="done":
            total_done+=1
            if up and NOW_MS-up<H24:
                done24.append({"id":t["id"],"what":t["title"],"evidence":f"foreman task {t['id']} · status=done · updatedAt={iso(up)}","when":iso(up)})
        elif t.get("status")=="blocked":
            blocked.append({"id":t["id"],"what":t["title"],"since":iso(t.get("createdAt"))})
        elif t.get("status")=="doing":
            doing.append({"id":t["id"],"what":t["title"],"since":iso(t.get("createdAt"))})
    if cid=="noa":
        currently="אינה מופיעה בעולם-הענן; באפליקציה-המקומית עומדת בקבלה ללא רישומי-מבקרים (0 שיחות, 0 עובדות, 0 פניות — נמדד בבסיס-הנתונים המקומי)"
        working=False
        ws_ev=[]
    else:
        evs=[e for e in ws["events"] if e["who"]==cid]
        currently=wa["activity"] or (evs[-1]["text"].split("·")[0].strip() if evs else "—")
        working=True
    crew.append({
      "id":cid,"heName":HE[cid],"role":ROLE[cid],
      "currentlyDoing":currently,
      "worldState":None if not wa else {"state":wa["state"],"deskId":wa.get("deskId"),"books":wa.get("books"),"typing":wa.get("typing"),"position":{"x":wa["x"],"z":wa["z"]}},
      "foreman":None if not fa else {"state":fa["state"],"station":fa["station"],"since":iso(fa.get("since"))},
      "workingNow":working,
      "workingNowEvidence":("world-state טרי (0.9-3.4 דק) — אירוע אחרון שלה ביומן-העולם" if working else "אין-נוכחות במקורות-הענן; בסיס-הנתונים המקומי שלה ריק (0 רשומות)"),
      "foremanTotals":{"done":total_done,"doneLast24h":len(done24),"blocked":len(blocked),"doing":len(doing)},
      "closedLast24h":done24,
      "openOrStuck":blocked+doing,
      "sources":["Domain/office/world-state.json","Domain/office/world-journal.jsonl","FleetHQ/office/state/office-state.json"],
    })

unowned=[]
for o in q["orders"]:
    unowned.append({"id":o["id"],"repo":o["repo"],"kind":o["kind"],"severity":o.get("severity"),"title":o["title"],
      "firstSeen":o.get("firstSeen"),"status":o.get("status"),
      "owner":None,"why":o.get("why","")[:220]})
last_receipt=recs[-1]["at"]
verdict={
 "measuredAt":GEN,
 "roomAlive":"כן — פעימת-עולם בת 0.9-3.4 דק', 720 אירועי-צוות ביומן (60 פעימות, 19:07→23:31Z)",
 "crewTaskClosures24h":sum(c["foremanTotals"]["doneLast24h"] for c in crew),
 "crewTaskClosures24hNote":"11 סגירות-משימות-פורמן (סיורי-ספרים) — ארז 2, גל 4, שחר 5; תמר 0, ירדן 0, אלוף 0 (היא מקצה, לא מבצעת)",
 "organCommitReceipts24h":3,
 "organCommitReceiptsNote":"כל קבלות-הקומיט ב-24h שייכות לאיבר ops-forge, לא לאף אחת מהצוות",
 "openOrders":len(q["orders"]),"openOrdersOwnedByCrew":0,
 "blockedCrewTasks":2,"stuckDoingTasks":1,
 "unansweredOwnerClaims":3,
 "forgeGap":"קבלת ops-forge האחרונה 20:37:12Z — פער ~3 שע מול קצב-מחזור 30 דק; ops-forge דווח amber ב-fleet-health 23:08Z",
 "chatBusySince":"2026-10-13T15:05:38Z (חריץ-צ'אט תפוס ~8.5 שע — נמדד ב-world-state chatBusy[0])",
 "bottomLine":"החדר חי והצוות 'עסוק', אבל העסוק הוא תוויות-מנוע: הסגירות-המדודות של הצוות הן 11 סיורי-ספרים; אפס סדרי-עבודה תפעוליים משויכים לאף אחת; 2 משימות חסומות, 1 משימה 'בביצוע' תקועה על כלי חסר, ו-3 פניות-בעלים ללא הכרעה.",
}
sources=[
 {"name":"Domain/office/world-state.json","url":"https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/office/world-state.json","fetchedAt":"2026-10-13T23:34:59Z","internalStamp":"2026-10-13T23:31:35.636Z","ageMin":ageMin("2026-10-13T23:31:35.636Z"),"stale":False,"md5":"a680badade81309bbb72de17c42dbf81","doubleFetchStable":True},
 {"name":"Domain/office/world-journal.jsonl","url":"https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/office/world-journal.jsonl","fetchedAt":"2026-10-13T23:35:00Z","internalStamp":"2026-10-13T23:30:39.763Z","ageMin":ageMin("2026-10-13T23:30:39.763Z"),"stale":False,"md5":"9905cba030be8f822a266de62b56be0c","doubleFetchStable":True},
 {"name":"ops-intake/ops/QUEUE.json","url":"https://raw.githubusercontent.com/roshpinacare-sys/ops-intake/main/ops/QUEUE.json","fetchedAt":"2026-10-13T23:35:00Z","internalStamp":"2026-10-13T22:27:01.878Z","ageMin":ageMin("2026-10-13T22:27:01.878Z"),"stale":False,"md5":"4f11cd0064d8fc65151b73f457332176","doubleFetchStable":True},
 {"name":"ops-forge/ops/RECEIPTS.jsonl","url":"https://raw.githubusercontent.com/roshpinacare-sys/ops-forge/main/ops/RECEIPTS.jsonl","fetchedAt":"2026-10-13T23:35:01Z","internalStamp":"2026-10-13T20:37:12.445Z","ageMin":ageMin("2026-10-13T20:37:12.445Z"),"stale":False,"md5":"643710cdf0068c84f4b4578a9f87b3d6","doubleFetchStable":True,"note":"פער-קצב: מחזור-אחרון 20:37Z מול cadenceMin=30"},
 {"name":"Autonomy/state/selfhood/journal.jsonl","url":"https://raw.githubusercontent.com/roshpinacare-sys/Autonomy/main/state/selfhood/journal.jsonl","fetchedAt":"2026-10-13T23:35:09Z","internalStamp":"2026-10-13T22:47:50Z","ageMin":ageMin("2026-10-13T22:47:50Z"),"stale":False,"md5":"db1ab55a2c5462fb61d8e51b57b04e52","doubleFetchStable":True},
 {"name":"GridWatch/state/fleet-health.json","url":"https://raw.githubusercontent.com/roshpinacare-sys/GridWatch/main/state/fleet-health.json","fetchedAt":"2026-10-13T23:35:10Z","internalStamp":"2026-10-13T23:08:13.361Z","ageMin":ageMin("2026-10-13T23:08:13.361Z"),"stale":False,"md5":"db6907f5b761d328ee9fac583559baad","doubleFetchStable":True},
 {"name":"Autonomy/state/selfhood/claims.jsonl","url":"https://raw.githubusercontent.com/roshpinacare-sys/Autonomy/main/state/selfhood/claims.jsonl","fetchedAt":"2026-10-13T23:35:11Z","internalStamp":"2026-10-13T22:51:40.757Z","ageMin":ageMin("2026-10-13T22:51:40.757Z"),"stale":False,"md5":"fe9c738f09d1ea66c520183af0b6ae54","doubleFetchStable":True},
 {"name":"FleetHQ/office/state/office-state.json (המיקום-החדש; FleetHQ/main/office-state.json = 404 נמדד)","url":"https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/main/office/state/office-state.json","fetchedAt":"2026-10-13T23:35:32Z","internalStamp":"2026-10-13T21:39:17.696Z","ageMin":ageMin("2026-10-13T21:39:17.696Z"),"stale":False,"md5":"409a7f8c5754c9a7411302ca3834f177","doubleFetchStable":True},
 {"name":"אימות-קבלות בנקודות-קצה .patch של גיטהאב (אנונימי, HTTP 200)","url":"https://github.com/roshpinacare-sys/ops-forge/commit/{827ca4039e074e350d7dd97d5087a1592b1cff8f,1d850729109060748c081e2d5698d9079a8be198,5db7c338126b739183349e44bcc3595999178755}.patch","fetchedAt":"2026-10-13T23:39:41Z-23:40:21Z","internalStamp":None,"ageMin":2.2,"stale":False,"md5":None,"doubleFetchStable":True},
 {"name":"api.github.com (org events + commit) — חסום","url":"https://api.github.com/orgs/roshpinacare-sys/events","fetchedAt":"2026-10-13T23:39:42Z","internalStamp":None,"ageMin":None,"stale":True,"md5":None,"doubleFetchStable":None,"note":"rate-limit אנונימי מה-IP-המשותף — לא נמדד ממנו דבר"},
 {"name":"בסיס-נתונים מקומי (נועה)","url":"file:/home/z/my-project/db/custom.db","fetchedAt":"2026-10-13T23:37:00Z","internalStamp":"2026-10-13T21:53 (mtime)","ageMin":ageMin("2026-10-13T21:53:00Z"),"stale":False,"md5":None,"doubleFetchStable":True,"note":"VisitorSession/VisitorMsg/ClerkFact/VisitorRequest = 0 שורות"},
]
out={"generatedAt":GEN,"schema":"crew-closure v1","sources":sources,"crew":crew,"unownedOpenOrders":unowned,
 "fleetHealth":{"generatedAt":"2026-10-13T23:08:13.361Z","repos":34,"public":13,"private":21,
   "reposHealth":{"green":11,"amber":21,"red":2},"workflows":{"total":297,"green":178,"amber":112,"red":7},
   "redRepos":["Domain (3 red וורקפלו)","Console (4 red — key-verify 6 כשלים רצופים, התראה יחידה ברמת red)"],
   "amberReposNotable":["ops-forge (וורקפלו יחיד amber — המחזורים מאז 20:37Z לא תועדו)"],
   "note":"אין מיפוי צוות→ריפו בענן; הספרים של הצוות הם ארטיפקטים-משרדיים, לא ריפו"},
 "verdictSummary":verdict}
json.dump(out, open("/home/z/my-project/t24/crew-closure.json","w"), ensure_ascii=False, indent=1)
print("crew-closure.json written,", len(json.dumps(out)), "bytes")
for c in out["crew"]:
    print(c["id"], c["heName"], "| now:", c["workingNow"], "| done24:", c["foremanTotals"]["doneLast24h"], "| total:", c["foremanTotals"]["done"], "| open/stuck:", c["openOrStuck"])
