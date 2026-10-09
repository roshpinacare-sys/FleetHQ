export type Lang = 'he' | 'en';

export const T = {
  title: { he: 'מפקדת הצי', en: 'Fleet HQ' },
  subtitle: { he: 'חדר הפעולה של הסוכנים — בזמן אמת', en: 'The agents’ operations room — live' },
  secOffice: { he: 'רצפת הפעולה', en: 'Operations floor' },
  secJournal: { he: 'יומן הפעולות', en: 'Operations journal' },
  secCrew: { he: 'הצוות', en: 'The crew' },
  atWork: { he: 'בעבודה עכשיו', en: 'working now' },
  live: { he: 'חי', en: 'LIVE' },
  connecting: { he: 'מתחבר…', en: 'Connecting…' },
  offline: { he: 'מנותק', en: 'Offline' },
  liveCrew: { he: 'צוות חי · סוכני מודל אמיתיים', en: 'Live crew · real model agents' },
  demoCrew: { he: 'הדגמה · צוות מדומה', en: 'Demo · simulated crew' },
  demoNote: { he: 'במצב הדגמה כל הנתונים סינתטיים ומסומנים — ללא מידע פנימי', en: 'Demo mode: all data synthetic and labeled — no internal info' },
  goal: { he: 'יעד', en: 'Goal' },
  noGoal: { he: 'אין יעד פעיל — המפעיל האוטונומי מזרים יעדים בעצמו', en: 'No active goal — the autonomous operator schedules work itself' },
  goalPlanning: { he: 'ראש-המטה מתכנן…', en: 'Chief of staff is planning…' },
  goalActive: { he: 'הצוות עובד', en: 'Crew working' },
  goalReview: { he: 'ביקורת סופית', en: 'Final review' },
  goalDone: { he: 'היעד הושלם', en: 'Goal complete' },
  goalFailed: { he: 'היעד נכשל — נסה שוב', en: 'Goal failed — try again' },
  opsDone: { he: 'פעולות שהושלמו', en: 'Operations done' },
  // optional foreman status extras (rendered only when the wire carries them)
  statusCredits: { he: 'קרדיטים', en: 'credits' },
  statusShifts: { he: 'משמרות', en: 'shifts' },
  statusLessons: { he: 'לקחים', en: 'lessons' },
  monitor: { he: 'מסך-בקרה', en: 'Monitor' },
  wall: { he: 'לוח משימות', en: 'Task wall' },
  podium: { he: 'שלט ההחלטות', en: 'Decision podium' },
  library: { he: 'ספרייה', en: 'Library' },
  fleet: { he: 'רישום הצי', en: 'Fleet registry' },
  selectAgent: { he: 'בחר סוכן במשרד כדי לראות את המסך שלו', en: 'Pick an agent in the office to open their monitor' },
  state: { he: 'מצב', en: 'State' },
  station: { he: 'עמדה', en: 'Station' },
  stationDesk: { he: 'שולחן עבודה', en: 'Desk' },
  stationWall: { he: 'לוח המשימות', en: 'Task wall' },
  stationPodium: { he: 'שלט ההחלטות', en: 'Podium' },
  stationLibrary: { he: 'הספרייה', en: 'Library' },
  stationOffstage: { he: 'מחוץ לחדר', en: 'Offstage' },
  stateIdle: { he: 'פנוי', en: 'Idle' },
  stateThinking: { he: 'חושב', en: 'Thinking' },
  stateReading: { he: 'קורא ספר', en: 'Reading a book' },
  stateChecking: { he: 'מצליב נתונים', en: 'Cross-checking' },
  stateWriting: { he: 'כותב דוח', en: 'Writing a report' },
  stateWalking: { he: 'הולך', en: 'Walking' },
  stateWaitingUser: { he: 'ממתין להכרעה אוטונומית', en: 'Awaiting autonomous resolution' },
  stateBlocked: { he: 'חסום', en: 'Blocked' },
  stateDone: { he: 'סיים', en: 'Done' },
  stateError: { he: 'תקלה', en: 'Error' },
  taskTodo: { he: 'מתוכנן', en: 'Planned' },
  taskDoing: { he: 'בעבודה', en: 'In work' },
  taskReview: { he: 'לביקורת', en: 'In review' },
  taskDone: { he: 'הושלם', en: 'Done' },
  taskBlocked: { he: 'חסום', en: 'Blocked' },
  taskCancelled: { he: 'בוטל', en: 'Cancelled' },
  assignee: { he: 'מבצע', en: 'Assignee' },
  dependsOn: { he: 'תלוי ב', en: 'Depends on' },
  summary: { he: 'סיכום', en: 'Summary' },
  noTasks: { he: 'הלוח ריק — המפעיל האוטונומי יתכנן את הסיור הבא', en: 'The wall is empty — the autonomous operator will plan the next patrol' },
  needsYou: { he: 'המפעיל האוטונומי מכריע', en: 'The autonomous operator is deciding' },
  noDecisions: { he: 'אין הכרעות פתוחות', en: 'No open decisions' },
  podiumAutonomous: {
    he: 'שקיפות מלאה: כל שאלה של סוכן מוכרעת אוטונומית על ידי מערכת ההפעלה — למבקרים אין שליטה על הצוות, בכוונה.',
    en: 'Full transparency: every agent question is resolved autonomously by the operating system — visitors hold no control over the crew, by design.',
  },
  resolved: { he: 'הוכרע אוטונומית', en: 'Resolved autonomously' },
  deciding: { he: 'ההכרעה מתבשלת אצל המפעיל האוטונומי…', en: 'The autonomous operator is deliberating…' },
  send: { he: 'שלח', en: 'Send' },
  noReports: { he: 'הספרייה ריק — דוחות אמיתיים שהצוות יכתוב יופיעו כאן', en: 'Library empty — real reports the crew writes will land here' },
  reports: { he: 'דוחות', en: 'Reports' },
  by: { he: 'מאת', en: 'by' },
  books: { he: 'ספרים', en: 'Books' },
  freshness: { he: 'טריות', en: 'Freshness' },
  bytes: { he: 'בתים', en: 'Bytes' },
  owner: { he: 'אחראי', en: 'Owner' },
  category: { he: 'קטגוריה', en: 'Category' },
  noBooks: { he: 'אין ספרים טעונים', en: 'No books loaded' },
  preview: { he: 'תצוגת ספר', en: 'Book preview' },
  close: { he: 'סגור', en: 'Close' },
  feed: { he: 'יומן המפקדה', en: 'HQ journal' },
  emptyFeed: { he: 'היומן יתמלא כשהצוות יתחיל לפעול', en: 'The journal fills as the crew acts' },
  footerTruth: {
    he: 'כל מה שאתה רואה מופעל מספרי הצי האמיתיים ומסוכני מודל אמיתיים · במצב הדגמה הנתונים סינתטיים בלבד',
    en: 'Everything here is driven by the fleet’s real books and real model agents · demo mode uses synthetic data only',
  },
  agents: { he: 'סוכנים', en: 'Agents' },
  desk: { he: 'שולחן', en: 'Desk' },
  taskWallLabel: { he: 'לוח המשימות', en: 'TASK WALL' },
  libraryLabel: { he: 'ספריית המפקדה', en: 'HQ LIBRARY' },
  podiumLabel: { he: 'שלט ההחלטות', en: 'DECISIONS' },
  registryLabel: { he: 'רישום הצי', en: 'FLEET REGISTRY' },
  monitors: { he: 'מסכים חיים', en: 'LIVE MONITORS' },
  jerusalem: { he: 'ירושלים', en: 'Jerusalem' },
  clear: { he: 'נקה בחירה', en: 'Clear selection' },
  unassigned: { he: 'לא שובץ', en: 'Unassigned' },
  // ---- git wire (the real commit stream) ----
  gitWire: { he: 'חוט הגיט', en: 'Git wire' },
  gitWireLabel: { he: 'חוט הגיט · פעילות אמיתית', en: 'GIT WIRE · REAL ACTIVITY' },
  commits: { he: 'קומיטים', en: 'commits' },
  gitLive: { he: 'כל קומיט כאן הוא דבר שקרה במציאות — עם זמן וחותמת', en: 'Every commit here really happened — timestamped and verifiable' },
  gitOpen: { he: 'פתח את הריפו הציבורי', en: 'Open the public repo' },
  gitUnavailable: { he: 'חוט הגיט לא זמין בסביבה זו', en: 'Git wire unavailable in this environment' },
  newestCommit: { he: 'קומיט חדש נחת!', en: 'New commit landed!' },
  gitPrivacy: { he: 'מטא-דאטה בלבד — לעולם לא תכני קבצים', en: 'Metadata only — never file contents' },
  patrolBadge: { he: 'סיור שגרה · מתוזמן', en: 'Routine patrol · scheduled' },
  commanderBadge: { he: 'יעד מפקד', en: 'Commander goal' },
  minutesAgo: { he: 'לפני דק׳', en: 'min ago' },
  hoursAgo: { he: 'לפני שע׳', en: 'h ago' },
  now: { he: 'עכשיו', en: 'now' },
  // ---- the office receptionist (the chat IS a worker in the room) ----
  repName: { he: 'עמית', en: 'Amit' },
  repRole: { he: 'נציג המשרד', en: 'Office representative' },
  repStatus: { he: 'בקבלה · זמין עכשיו', en: 'At the front desk · available' },
  repInvite: { he: 'שאלו אותי', en: 'Ask me' },
  repInChat: { he: 'בשיחה', en: 'In conversation' },
  repHint: { he: 'לחץ על עמית לשיחה', en: 'Click Amit to chat' },
  repTitle: { he: 'עמית · נציג המשרד', en: 'Amit · Office representative' },
  repSubtitle: { he: 'עונה על שאלות על הפלטפורמה — ורק עליהן', en: 'Answers questions about the platform — only about it' },
  repScope: {
    he: 'עמית מוגבל בכוונה: ידע ציבורי על הפלטפורמה בלבד · ללא גישה למערכות פנימיות, קבצים או נתוני צי',
    en: 'Amit is intentionally limited: public platform knowledge only · no access to internal systems, files or fleet data',
  },
  repGreeting: {
    he: 'שלום, אני עמית — הנציג של מפקדת הצי בקבלה. אני כאן כדי להסביר מה קורה בחדר הזה: מי הסוכנים שיושבים מולך, מה המסכים על הקיר, איך קוראים את חוט הגיט ואיך מבינים מה הצוות עושה עכשיו. רוצה סיור מודרך? פשוט שאל.',
    en: 'Hi, I’m Amit — the Fleet HQ front-desk representative. I’m here to explain what happens in this room: who the agents at their desks are, what the wall screens mean, how to read the git wire, and what the crew is doing right now. Want a guided tour? Just ask.',
  },
  repPlaceholder: { he: 'שאלו את עמית…', en: 'Ask Amit…' },
  repRate: { he: 'הרבה שאלות בקצב גבוה — חכו רגע ונמשיך.', en: 'Lots of questions, fast — give it a moment and we’ll continue.' },
  repError: { he: 'עמית לא זמין כרגע — נסו שוב עוד רגע.', en: 'Amit is unavailable right now — try again shortly.' },
  repSuggestions: {
    he: ['מה קורה כרגע במפקדה?', 'מי הסוכנים ומה כל אחד עושה?', 'איך קוראים את חוט הגיט?', 'מה זה ספר צי ולמה זה חשוב?'],
    en: ['What is happening right now at the HQ?', 'Who are the agents and what does each do?', 'How do I read the git wire?', 'What is a fleet book and why does it matter?'],
  },
  repDisclaimer: {
    he: 'עמית עונה מתיאור קבוע של הפלטפורמה וממונים ציבוריים בלבד — לא מנתונים פנימיים',
    en: 'Amit answers from a fixed platform description and public counters only — never from internal data',
  },
  // ---- the network atlas (the self-developing map of the sovereign domains) ----
  atlasTitle: { he: 'מפת הרשת · הטריטוריות הריבוניות', en: 'NETWORK ATLAS · SOVEREIGN TERRITORIES' },
  atlasOffice: { he: 'המשרד', en: 'Office' },
  atlasNetwork: { he: 'הרשת', en: 'Network' },
  atlasViewHint: {
    he: 'מודל-על של הטופולוגיה האמיתית — כל מחוז הוא ספר אמיתי, צבעו הוא טריותו הנמדדת. קליק על מחוז פותח את הספר ברישום',
    en: 'A topology model of the real system — every district is a real book, its color is measured freshness. Click a district to open it in the registry',
  },
  atlasHq: { he: 'מפקדת הצי', en: 'FLEET HQ' },
  atlasTerritory: { he: 'שטח נפתח', en: 'territory open' },
  atlasLive: { he: 'חי', en: 'LIVE' },
  atlasOpen: { he: 'פתוח', en: 'OPEN' },
  atlasSealed: { he: 'אטום', en: 'SEALED' },
  atlasEmpty: {
    he: 'הרשת נבנית — ברגע שהספרים ייטענו המחוזות ייפתחו אחד אחרי השני',
    en: 'The network is forming — once the books load, districts open one by one',
  },
  atlasHours: { he: 'שע׳ מאז פעימה', en: 'h since heartbeat' },
  // ---- the office economy (honest readout of the atlas) ----
  econTitle: { he: 'כלכלת המפקדה', en: 'HQ ECONOMY' },
  econProd: { he: 'ייצור · משימות שהושלמו', en: 'production · ops done' },
  econCirc: { he: 'מחזור · קומיטים אמיתיים', en: 'circulation · real commits' },
  econKnow: { he: 'ידע · דוחות בספרייה', en: 'knowledge · library reports' },
  econReserve: { he: 'רזרבות · ספרים טריים', en: 'reserves · fresh books' },
  econArea: { he: 'שטח ריבוני פתוח', en: 'sovereign territory open' },
  econNote: {
    he: 'כל מדד נגזר ישירות מהפעילות האמיתית — אין המצאות',
    en: 'every index is derived directly from real activity — nothing invented',
  },
  // ---- Ops Slate shell (Task 43) ----
  viewOps: { he: 'תפעול', en: 'Operations' },
  opsSubtitle: { he: 'מפקדת הצי · מערכת הפעלה אוטונומית', en: 'Fleet HQ · autonomous operations' },
  secTasks: { he: 'לוח המשימות', en: 'Task board' },
  secGit: { he: 'ראיות גיט', en: 'Git evidence' },
  secDecisions: { he: 'הכרעות', en: 'Decisions' },
  secReports: { he: 'דוחות אחרונים', en: 'Latest reports' },
  secCrewRail: { he: 'הצוות', en: 'Crew' },
  alertBlocked: { he: 'משימה חסומה', en: 'blocked task' },
  alertBlockedPlural: { he: 'משימות חסומות', en: 'blocked tasks' },
  alertOpenDecisions: { he: 'הכרעות פתוחות', en: 'open decisions' },
  alertErrors: { he: 'שגיאות ביומן', en: 'errors in journal' },
  alertAttention: { he: 'דורש תשומת לב', en: 'needs attention' },
  stripSystem: { he: 'מערכת', en: 'System' },
  stripLive: { he: 'חי', en: 'live' },
  stripSim: { he: 'הדגמה', en: 'demo' },
  stripOffline: { he: 'מנותק', en: 'offline' },
  stripConnecting: { he: 'מתחבר', en: 'connecting' },
  stripCrew: { he: 'סוכנים', en: 'agents' },
  stripWorking: { he: 'בעבודה', en: 'working' },
  stripTasks: { he: 'משימות פתוחות', en: 'open tasks' },
  stripBooks: { he: 'ספרי צי', en: 'fleet books' },
  stripReports: { he: 'דוחות', en: 'reports' },
  stripCommits: { he: 'קומיטים', en: 'commits' },
  stripOps: { he: 'פעולות שהושלמו', en: 'ops completed' },
  stripLlm: { he: 'ספק מודל', en: 'model provider' },
  goalCard: { he: 'היעד הנוכחי', en: 'Current goal' },
  goalNone: { he: 'אין יעד פעיל — המפעיל האוטונומי מזרים יעדים בעצמו', en: 'No active goal — the autonomous operator schedules work itself' },
  goalProgress: { he: 'התקדמות', en: 'progress' },
  goalTasksDone: { he: 'משימות שהושלמו', en: 'tasks completed' },
  currentTask: { he: 'משימה נוכחית', en: 'Current task' },
  noCurrentTask: { he: 'אין משימה משויכת', en: 'No assigned task' },
  recentActivity: { he: 'פעילות אחרונה', en: 'Recent activity' },
  logEmpty: { he: 'אין רישומים עדיין', en: 'No log entries yet' },
  filterAll: { he: 'הכול', en: 'All' },
  filterWorking: { he: 'בעבודה', en: 'Work' },
  filterDone: { he: 'הושלמו', en: 'Done' },
  filterIssues: { he: 'תקלות', en: 'Issues' },
  openLibrary: { he: 'פתח את הספרייה המלאה', en: 'Open the full library' },
  showAllCommits: { he: 'כל הקומיטים בריפו הציבורי', en: 'all commits on the public repo' },
  branchLabel: { he: 'ענף', en: 'branch' },
  tasksEmpty: { he: 'הלוח ריק — המפעיל האוטונומי מתכנן את הסבב הבא', en: 'Board is empty — the autonomous operator is planning the next round' },
  waitingFirstSnapshot: { he: 'ממתין לנתונים ראשוניים מהמשרד…', en: 'Waiting for the first snapshot from the office…' },
  // ---- freshness truth (Task 44) ----
  stripStale: { he: 'זרימה שקטה — הנתונים עלולים להיות קפואים', en: 'Stream quiet — data may be frozen' },
  lastUpdate: { he: 'עדכון אחרון', en: 'last update' },
  stateSince: { he: 'במצב זה מאז', en: 'in this state since' },
  goToTask: { he: 'למשימה', en: 'open task' },
  gitWireCap: { he: '40 הקומיטים האחרונים', en: 'last 40 commits' },
  socketDown: { he: 'החיבור למשרד נפל — מנסה להתחבר מחדש', en: 'Connection to the office dropped — reconnecting' },
  officeViewHint: { he: 'החדר החי — לחיצה על דמות פותחת את המסך שלה', en: 'The live room — click a figure to open their monitor' },
  autonomyLine: {
    he: 'המערכת אוטונומית לחלוטין: היעדים מתוזמנים ומוכרעים על ידי מערכת ההפעלה. שאלות — אצל עמית בקבלה.',
    en: 'Fully autonomous: goals are scheduled and decided by the operating system. Questions — ask Amit at reception.',
  },
} as const;

export type TKey = keyof typeof T;

export function t(key: TKey, lang: Lang): string {
  return T[key][lang] as string;
}

export function stationName(s: string, lang: Lang): string {
  switch (s) {
    case 'desk': return t('stationDesk', lang);
    case 'wall': return t('stationWall', lang);
    case 'podium': return t('stationPodium', lang);
    case 'library': return t('stationLibrary', lang);
    default: return t('stationOffstage', lang);
  }
}

export function stateName(s: string, lang: Lang): string {
  const map: Record<string, TKey> = {
    idle: 'stateIdle', thinking: 'stateThinking', reading: 'stateReading', checking: 'stateChecking',
    writing: 'stateWriting', walking: 'stateWalking', waiting_user: 'stateWaitingUser',
    blocked: 'stateBlocked', done: 'stateDone', error: 'stateError',
  };
  return t(map[s] ?? 'stateIdle', lang);
}

export function taskStatusName(s: string, lang: Lang): string {
  const map: Record<string, TKey> = {
    todo: 'taskTodo', doing: 'taskDoing', review: 'taskReview', done: 'taskDone',
    blocked: 'taskBlocked', cancelled: 'taskCancelled',
  };
  return t(map[s] ?? 'taskTodo', lang);
}

export function goalStatusName(s: string, lang: Lang): string {
  switch (s) {
    case 'planning': return t('goalPlanning', lang);
    case 'active': return t('goalActive', lang);
    case 'review': return t('goalReview', lang);
    case 'done': return t('goalDone', lang);
    default: return t('goalFailed', lang);
  }
}
