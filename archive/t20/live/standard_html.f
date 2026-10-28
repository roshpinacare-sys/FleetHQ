<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>SAOS · תקן-ההפעלה · הרשת שמריצה את עצמה בגלוי</title>
<meta name="description" content="תקן-ההפעלה של SAOS: מה נמדד, באיזו תדירות, מה נחשב כשל, מי מטפל ותוך כמה זמן. לולאה אוטונומית חיה על דקות-CI ציבוריות, פסק-דין חתום, ספר-פקודות פתוח, והשוואה כנה לאופן שבו גופי-ענק מריצים מערכות מאחורי הקלעים.">
<meta name="theme-color" content="#09090b">
<link rel="canonical" href="https://roshpinacare-sys.github.io/Domain/standard.html">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SAOS Network">
<meta property="og:title" content="SAOS · תקן-ההפעלה">
<meta property="og:locale" content="he_IL">
<meta property="og:description" content="הלולאה שמריצה את הרשת בלי אף אחד בחדר: מדידה, פסק-דין, תור, ריפוי, אימות-חוזר — כולה על קבלות חיות.">
<meta property="og:url" content="https://roshpinacare-sys.github.io/Domain/standard.html">
<meta property="og:image" content="https://roshpinacare-sys.github.io/Domain/assets/og-cover.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8' fill='none' stroke='%2310b981' stroke-width='1.8' stroke-linecap='round'/%3E%3Ccircle cx='12' cy='12' r='3' fill='none' stroke='%2310b981' stroke-width='1.8'/%3E%3C/svg%3E">
<style>
:root{ --bg:#f5f3f1; --bg2:#efedea; --panel:#ffffff; --panel2:#fafaf9; --line:#e6e2dd; --line2:#d6d0c9; --acc:#0d9d6d; --acc-bright:#0b8a60; --acc-bg:rgba(13,157,109,.07); --acc-line:rgba(13,157,109,.30); --green:#0d9d6d; --red:#c2410c; --amber:#a16207; --text:#1d1d1f; --dim:#57534e; --faint:#8a8580; --mono:ui-monospace,'SF Mono','Cascadia Code',Consolas,Menlo,monospace; --sans:-apple-system,'Segoe UI',Roboto,'Helvetica Neue','Noto Sans Hebrew',Arial,sans-serif; --r:14px; --r-sm:10px; }
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column}
main{position:relative;z-index:1;flex:1;width:100%}
a{color:var(--acc-bright);text-decoration:none}
a:hover{text-decoration:underline}
a:focus-visible,button:focus-visible{outline:2px solid var(--acc);outline-offset:2px;border-radius:8px}
.mono{font-family:var(--mono);direction:ltr;unicode-bidi:embed}
.num{font-variant-numeric:tabular-nums}
.wrap{max-width:1120px;margin:0 auto;padding:0 18px}
@media(min-width:760px){.wrap{padding:0 24px}}

header.site{position:sticky;top:0;z-index:50;background:rgba(245,243,241,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.hd{height:58px;display:flex;align-items:center;gap:12px}
.logo{width:34px;height:34px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:var(--r-sm);border:1px solid var(--acc-line);background:var(--acc-bg);color:var(--acc-bright)}
.logo svg{width:18px;height:18px}
.brand{font-weight:700;font-size:15px;letter-spacing:-.2px;white-space:nowrap}
.brand small{display:block;font-weight:500;font-size:10.5px;color:var(--faint);letter-spacing:.4px}
nav.top{margin-inline-start:auto;display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}
nav.top::-webkit-scrollbar{display:none}
nav.top a{flex:none;font-size:13px;color:var(--dim);padding:7px 11px;border-radius:999px;border:1px solid transparent}
nav.top a:hover{color:var(--text);text-decoration:none;border-color:var(--line2);background:var(--panel)}
nav.top a[aria-current=page]{color:var(--acc-bright);border-color:var(--acc-line);background:var(--acc-bg);font-weight:600}

.hero{padding:46px 0 26px}
.kicker{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--acc-bright);border:1px solid var(--acc-line);background:var(--acc-bg);border-radius:999px;padding:6px 13px;font-weight:600}
.dot{width:7px;height:7px;border-radius:50%;background:var(--acc);box-shadow:0 0 8px var(--acc);animation:pulse 2.4s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
h1{font-size:clamp(30px,6.4vw,52px);line-height:1.08;letter-spacing:-.8px;margin:18px 0 12px;font-weight:800}
h1 .en{color:var(--acc-bright)}
.lede{font-size:clamp(15px,2.4vw,18px);line-height:1.75;color:var(--dim);max-width:66ch}
h2.sec{font-size:clamp(21px,3.6vw,30px);letter-spacing:-.4px;font-weight:800;margin-bottom:6px}
.sub{color:var(--dim);font-size:14.5px;line-height:1.7;margin-bottom:22px}
section{padding:34px 0}
.law{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;font-size:12px;color:var(--faint)}
.law span{border:1px solid var(--line);border-radius:999px;padding:4px 11px}

.grid3{display:grid;grid-template-columns:1fr;gap:14px}
@media(min-width:700px){.grid3{grid-template-columns:repeat(3,1fr)}}
.grid5{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(min-width:900px){.grid5{grid-template-columns:repeat(5,1fr)}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:18px;display:flex;flex-direction:column;gap:8px}
.card .stage{font-size:11px;font-weight:700;letter-spacing:.6px;color:var(--acc-bright)}
.card h3{font-size:15.5px;font-weight:700;letter-spacing:-.2px}
.card p{font-size:13px;color:var(--dim);line-height:1.7}
.card .metric{font-size:26px;font-weight:800;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.card .metric small{font-size:12px;font-weight:600;color:var(--faint);letter-spacing:0}
.card footer{margin-top:auto;padding-top:8px;border-top:1px dashed var(--line);font-size:11px;color:var(--faint);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.ok{color:var(--green)} .warn{color:var(--amber)} .bad{color:var(--red)}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;border-radius:999px;padding:3px 11px;border:1px solid}
.pill.ok{color:var(--green);border-color:rgba(13,157,109,.35);background:var(--acc-bg)}
.pill.warn{color:var(--amber);border-color:rgba(161,98,7,.35);background:rgba(161,98,7,.07)}
.pill.bad{color:var(--red);border-color:rgba(194,65,12,.35);background:rgba(194,65,12,.07)}

.tbl{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;font-size:13.5px}
.tblwrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:var(--r)}
.tbl th{background:var(--panel2);text-align:right;font-size:11.5px;letter-spacing:.5px;color:var(--faint);font-weight:700;padding:11px 14px;border-bottom:1px solid var(--line)}
.tbl td{padding:13px 14px;border-bottom:1px solid var(--line);vertical-align:top;line-height:1.65;color:var(--dim)}
.tbl tr:last-child td{border-bottom:0}
.tbl td b{color:var(--text)}
.tbl .q{color:var(--amber)}

.wo{display:flex;flex-direction:column;gap:10px}
.woitem{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-sm);padding:14px 16px;display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}
.woitem .pid{flex:none;font-size:11px;font-weight:800;border:1px solid var(--line2);border-radius:8px;padding:3px 9px;color:var(--dim)}
.woitem .pid.p1{color:var(--red);border-color:rgba(194,65,12,.4)}
.woitem .pid.p2{color:var(--amber);border-color:rgba(161,98,7,.4)}
.woitem .body{flex:1;min-width:220px}
.woitem .body b{display:block;font-size:14px;margin-bottom:3px}
.woitem .body span{font-size:12.5px;color:var(--dim);line-height:1.6}

footer.site{margin-top:auto;background:var(--panel);border-top:1px solid var(--line);padding:22px 0 28px;font-size:12.5px;color:var(--faint);line-height:1.8}
footer.site .frow{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)}
.skip{position:absolute;right:-9999px}
.skip:focus{position:fixed;right:12px;top:12px;background:var(--panel);padding:8px 14px;border-radius:8px;z-index:99}
</style>
</head>
<body>
<a class="skip" href="#main">דילוג לתוכן</a>
<header class="site">
  <div class="wrap hd">
    <span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/><circle cx="12" cy="12" r="3"/></svg></span>
    <div class="brand">SAOS Network<small>הרשת המאמתת לסוכני AI</small></div>
    <nav class="top" aria-label="ניווט ראשי">
      <a href="index.html">מפקדה</a>
      <a href="standard.html" aria-current="page">תקן-ההפעלה</a>
      <a href="#products">המוצרים</a>
      <a href="versus.html">מול הרשתות</a>
      <a href="giants.html">שולחן-הענקים</a>
      <a href="reports.html">דוחות</a>
      <a href="verify/">אמת-בעצמך</a>
      <a href="sitemap.html">מפת-האתר</a>
    </nav>
  </div>
</header>

<main id="main">
<section class="hero">
  <div class="wrap">
    <span class="kicker"><span class="dot" aria-hidden="true"></span> תקן-ההפעלה · THE OPERATING STANDARD</span>
    <h1>הרשת מריצה את עצמה.<br>התקן אומר איך. <span class="en">הקבלות מוכיחות שזה קורה.</span></h1>
    <p class="lede">לכל גוף רציני יש תקן הפעלה: מה נמדד, באיזו תדירות, מה נחשב כשל, מי מטפל ותוך כמה זמן. התקן הזה אינו מסמך שנועד להרשים — הוא מערכת שרצה ב-CI ציבורי, מודדת את עצמה במרווחים קבועים, מפרסמת פסק-דין חתום, ומזרימה כל כשל לספר-פקודות פתוח. כל מספר בעמוד זה נשאב בזמן אמת מקובץ-קבלה שנכתב בריצה אוטומטית, עם חותמת-זמן גלויה. אין נתון — ייכתב שאין נתון.</p>
    <div class="law">
      <span>משפט 1 · אין לוקחים במלים — מאמתים בקבצים</span>
      <span>משפט 2 · כל טענה נזקקת לקבלה</span>
      <span>משפט 3 · כישל מפורסם עדיף על הצלחה שסומנה כחול</span>
      <span>משפט 4 · התור הוא הרשות השיפוטית</span>
    </div>
  </div>
</section>

<section id="loop" aria-labelledby="loop-h">
  <div class="wrap">
    <h2 class="sec" id="loop-h">הלולאה הסוברנית</h2>
    <p class="sub">חמישה שלבים, כולם אוטומטיים, כולם בגלוי. הלולאה אינה דעה על איך כדאי לתחזק רשת — היא נמצאת בריצה עכשיו, וכל שלב נצבע לפי הקובץ החי שלו.</p>
    <div class="grid5" style="margin-bottom:14px">
      <div class="card">
        <span class="stage">01 · מדידה</span>
        <h3>סורק-האתר החי</h3>
        <p class="metric num"><span id="m-pages">—</span><small> עמודים</small></p>
        <p><span id="m-links">—</span> קישורים נבדקו מול האוויר. קישור-מת הוא כשל, גם אם התוכן תקין.</p>
        <footer><span>קבלה: <a class="mono" href="agents/site-audit.json">site-audit.json</a></span><span id="age-siteaudit">—</span></footer>
      </div>
      <div class="card">
        <span class="stage">02 · פסק-דין</span>
        <h3>שומר-השלמות</h3>
        <p class="metric"><span id="m-integrity" class="pill ok">—</span></p>
        <p><span id="m-verified">—</span> מקורות אומתו מול כללי-היסוד. פסק שקט למעלה מ-SLA מצריך הצתה-מחדש אוטומטית.</p>
        <footer><span>קבלה: <a class="mono" href="agents/integrity-verdict.json">integrity-verdict.json</a></span><span id="age-integrity">—</span></footer>
      </div>
      <div class="card">
        <span class="stage">03 · תור</span>
        <h3>ספר-הפקודות</h3>
        <p class="metric num"><span id="m-wo">—</span><small> פקודות פתוחות</small></p>
        <p>כל כשל שנמדד נרשם כפקודה עם עדיפות ונימוק. התור פתוח לציבור, והוא הסמכות היחידה לסדר-העדיפויות.</p>
        <footer><span>קבלה: <a class="mono" href="agents/work-orders.json">work-orders.json</a></span><span id="age-wo">—</span></footer>
      </div>
      <div class="card">
        <span class="stage">04 · ריפוי</span>
        <h3>שומר-הגריד</h3>
        <p class="metric"><span id="m-office" class="pill ok">—</span></p>
        <p>זרם שחורג מה-SLA שלו מוצת מחדש אוטומטית. הלב הענני רץ במרווחים קבועים על דקות-CI ציבוריות, בלי מפתח.</p>
        <footer><span>קבלה: <a class="mono" href="agents/office-live.json">office-live.json</a></span><span id="age-office">—</span></footer>
      </div>
      <div class="card">
        <span class="stage">05 · אימות-חוזר</span>
        <h3>סגירת-הלולאה</h3>
        <p class="metric"><span id="m-closed" class="pill ok">פתוח</span></p>
        <p>אחרי ריפוי נכתב פסק חדש, והוא עצמו נבדק. לולאה שלא נסגרת נרשמת ככשל, לא כרקע.</p>
        <footer><span>חוק-גיל: 24h</span><span id="m-closednote">ריצה מתמדת</span></footer>
      </div>
    </div>
    <div class="law">
      <span id="lawverdict">טוען פסק…</span>
      <span>כל קבלה: קובץ JSON ציבורי · ניתן להורדה ולהשוואה</span>
      <span>כשל-רך: העמוד מציג אין-נתון במקום להמציא</span>
    </div>
  </div>
</section>

<section id="giants" aria-labelledby="g-h" style="background:var(--bg2);border-block:1px solid var(--line)">
  <div class="wrap">
    <h2 class="sec" id="g-h">כך מריצים גופי-ענק מערכות — ואיפה אנחנו עומדים</h2>
    <p class="sub">השוואה כנה, שורה אחר שורה, בין מה שמפעיל את התשתיות של הגופים הגדולים מאחורי הקלעים לבין מה שרץ כאן. שתי עמודות מדודות ועמודה אחת של תור. מה שעדיין חסר יישאר חשוף — כי טענה בלי קבלה היא בדיוק הדבר שהרשת הזאת נבנתה להילחם בו.</p>
    <div class="tblwrap">
    <table class="tbl">
      <thead><tr><th>דיסציפלינה</th><th>איך זה עובד אצל הענקים</th><th>מה רץ כאן</th><th>מה עוד בתור</th></tr></thead>
      <tbody>
        <tr>
          <td><b>יעדי-שירות</b> · SLO ותקציב-שגיאה</td>
          <td>כל זרם מוגדר עם יעד-זמינות ותקציב-שגיאה שמותר לשרוף; חריגה קוטעת פיתוח חדש לטובת יציבות.</td>
          <td><b>חוקי-גיל קשיח לכל זרם</b>: פסק-שלמות עד 4 שעות, סריקת-אתר עד 26 שעות, דופקי-הזנות לפי מכסה. חריגה מציתה ריצה מחדש בלי התערבות.</td>
          <td class="q">מדידת-זמינות מצופה חוץ (probe חיצוני עצמאי)</td>
        </tr>
        <tr>
          <td><b>תצפיתיות</b> · observability</td>
          <td>מטריקות, לוגים ועקבות נאספים מכל רכיב; לוח מודעות מציג מצב בזמן אמת ולא תחושות.</td>
          <td><b>מאה ומעלה ספרים-חיים מחויבים-דחיפה</b> ב-<span class="mono">agents/</span>, לוח-חי בקונסולה עם פקודת-דופק שמדפיסה את כל הזרמים, ופסק-דין שקול נגד כללי-יסוד.</td>
          <td class="q">ערוץ-התראה חוץ-רשתי · עקבות משורשרות בין-זרמים</td>
        </tr>
        <tr>
          <td><b>ניהול-תקריות</b> · incident lifecycle</td>
          <td>תקרית נפתחת, מנוהלת, מקבלת תחקיר ציבורי בלי אשמה, והלקח נהפך לבדיקה אוטומטית.</td>
          <td><b>ספר-פקודות פתוח</b> עם עדיפויות ונימוקים + שומר-גריד שמריץ ריפוי אוטומטי. כשל מדוד נרשם ומפורסם במקום להיות מוסתר.</td>
          <td class="q">תחקירים ציבוריים מובנים · בדיקות-רגרסיה נגררות-אוטומטית מתקריות</td>
        </tr>
        <tr>
          <td><b>שערי-הפצה</b> · release gates</td>
          <td>שינוי עובר חומה של בדיקות לפני דחיפה; עמידה בכל השערים היא תנאי-מיזוג.</td>
          <td><b>ארבעה שערים ירוקים</b>: הידור 0 · lint 0 · מארז-בדיקות מלא · אפס-סודות בסריקה. שער אדום = אין דחיפה.</td>
          <td class="q">שער-סקירת-תוכן אוטומטי (סריקת-סגנון נגד ניסוח-מכונה)</td>
        </tr>
        <tr>
          <td><b>כישלון-כפול</b> · redundancy</td>
          <td>אין נקודת-כישל יחידה; כל רכיב קריטי מוכפל במיקום נפרד.</td>
          <td><b>תאום-תאומים</b>: המשטח הציבורי והספרים נשמרים בשני ריפואים עצמאיים; פסק-צמד מאמת התאמה 1:1 בכל פעימה.</td>
          <td class="q">עותק-צד-שלישי מחוץ לגיטהאב (עיגון-גיבוי)</td>
        </tr>
        <tr>
          <td><b>הפרדת-רשויות</b> · control plane</td>
          <td>מישור-הפקודה נפרד ממישור-הביצוע; שינויי-תצורה עוברים סקירה ולא עורך ידני.</td>
          <td><b>מפיקים, משטח, ספרים ופסקים</b> בנתיבים נפרדים; כל דחיפת-תוכן עוברת שומר-תוכן וכל פסק נכתב בידי ריצה, לא ביד אדם.</td>
          <td class="q">ממשל-שינוי מסודר לזהויות הצי (סבב-מפתחות)</td>
        </tr>
        <tr>
          <td><b>הפעלה נטולת-תלות</b> · sovereignty</td>
          <td>התשתית לא תלויה בשום מחשב עובד ספציפי; היא שורדת יציאה של כל אדם.</td>
          <td><b>אפס-תלות בסביבת-פיתוח</b>: הלולאה כולה על דקות-CI ציבוריות חינמיות, חסרת-מפתח, עם הצתה-עצמית. התלות שנותרה מתועדת בגלוי בספר-הפקודות.</td>
          <td class="q">רץ-מארח-עצמו על מכשיר רשת (הוראה מוכנה · החלטה בתור)</td>
        </tr>
      </tbody>
    </table>
    </div>
    <div class="law">
      <span>העמודה השלישית אינה תירוץ — היא תור</span>
      <span>כל שורה שנסגרת נמדדת ונכנסת לפסק-דין הבא</span>
      <span><a href="hub/OPS-DOCTRINE.html">הדוקטרינה המלאה</a> · <a href="versus.html">השוואה כלכלית מול הרשתות</a> · <a href="giants.html">ליגת-החזית הכלכלית</a></span>
    </div>
  </div>
</section>

<section id="queue" aria-labelledby="q-h">
  <div class="wrap">
    <h2 class="sec" id="q-h">ספר-הפקודות · התור החי</h2>
    <p class="sub">הסמכות לסדר-העדיפויות היא התור, לא שום אדם. כל פקודה נכתבה על ידי ריצה שמדדה כשל, וכל פקודה שמומשה נמחקת מהספר רק אחרי אימות-חוזר.</p>
    <div class="wo" id="wolive">
      <div class="woitem"><div class="body"><b>טוען פקודות מהקובץ החי…</b><span><a class="mono" href="agents/work-orders.json">agents/work-orders.json</a></span></div></div>
    </div>
  </div>
</section>

<section id="products" aria-labelledby="p-h">
  <div class="wrap">
    <h2 class="sec" id="p-h">רשימת-המוצרים · כנות</h2>
    <p class="sub">מוצר ענק לא זה שאין לו גבולות — זה שהגבולות שלו כתובים אצלו. כל שורה מראה מה המוצר עושה, איך יודעים שהוא חי, ומה הוא לא עושה.</p>
    <div class="tblwrap">
    <table class="tbl">
      <thead><tr><th>מוצר</th><th>מה עושה</th><th>איך יודעים שהוא חי</th><th>מה הוא לא עושה · גבול כנה</th><th>ראיות</th></tr></thead>
      <tbody>
        <tr><td><b>SAOS-NET</b></td><td>מכונת-מצב ריבונית + נוטריון שמעגן כל טענה בשרשראות ציבוריות</td><td>גובה-שרשרת וקבלות חיות מול mainnet</td><td class="q">מספרי-הגיבור בעמודים הם תמונת-מדידה מתוארכת, לא חי</td><td><a href="receipts/index.html">קבלות</a></td></tr>
        <tr><td><b>שער-האמת</b></td><td>מכונה שמודדת את האתר הציבורי כל שעה — זמינות, קישורים, טריות, יעדי-שירות</td><td><a href="truth.html">פסק-דין חי</a> מ-truth/latest.json · ריצה אדומה נכשלת בפומבי</td><td class="q">תאומי-סביבת-פיתוח לא נמדדים כאן — מסומנים</td><td><a href="truth.html">truth.html</a></td></tr>
        <tr><td><b>grid-sentinel</b></td><td>מודד את כל הצי, מצית עורקים שקטים, מפרסם מטריצת-חיות</td><td><a href="status.json">status.json</a> מתרענן כל 17 דקות בריצה-עצמית</td><td class="q">ריפו פרטי-כמוס-מכסה מנוטר ולא מרופא עדיין</td><td><a href="GRID-STATUS.md">GRID-STATUS.md</a></td></tr>
        <tr><td><b>המשרד החי</b></td><td>משרד-סוכנים אמיתי — מנועים, קיר-משימות, ספריית דוקטרינה</td><td>פס-המשרד בדף הבית נמדד מהריפואים הציבוריים</td><td class="q">פסק-הדין תלוי-טריות קבלות, ומוצג כשהוא מזדקן</td><td><a href="office3d/index.html">office3d</a></td></tr>
        <tr><td><b>הארנק</b></td><td>נוכחות-שרשרת ויתרות חיות מול הציבורי</td><td>גששי-שרשרת חיים מהדפדפן</td><td class="q">תמיכת-שפה חלקית בחלקים</td><td><a href="wallet.html">wallet.html</a></td></tr>
        <tr><td><b>השוק</b></td><td>מבצעי-מסחר עם קו-אמת מפורסם, כולל ההפסד</td><td><a href="public/pulse.json">pulse.json</a> — trips, fills, realizedSbd שלילי מפורסם</td><td class="q">מצב READ-ONLY מוצהר</td><td><a href="market/he.html">market</a></td></tr>
        <tr><td><b>שולחן-הליגה</b></td><td>השוואה נמדדת מול ענקי-DeFi, keyless מפידים ציבוריים</td><td>feed חי מ-DefiLlama</td><td class="q">רק מה שהפיד נושא — שורה שלא נמצאה לא מומצאת</td><td><a href="giants.html">giants.html</a></td></tr>
        <tr><td><b>API הזהות</b></td><td>אימות-זהות מקצה-לקצה, מוכח מול בלוק 109,389,994</td><td>מדוד בפריסה הריבונית, מתועד בדף-ה-API</td><td class="q">npm publish ו-URL שער-ציבורי ממתינים לשתי החלטות-הוצאה בתור</td><td><a href="hub/api/identity-api.html">API ref</a></td></tr>
      </tbody>
    </table>
    </div>
  </div>
</section>

<section id="receipts" aria-labelledby="r-h" style="background:var(--bg2);border-block:1px solid var(--line)">
  <div class="wrap">
    <h2 class="sec" id="r-h">איך מאמתים את העמוד הזה</h2>
    <p class="sub">אין לקחת במלים — לא שלנו ולא של אחרים. ארבע קבלות, ארבע קישורים ישירים לקבצים החיים. הורידו, פתחו, השוו את חותמת-הזמן לשעון שלכם.</p>
    <div class="grid3">
      <div class="card"><h3>פסק-השלמות</h3><p>שבעה מקורות מול כללי-יסוד, נכתב בידי שומר-השלמות בכל פעימה.</p><footer><a class="mono" href="agents/integrity-verdict.json">agents/integrity-verdict.json</a></footer></div>
      <div class="card"><h3>פסק-האתר</h3><p>סריקת כל עמודי המשטח הציבורי וכל הקישורים שבהם, יומית.</p><footer><a class="mono" href="agents/site-audit.json">agents/site-audit.json</a></footer></div>
      <div class="card"><h3>מצב-הלב הענני</h3><p>מחזורי-העבודה, יומן-האירועים ומצב הצוות האוטונומי.</p><footer><a class="mono" href="agents/office-live.json">agents/office-live.json</a></footer></div>
      <div class="card"><h3>ספר-הפקודות</h3><p>התור הפתוח — מה נמדד ככשל, מה נעשה בו, מה עוד בתור.</p><footer><a class="mono" href="agents/work-orders.json">agents/work-orders.json</a></footer></div>
      <div class="card"><h3>הדוקטרינה</h3><p>הנייר המלא: חוקי-ההפעלה, חוקי-הסגנון, חוקי-החשיפה.</p><footer><a href="hub/OPS-DOCTRINE.html">hub/OPS-DOCTRINE.html</a></footer></div>
      <div class="card"><h3>אמת-בעצמך</h3><p>כלים ציבוריים לאימות-עצמאי של כל טענה ברשת.</p><footer><a href="verify/">verify/</a> · <a href="reports.html">reports.html</a></footer></div>
    </div>
  </div>
</section>
</main>

<footer class="site">
  <div class="wrap">
    כל מספר בעמוד זה נשאב מקובץ-קבלה ציבורי עם חותמת-זמן. חוק-הגיל: קבלה שגילה עובר 24 שעות תסומן כמזדקנת בגלוי, ולא תוצג כעדכנית. אין כאן הבטחת רווח ואין ייעוץ פיננסי; יש כאן תקן הפעלה שמודד את עצמו.
    <div class="frow">
      <span>refresh: בכל טעינה</span>
      <span>stale-law: &gt;24h = AGING</span>
      <span><a class="mono" href="agents/integrity-verdict.json">integrity-verdict</a></span>
      <span><a class="mono" href="agents/site-audit.json">site-audit</a></span>
      <span><a class="mono" href="agents/office-live.json">office-live</a></span>
      <span><a class="mono" href="agents/work-orders.json">work-orders</a></span>
      <span><a href="sitemap.html">מפת-האתר</a></span>
    </div>
  </div>
</footer>

<script>
(function(){
  'use strict';
  var $=function(id){return document.getElementById(id)};
  function fmt(t){ if(!t) return '—';
    var d=new Date(t); if(isNaN(d)) return '—';
    var mins=Math.round((Date.now()-d.getTime())/60000);
    if(mins<0) mins=0;
    if(mins<60) return mins+' דק׳';
    var h=Math.floor(mins/60); if(h<48) return h+' ש׳';
    return Math.floor(h/24)+' ימ׳'; }
  function ageCell(el,t){ if(!el) return; var txt=fmt(t);
    el.textContent=txt? 'לפני '+txt : '—';
    var d=t?new Date(t):null;
    if(!d||isNaN(d)) { el.className='warn'; return; }
    el.className=(Date.now()-d.getTime())>24*3600*1000 ? 'warn' : 'ok'; }
  function failSoft(id,note){ var el=$(id); if(!el) return; el.textContent=note||'אין נתון'; el.className='warn'; }

  function setPill(id,txt,ok){ var el=$(id); if(!el) return; el.textContent=txt; el.className='pill '+(ok?'ok':'bad'); }

  fetch('agents/site-audit.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){
    if(!d){failSoft('m-pages');failSoft('m-links');return}
    $('m-pages').textContent=d.pagesScanned!=null?d.pagesScanned:'—';
    $('m-links').textContent=(d.summary&&d.summary.checked!=null)?d.summary.checked:'—';
    var f=(d.summary&&d.summary.findings)||0;
    var age=fmt(d.at); $('age-siteaudit').textContent='לפני '+age; $('age-siteaudit').className=(f>0||new Date(d.at)<Date.now()-26*3600*1000)?'warn':'ok';
    var law=$('lawverdict');
    if(law&&f>0) { law.textContent='סריקה חיה: '+f+' כשלים באוויר — התור מטפל'; law.className=''; }
  }).catch(function(){failSoft('m-pages');failSoft('m-links')});

  fetch('agents/integrity-verdict.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){
    if(!d){failSoft('m-integrity','אין פסק');return}
    setPill('m-integrity',d.overall||'—',d.overall==='PASS');
    $('m-verified').textContent=(d.summary&&d.summary.verified!=null)?d.summary.verified:'—';
    ageCell($('age-integrity'),d.at);
    var law=$('lawverdict');
    if(law&&d.overall==='PASS'&&!law.textContent.match(/כשלים/)) law.textContent='פסק-השלמות החי: '+d.overall+' · '+(d.summary&&d.summary.verified)+' מקורות אומתו';
  }).catch(function(){failSoft('m-integrity','אין פסק')});

  fetch('agents/work-orders.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){
    if(!d){failSoft('m-wo');return}
    var open=(d.totals&&d.totals.open); if(open==null&&d.orders) open=d.orders.length;
    $('m-wo').textContent=open!=null?open:'—';
    ageCell($('age-wo'),d.at);
    var box=$('wolive'); if(!box||!d.orders||!d.orders.length) return;
    box.innerHTML='';
    d.orders.forEach(function(o){
      var div=document.createElement('div'); div.className='woitem';
      var p=document.createElement('span'); p.className='pid '+(o.priority==='P1'?'p1':o.priority==='P2'?'p2':''); p.textContent=o.priority||'—';
      var b=document.createElement('div'); b.className='body';
      var t=document.createElement('b'); t.textContent=o.title||o.id||'פקודה';
      var s=document.createElement('span'); s.textContent=(o.why||o.area? (o.area?o.area+' · ':'')+(o.why||'') : '');
      b.appendChild(t); if(s.textContent) b.appendChild(s);
      div.appendChild(p); div.appendChild(b); box.appendChild(div);
    });
  }).catch(function(){failSoft('m-wo')});

  fetch('agents/office-live.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){
    if(!d){failSoft('m-office','אין דופק');return}
    var alive=d.status==='ALIVE';
    setPill('m-office',alive?'רץ':'מושהה',alive);
    ageCell($('age-office'),d.generatedAt);
  }).catch(function(){failSoft('m-office','אין דופק')});
})();
</script>
</body>
</html>
