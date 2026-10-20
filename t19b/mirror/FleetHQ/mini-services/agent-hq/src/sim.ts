import type { Office } from './office';
import { LEAD, WORKERS, crewOf } from './cast';
import { excerptBook, crossCheckBooks } from './books';

// Sim backend — the DEMO team. It performs the same primitives (real file reads, real cross
// checks) but against the bundled demo-data/ books, and every beat is scripted instead of
// model-driven. The UI labels this mode loudly: "DEMO — SIMULATED CREW".
export async function runSimScenario(office: Office, goalText: string): Promise<void> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  office.goal = {
    id: office.id('g'),
    text: goalText,
    status: 'planning',
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  office.emit('goal', office.goal);
  office.feedPush('user', goalText);
  office.feedPush('system', 'DEMO — צוות מדומה מבצע תרחיש הדגמה (לא סוכני מודל אמיתיים)');

  const setState = office.setState.bind(office);

  // 1) lead plans (scripted plan over demo books)
  setState(LEAD, 'walking', 'הולך ללוח המשימות', 'wall');
  await sleep(800);
  setState(LEAD, 'thinking', 'מתכנן (דמו)…', 'wall');
  office.log(LEAD, 'text', `demo plan: ${goalText}`);
  await sleep(900);
  const t1 = office.addTask({ title: 'קריאת ספר הדקס הדמו', description: 'לקרוא את demo dex-book ולסכם את מצב השוק', assignee: 'gal', createdBy: LEAD });
  const t2 = office.addTask({ title: 'ביקורת טענות דמו', description: 'לבדוק את demo claims-audit ולדווח ממצאים', assignee: 'erez', createdBy: LEAD });
  const t3 = office.addTask({ title: 'סיכום מדדי הצי הדמו', description: 'לסכם את demo fleet-indicators לדוח קצר', assignee: 'shachar', dependsOn: [t1.id], createdBy: LEAD });
  office.goal = { ...office.goal, status: 'active', progress: 0.05, updatedAt: Date.now() };
  office.emit('goal', office.goal);
  office.bubble(LEAD, 'תוכנית הדגמה על הלוח — שלוש משימות.');

  // 2) gal reads demo dex-book for real (real file, demo content)
  setState('gal', 'walking', 'הולך לשולחן', 'desk', t1.id);
  await sleep(700);
  setState('gal', 'reading', 'קורא demo dex-book', 'desk', t1.id);
  office.log('gal', 'tool', 'read_book(dex-book)');
  await sleep(800);
  const dex = excerptBook('dex-book', 900) ?? '(demo book missing)';
  office.log('gal', 'result', String(dex).replace(/\s+/g, ' ').slice(0, 380));
  setState('gal', 'thinking', 'מנתח (דמו)…', 'desk', t1.id);
  await sleep(800);
  office.bubble('gal', 'הספר הדמו קריא — יש לי תמונת שוק.');
  office.patchTask(t1.id, { status: 'review', summary: 'דמו: ספר הדקס נקרא וסוכם מתוך הקובץ בפועל' });
  setState('gal', 'idle', '', 'desk');
  await sleep(400);

  // 3) erez audits demo claims + asks a real decision (still demo)
  setState('erez', 'walking', 'הולך לשולחן', 'desk', t2.id);
  await sleep(700);
  setState('erez', 'reading', 'קורא demo claims-audit', 'desk', t2.id);
  office.log('erez', 'tool', 'read_book(claims-audit)');
  await sleep(750);
  office.log('erez', 'result', String(excerptBook('claims-audit', 600) ?? '').replace(/\s+/g, ' ').slice(0, 300));
  office.log('erez', 'tool', 'cross_check(claims-audit, dex-book)');
  await sleep(700);
  const cc = crossCheckBooks('claims-audit', 'dex-book');
  office.log('erez', 'result', cc ? cc.notes.join(' · ') : 'demo books missing');
  const dec = office.askHuman('erez', 'דמו: לאשר את ממצאי הביקורת לפרסום בספרייה?', ['לאשר פרסום', 'דרוש עידון'], 'זוהי הדגמה של שאלת החלטה — התשובה שלך ממשיכה את התרחיש.', t2.id);
  // wait up to 45s for the demo answer, then auto-approve so the scenario always completes
  const t0 = Date.now();
  while (dec.status === 'open' && Date.now() - t0 < 45000) await sleep(500);
  if (dec.status === 'open') {
    office.answerDecision(dec.id, 'לאשר פרסום', '(תשובת ברירת מחדל בהדגמה)');
  }
  const approved = dec.answer?.option !== 'דרוש עידון';
  setState('erez', 'writing', 'כותב דוח ביקורת (דמו)', 'desk', t2.id);
  office.log('erez', 'tool', `write_report(${approved ? 'ממצאי ביקורת דמו (מאושר)' : 'ממצאי ביקורת דמו (מועדון)'})`);
  await sleep(750);
  office.addReport({
    title: approved ? 'ממצאי ביקורת דמו — מאושר לספרייה' : 'ממצאי ביקורת דמו — מועדון לעידון',
    body: 'דוח הדגמה: נכתב מתוך הספרים הדמו שנקראו בפועל בתרחיש זה. אין כאן נתוני צי אמיתיים.',
    author: 'erez',
  });
  office.patchTask(t2.id, { status: 'review', summary: 'דמו: ביקורת בוצעה על ספרי הדמו' });
  setState('erez', 'idle', '', 'desk');

  // 4) shachar summarizes indicators
  setState('shachar', 'walking', 'הולך לשולחן', 'desk', t3.id);
  await sleep(700);
  setState('shachar', 'reading', 'קורא demo fleet-indicators', 'desk', t3.id);
  office.log('shachar', 'tool', 'read_book(fleet-indicators)');
  await sleep(750);
  office.log('shachar', 'result', String(excerptBook('fleet-indicators', 600) ?? '').replace(/\s+/g, ' ').slice(0, 300));
  setState('shachar', 'writing', 'כותב סיכום (דמו)', 'desk', t3.id);
  await sleep(750);
  office.addReport({
    title: 'סיכום מדדי הצי — הדגמה',
    body: 'דוח הדגמה שנכתב מתוך ספר מדדי הדמו. כל המספרים סינתטיים ומסומנים בבירור.',
    author: 'shachar',
  });
  office.patchTask(t3.id, { status: 'review', summary: 'דמו: מדדים סוכמו' });
  setState('shachar', 'idle', '', 'desk');

  // 5) lead reviews + closes
  setState(LEAD, 'checking', 'בודק את המשימות (דמו)', 'wall');
  await sleep(1100);
  for (const t of [t1, t2, t3]) office.patchTask(t.id, { status: 'done' });
  office.log(LEAD, 'result', 'demo tasks approved');
  setState(LEAD, 'writing', 'כותב סיכום מבצע (דמו)', 'library');
  await sleep(900);
  office.addReport({
    title: 'סיכום מבצע — הדגמה של מפקדת הצי',
    body: 'תרחיש הדגמה שהושלם על ידי הצוות המדומה. במצב החי, הצוות הוא סוכני מודל אמיתיים שקוראים את ספרי הצי האמיתיים.',
    author: LEAD,
  });
  office.goal = { ...office.goal!, status: 'done', progress: 1, updatedAt: Date.now() };
  office.emit('goal', office.goal);
  office.bubble(LEAD, 'הדגמה הושלמה — הסיכום בספרייה.');
  setState(LEAD, 'done', 'הדגמה הושלמה', 'library');
  await sleep(3500);
  setState(LEAD, 'idle', '', 'wall');
  office.feedPush('system', 'DEMO — התרחיש המדומה הסתיים');
  void WORKERS; void crewOf; // keep imports honest
}
