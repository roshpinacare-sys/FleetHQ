export type Lang = 'he' | 'en';

export const T = {
  title: { he: 'מפקדת הצי', en: 'Fleet HQ' },
  subtitle: { he: 'חדר הפעולה של הסוכנים — בזמן אמת', en: 'The agents’ operations room — live' },
  live: { he: 'חי', en: 'LIVE' },
  connecting: { he: 'מתחבר…', en: 'Connecting…' },
  offline: { he: 'מנותק', en: 'Offline' },
  liveCrew: { he: 'צוות חי · סוכני מודל אמיתיים', en: 'Live crew · real model agents' },
  demoCrew: { he: 'הדגמה · צוות מדומה', en: 'Demo · simulated crew' },
  demoNote: { he: 'במצב הדגמה כל הנתונים סינתטיים ומסומנים — ללא מידע פנימי', en: 'Demo mode: all data synthetic and labeled — no internal info' },
  goal: { he: 'יעד', en: 'Goal' },
  noGoal: { he: 'אין יעד פעיל — הקש יעד למטה', en: 'No active goal — type one below' },
  goalPlanning: { he: 'ראש-המטה מתכנן…', en: 'Chief of staff is planning…' },
  goalActive: { he: 'הצוות עובד', en: 'Crew working' },
  goalReview: { he: 'ביקורת סופית', en: 'Final review' },
  goalDone: { he: 'היעד הושלם', en: 'Goal complete' },
  goalFailed: { he: 'היעד נכשל — נסה שוב', en: 'Goal failed — try again' },
  opsDone: { he: 'פעולות שהושלמו', en: 'Operations done' },
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
  stateWaitingUser: { he: 'מחכה למפקד', en: 'Waiting for you' },
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
  noTasks: { he: 'הלוח ריק — הגש יעד וראש-המטה יתכנן', en: 'The wall is empty — submit a goal and the chief will plan' },
  needsYou: { he: 'דרושה החלטה שלך', en: 'Your decision is needed' },
  noDecisions: { he: 'אין החלטות פתוחות', en: 'No open decisions' },
  answer: { he: 'ענה', en: 'Answer' },
  answered: { he: 'נענה', en: 'Answered' },
  freeText: { he: 'תשובה חופשית (רשות)', en: 'Free-text answer (optional)' },
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
  consolePlaceholder: { he: 'הקש יעד לצוות והקש Enter…', en: 'Type a goal for the crew and press Enter…' },
  submitGoal: { he: 'הגש יעד', en: 'Submit goal' },
  suggestions: { he: 'פעולות מוכנות', en: 'Ready operations' },
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
} as const;

export type TKey = keyof typeof T;

export function t(key: TKey, lang: Lang): string {
  return T[key][lang];
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

export const SUGGESTIONS: Record<Lang, string[]> = {
  he: [
    'סרוק את ספרי הצי ודווח מה ישן',
    'צלב בין ספר הדקס לפנקס הביצועים ודווח על פערים',
    'בדוק את ספרי הביקורת של הצי ומה נמצא בהם',
    'מה מצב אוטובוס התיאום ורישום הסוכנים',
  ],
  en: [
    'Scan the fleet books and report what is stale',
    'Cross-check the DEX book against the fills ledger and report gaps',
    'Inspect the fleet audit books and report findings',
    'What is the state of the coordination bus and agent registry',
  ],
};
