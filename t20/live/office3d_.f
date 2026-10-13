<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>מפקדת הצי — המשרד התלת-מימדי החי</title>
<meta name="description" content="המשרד החי של הריבונות האוטונומית: צוות סוכנים אמיתי עובד, מתפתח ומדייק את עצמו — ורואים הכול." />
<link rel="preconnect" href="/" />
<style>
  :root {
    --bg: #efe9db;
    --ink: #2c2a26;
    --ink-2: #6b6459;
    --paper: #f7f4ec;
    --line: rgba(60,52,40,0.14);
    --accent: #c2792e;
    --ok: #3e7d5a;
    --warn: #b28a2e;
    --bad: #b0483a;
    --chip: rgba(28,26,23,0.78);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: 'Heebo', 'Rubik', system-ui, -apple-system, 'Segoe UI', sans-serif;
    background: var(--bg); color: var(--ink);
    overflow: hidden; user-select: none; -webkit-user-select: none;
  }
  #stage { position: fixed; inset: 0; }
  canvas { display: block; }

  /* ───── עומק צילומי (וינייטה עדינה) ───── */
  #vignette {
    position: fixed; inset: 0; z-index: 10; pointer-events: none;
    background: radial-gradient(ellipse 120% 90% at 50% 42%, transparent 58%, rgba(56,40,22,0.16) 100%);
  }

  /* ───── מסך-טעינה ───── */
  #loader {
    position: fixed; inset: 0; z-index: 60;
    background: linear-gradient(160deg, #221d17 0%, #35291d 60%, #473122 100%);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 18px; color: #f2ead8; transition: opacity .7s ease; text-align: center;
  }
  #loader.hide { opacity: 0; pointer-events: none; }
  #loader .flame { font-size: 44px; filter: drop-shadow(0 0 18px rgba(255,150,40,.55)); animation: flick 1.6s infinite ease-in-out; }
  @keyframes flick { 0%,100% { transform: scale(1); opacity: .95 } 50% { transform: scale(1.08); opacity: 1 } }
  #loader h1 { font-size: 22px; font-weight: 800; letter-spacing: .5px; }
  #loader p { font-size: 13px; color: #cbbfa8; max-width: 420px; line-height: 1.7; padding: 0 24px; }
  #bar { width: min(320px, 70vw); height: 6px; background: rgba(255,255,255,.14); border-radius: 3px; overflow: hidden; }
  #bar > i { display: block; height: 100%; width: 8%; background: linear-gradient(90deg, #e0973f, #ffcf7a); border-radius: 3px; transition: width .4s ease; }
  #loadState { font-size: 12px; color: #a89a80; }

  /* ───── שכבת-בועות ───── */
  #bubbles { position: fixed; inset: 0; z-index: 20; pointer-events: none; overflow: hidden; }
  .bubble {
    position: absolute; transform: translate(-50%, -110%);
    background: rgba(253,251,246,0.97); color: #2c2a26;
    border: 1px solid rgba(60,52,40,0.16); border-radius: 12px;
    padding: 8px 12px; font-size: 13px; line-height: 1.45; max-width: 230px;
    box-shadow: 0 2px 6px rgba(30,22,10,0.08), 0 10px 28px rgba(30,22,10,0.16);
    opacity: 0; transition: opacity .25s ease;
  }
  .bubble::after {
    content: ''; position: absolute; bottom: -7px; right: 24px;
    border: 7px solid transparent; border-top-color: rgba(253,251,246,0.97); border-bottom: 0;
  }
  .bubble.show { opacity: 1; }
  .bubble .who { font-weight: 800; font-size: 11px; margin-inline-start: 2px; }
  .bubble.live { border-color: var(--ok); }

  /* ───── מסגרת-עליונה ───── */
  #topbar {
    position: fixed; top: 12px; inset-inline: 14px; z-index: 30;
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    pointer-events: none;
  }
  #topbar > * { pointer-events: auto; }
  .glass {
    background: rgba(249,246,239,0.82); backdrop-filter: blur(18px) saturate(1.35); -webkit-backdrop-filter: blur(18px) saturate(1.35);
    border: 1px solid rgba(60,52,40,0.15); border-radius: 14px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.65), 0 1px 2px rgba(40,30,15,0.05), 0 12px 32px rgba(40,30,15,0.13);
  }
  #brand { display: flex; align-items: center; gap: 11px; padding: 9px 16px; }
  #brand .mark {
    width: 34px; height: 34px; border-radius: 10px; flex: none;
    background: radial-gradient(circle at 50% 62%, #ffcf7a 0%, #e0973f 52%, #8a4b1e 100%);
    display: grid; place-items: center; font-size: 18px;
    box-shadow: inset 0 -3px 6px rgba(60,25,0,0.35), inset 0 1px 2px rgba(255,255,255,0.5), 0 2px 6px rgba(150,80,20,0.35);
  }
  #brand .t { line-height: 1.2; }
  #brand .t b { font-size: 15.5px; font-weight: 800; display: block; }
  #brand .t span { font-size: 11.5px; color: var(--ink-2); }
  #chips { display: flex; align-items: center; gap: 8px; padding: 8px 12px; flex-wrap: wrap; justify-content: flex-end; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 700; padding: 5px 11px; border-radius: 999px;
    background: rgba(60,52,40,0.07); color: var(--ink-2); white-space: nowrap;
    border: 1px solid rgba(60,52,40,0.06);
  }
  .chip .dot { width: 8px; height: 8px; border-radius: 50%; background: #9a938a; }
  .chip.ok { color: var(--ok); background: rgba(62,125,90,0.08); border-color: rgba(62,125,90,0.14); }
  .chip.ok .dot { background: var(--ok); box-shadow: 0 0 0 0 rgba(62,125,90,0.5); animation: ring 2.2s infinite; }
  .chip.warn { color: var(--warn); background: rgba(178,138,46,0.08); border-color: rgba(178,138,46,0.16); } .chip.warn .dot { background: var(--warn); }
  .chip.bad { color: var(--bad); background: rgba(176,72,58,0.08); border-color: rgba(176,72,58,0.16); } .chip.bad .dot { background: var(--bad); }
  @keyframes ring { 0% { box-shadow: 0 0 0 0 rgba(62,125,90,0.45) } 70% { box-shadow: 0 0 0 6px rgba(62,125,90,0) } 100% { box-shadow: 0 0 0 0 rgba(62,125,90,0) } }
  #clock { font-variant-numeric: tabular-nums; }
  .iconbtn {
    width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--line);
    background: rgba(255,255,255,0.65); cursor: pointer; font-size: 15px; color: var(--ink);
    display: grid; place-items: center; transition: transform .12s ease, background .15s ease, box-shadow .15s ease;
  }
  .iconbtn:hover { background: #fff; box-shadow: 0 3px 10px rgba(40,30,15,0.12); transform: translateY(-1px); }
  .iconbtn:active { transform: translateY(0) scale(0.96); box-shadow: none; }

  /* ───── רוסטר ───── */
  #roster {
    position: fixed; top: 74px; inset-inline-end: 14px; z-index: 25;
    width: 264px; max-height: calc(100dvh - 200px);
    display: flex; flex-direction: column; overflow: hidden;
  }
  #roster header { padding: 11px 15px 8px; font-size: 12.5px; font-weight: 800; color: var(--ink-2); display: flex; justify-content: space-between; align-items: center; }
  #roster header b { color: var(--ink); }
  #rosterList { overflow-y: auto; padding: 0 8px 10px; scrollbar-width: thin; scrollbar-color: rgba(60,52,40,0.25) transparent; }
  #rosterList::-webkit-scrollbar { width: 5px; }
  #rosterList::-webkit-scrollbar-thumb { background: rgba(60,52,40,0.22); border-radius: 3px; }
  .agentRow {
    display: flex; gap: 10px; align-items: center; width: 100%;
    padding: 8px 9px; border: 0; border-radius: 12px; cursor: pointer;
    background: transparent; text-align: start; font-family: inherit;
    transition: background .15s ease, transform .12s ease;
  }
  .agentRow:hover { background: rgba(60,52,40,0.06); transform: translateX(-2px); }
  .agentRow:active { transform: translateX(0) scale(0.99); }
  .agentRow.active { background: rgba(194,121,46,0.13); box-shadow: inset 0 0 0 1px rgba(194,121,46,0.25); }
  .agentRow .avatar {
    width: 34px; height: 34px; border-radius: 50%; flex: none; display: grid; place-items: center;
    color: #fff; font-weight: 800; font-size: 15px; text-shadow: 0 1px 2px rgba(0,0,0,.25);
  }
  .agentRow .info { flex: 1; min-width: 0; }
  .agentRow .nm { font-size: 13.5px; font-weight: 800; display: flex; align-items: center; gap: 6px; }
  .agentRow .nm small { font-weight: 600; color: var(--ink-2); font-size: 11px; }
  .agentRow .act { font-size: 11.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  .agentRow .st { width: 8px; height: 8px; border-radius: 50%; flex: none; background: #9a938a; }
  .st.work { background: var(--ok); animation: pulse 2s infinite; }
  .st.walk { background: var(--warn); }
  .st.idle { background: #9a938a; }
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }

  /* ───── סרגל-תצפית תחתון ───── */
  #deck {
    position: fixed; bottom: 14px; inset-inline: 0; z-index: 30;
    display: flex; justify-content: center; pointer-events: none; padding: 0 12px;
  }
  #deckInner { pointer-events: auto; display: flex; gap: 6px; padding: 7px; flex-wrap: wrap; justify-content: center; }
  .vbtn {
    border: 1px solid transparent; background: transparent; font-family: inherit;
    font-size: 12.5px; font-weight: 700; color: var(--ink-2);
    padding: 7px 13px; border-radius: 10px; cursor: pointer; white-space: nowrap;
    transition: background .15s ease, color .15s ease, transform .12s ease, box-shadow .15s ease;
  }
  .vbtn:hover { background: rgba(60,52,40,0.07); color: var(--ink); transform: translateY(-1px); }
  .vbtn:active { transform: translateY(0) scale(0.97); }
  .vbtn.active { background: var(--ink); color: #f5f1e8; box-shadow: 0 4px 12px rgba(28,26,23,0.3); }
  .sep { width: 1px; background: var(--line); margin: 4px 3px; }

  /* ───── מציג-מצב (כותרת-סיור) ───── */
  #viewTitle {
    position: fixed; top: 74px; inset-inline-start: 50%; transform: translateX(50%);
    z-index: 24; padding: 7px 18px; font-size: 13.5px; font-weight: 800; color: var(--ink);
    opacity: 0; transition: opacity .5s ease; pointer-events: none;
  }
  #viewTitle.show { opacity: 1; }

  /* ───── טיקר ───── */
  #ticker {
    position: fixed; bottom: 64px; inset-inline-start: 14px; z-index: 22;
    width: min(330px, calc(100vw - 28px)); padding: 10px 14px; font-size: 12px; line-height: 1.65;
    pointer-events: none; transition: opacity .4s;
  }
  #ticker .h { font-weight: 800; color: var(--ink-2); font-size: 10.5px; letter-spacing: .4px; margin-bottom: 3px; display: flex; justify-content: space-between; }
  #tickerLine { color: var(--ink); transition: opacity .35s; font-weight: 600; }
  #ticker .sub { color: var(--ink-2); font-weight: 500; font-size: 11px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ───── כרטיס-סוכן ───── */
  #card {
    position: fixed; top: 74px; inset-inline-end: 292px; z-index: 26;
    width: 246px; padding: 14px 16px; display: none;
  }
  #card.show { display: block; }
  #card .hd { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  #card .hd .avatar { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 17px; }
  #card .hd b { font-size: 15px; display: block; }
  #card .hd span { font-size: 11.5px; color: var(--ink-2); }
  #card .row { font-size: 12px; line-height: 1.7; color: var(--ink-2); }
  #card .row b { color: var(--ink); font-weight: 700; }
  #card .close { position: absolute; top: 8px; inset-inline-start: 8px; }

  /* ───── כשל-כנה ───── */
  #fail {
    position: fixed; inset: 0; z-index: 55; display: none;
    place-items: center; background: #221d17; color: #f2ead8; text-align: center; padding: 24px;
  }
  #fail.show { display: grid; }
  #fail h2 { font-size: 18px; margin-bottom: 10px; }
  #fail p { color: #cbbfa8; font-size: 13px; line-height: 1.7; max-width: 430px; margin-bottom: 18px; }
  #fail button {
    font-family: inherit; font-weight: 800; font-size: 14px; color: #221d17;
    background: #f2c368; border: 0; border-radius: 12px; padding: 10px 22px; cursor: pointer;
  }

  /* ───── מובייל ───── */
  #rosterToggle { display: none; }
  @media (max-width: 900px) {
    #roster { display: none; }
    #roster.open { display: flex; position: fixed; inset-inline: 10px; top: auto; bottom: 66px; width: auto; max-height: 46dvh; z-index: 40; }
    #rosterToggle { display: grid; }
    #card { inset-inline: 10px; top: auto; bottom: 66px; width: auto; z-index: 41; }
    #chips .chip.hideSm { display: none; }
    #ticker { bottom: 64px; width: min(300px, calc(100vw - 20px)); }
    #viewTitle { display: none; }
    #topbar { top: 8px; inset-inline: 8px; }
    #brand { padding: 6px 10px; gap: 8px; }
    #brand .mark { width: 28px; height: 28px; font-size: 15px; border-radius: 8px; }
    #brand .t b { font-size: 13px; }
    #brand .t span { display: none; }
    #chips { padding: 5px 8px; gap: 5px; }
    #chipPulse, #chipMode { max-width: 46vw; overflow: hidden; }
    #chipPulse span, #chipMode span { overflow: hidden; text-overflow: ellipsis; }
    #deck { bottom: 8px; }
    #deckInner {
      flex-wrap: nowrap; overflow-x: auto; max-width: calc(100vw - 16px);
      scrollbar-width: none; -webkit-overflow-scrolling: touch;
    }
    #deckInner::-webkit-scrollbar { display: none; }
    .vbtn { font-size: 11.5px; padding: 6px 10px; flex: none; }
    .sep { display: none; }
  }
</style>
</head>
<body>
  <div id="stage"></div>
  <div id="vignette" aria-hidden="true"></div>
  <div id="bubbles"></div>

  <div id="loader">
    <div class="flame">🔥</div>
    <h1>מפקדת הצי — המשרד החי</h1>
    <p>מרכיבים את האולם, מדליקים את להבת-הריבונות ומעירים את הצוות.<br />הכול ניזון מהגיט האמיתי — ואם אין חיבור, נאמר זאת במפורש.</p>
    <div id="bar"><i></i></div>
    <div id="loadState">מתחבר לספרי-הצי…</div>
  </div>

  <div id="fail">
    <div>
      <h2>המשרד לא הצליח לקום</h2>
      <p id="failMsg">כשל רינדור נרשם ביומן הדפדפן. לא נראה לך קנבס שחור בלי הסבר — זה חוק.</p>
      <button onclick="location.reload()">נסה שוב</button>
    </div>
  </div>

  <header id="topbar">
    <div id="brand" class="glass">
      <div class="mark">🔥</div>
      <div class="t">
        <b>מפקדת הצי</b>
        <span>המשרד התלת-מימדי החי · ריבונות אוטונומית</span>
      </div>
    </div>
    <div id="chips" class="glass">
      <span class="chip" id="chipPulse"><i class="dot"></i><span id="pulseTxt">מתחבר…</span></span>
      <span class="chip hideSm" id="chipMode"><i class="dot"></i><span id="modeTxt">—</span></span>
      <span class="chip hideSm" id="clock">--:--</span>
      <button class="iconbtn" id="rosterToggle" title="הצוות" aria-label="הצוות">👥</button>
    </div>
  </header>

  <aside id="roster" class="glass">
    <header><b>הצוות החי</b><span id="rosterMode"></span></header>
    <div id="rosterList"></div>
  </aside>

  <div id="card" class="glass">
    <button class="iconbtn close" id="cardClose" title="סגור" aria-label="סגור">✕</button>
    <div class="hd">
      <div class="avatar" id="cardAvatar">?</div>
      <div><b id="cardName">—</b><span id="cardRole">—</span></div>
    </div>
    <div class="row" id="cardBody"></div>
  </div>

  <div id="viewTitle" class="glass"></div>

  <div id="ticker" class="glass">
    <div class="h"><span>הפיד של המשרד</span><span id="tickMode"></span></div>
    <div id="tickerLine">ממתין לאירוע ראשון…</div>
    <div class="sub" id="tickerSub"></div>
  </div>

  <nav id="deck"><div id="deckInner" class="glass"></div></nav>

  <script type="importmap">
  {
    "imports": {
      "three": "./assets/three.module.min.js"
    }
  }
  </script>
  <script src="./assets/socket.io.min.js"></script>
  <script type="module" src="./src/main.js"></script>
</body>
</html>
