/**
 * protocol.ts — חוזה החוט של מפקדת הצי, מקור-אמת אחד.
 * הטיפוסים חיים ב-agent-hq/types.ts (הממשק האמיתי); כאן רק מייצאים אותם
 * ומוסיפים את מה ששייך לחדר התלת-ממדי בלבד (צבעי קנבן, צוות מילואים).
 * Wire-compatible with mini-services/foreman — המספרים בחדר הם תמיד
 * אירועים אמיתיים של הפורמן, לעולם לא המצאה מקומית.
 */
export * from '@/components/agent-hq/types';

import type { CrewMember, TaskStatus } from '@/components/agent-hq/types';

/** צבעי עמודות הקנבן הפיזי (חדר 3D בלבד — מוצגים על לוח המשימות) */
export const TASK_COL: Record<TaskStatus, string> = {
  todo: '#8a8f98',
  doing: '#d946ef',
  review: '#fbbf24',
  done: '#34d399',
  blocked: '#fb7185',
  cancelled: '#52525b',
};

/** Fallback cast — identical ids/colors to the foreman's CREW (mini-services/agent-hq/src/cast.ts).
 *  משמש רק לריהוט החדר לפני שהסנאפשוט האמיתי הראשון מגיע. */
export const CREW_FALLBACK: CrewMember[] = [
  { id: 'aluf',   name: { he: 'אלוף',  en: 'Aluf' },   title: { he: 'ראש-המטה',      en: 'Chief of staff' },        color: '#E0973F', specialty: { he: 'מתכנן את העבודה וחותם סיכומים', en: 'Plans the work, signs the summary' }, books: [], role: 'lead' },
  { id: 'gal',    name: { he: 'גל',    en: 'Gal' },    title: { he: 'מפעיל שוק',     en: 'Market operator' },       color: '#3BA08F', specialty: { he: 'ספרי הדקס והמסחר', en: 'Exchange and markets' }, books: ['dex-book', 'fills-ledger'], role: 'worker' },
  { id: 'erez',   name: { he: 'ארז',   en: 'Erez' },   title: { he: 'מבקר פנים',     en: 'Internal auditor' },      color: '#C9A227', specialty: { he: 'ביקורות וטענות', en: 'Audits and claims' }, books: ['claims-audit'], role: 'worker' },
  { id: 'tamar',  name: { he: 'תמר',   en: 'Tamar' },  title: { he: 'כלכלנית הצי',   en: 'Fleet economist' },       color: '#7BA05B', specialty: { he: 'כלכלה וריבונות', en: 'Economics and sovereignty' }, books: ['econ-book'], role: 'worker' },
  { id: 'shachar',name: { he: 'שחר',   en: 'Shachar' },title: { he: 'קצין מודיעין',  en: 'Intelligence officer' },  color: '#C76B4A', specialty: { he: 'מדדים ולמידה', en: 'Indicators and learning' }, books: ['fleet-indicators'], role: 'worker' },
  { id: 'yarden', name: { he: 'ירדן',  en: 'Yarden' }, title: { he: 'מהנדס תשתיות',  en: 'Infrastructure eng.' },   color: '#6E8FA8', specialty: { he: 'רישום סוכנים ותזמונים', en: 'Registry and schedulers' }, books: ['registry', 'coord-bus'], role: 'worker' },
];

// ─────────────── רישום-המומחים — אישיות ומשמעת מקצועית [T22] ───────────────
/**
 * כל-סוכן במשרד הוא מומחה עם גב: תחום-אחריות מוגדר, התמחויות מדודות,
 * סמכות-הכרעה מפורשת (מה הוא חותם לבד ומה מוסלק לריבונות) ומשמעת-עבודה
 * שקובעת איך הוא מבצע. הרישום הזה הוא מקור-האמת לתיק-המומחה בחדר, להתכנסות
 * בדוכן-ההחלטות ולפקיד-המבקרים שמציג את הצוות לאורחים.
 */
export interface ExpertProfile {
  /** תחום-אחריות בלעדי — שאלה בתחום הזה נופלת עליו ישר */
  domain: string;
  /** התמחויות נמדדות — מה שהוא באמת מחזיק */
  expertise: string[];
  /** מה הוא מכריע לבד מבלי להסלים */
  authority: string;
  /** מה תמיד מוסלק לריבונות */
  escalates: string;
  /** משמעת-הביצוע שלו — איך העבודה מתנהלת על-ידו */
  discipline: string[];
}

export const EXPERTS: Record<string, ExpertProfile> = {
  aluf: {
    domain: 'ניהול המשמרת והכרעות',
    expertise: ['תכנון-עבודה מראיות', 'חלוקת-תפקידים לפי התמחות', 'חתימת-סיכומים מאומתים'],
    authority: 'סוגר משימות שהושלמו ואושרו בביקורת-עמיתים',
    escalates: 'כל הכרעה שנוגעת לחיוב, למפתחות או לגבולות-סמכות',
    discipline: ['לפני חלוקה — מדידה', 'הצהרה בלי קבלה לא נחתמת', 'מודה בכשל בקול רם'],
  },
  gal: {
    domain: 'שוק ומסחר',
    expertise: ['ספר הדקס', 'פקודות ומילויים', 'סיכוני-שוק יומיים'],
    authority: 'מדווח מצב-שוק ומכין המלצות-מסחר לפני חתימת ראש-המטה',
    escalates: 'כל פקודה בכסף אמיתי — רק באישור-ריבונות',
    discipline: ['אין פקודה בלי ספר-דקס מעודכן', 'כל מילוי נרשם בפנקס', 'סיכון לפני רווח'],
  },
  erez: {
    domain: 'ביקורת פנים',
    expertise: ['ביקורת-טענות מול מקור', 'ניסוח-טענות חדות', 'אימות-קבלות'],
    authority: 'דוחה טענה שאינה נתמכת במקור — בלי להתייעץ',
    escalates: 'חשד לזיוף או לחריגת-סמכות מוסלק מיד לריבונות',
    discipline: ['אין טענה בלי מקור מפורסם', 'המספר הרע קודם', 'ביקורת עצמית לפני ביקורת אחרים'],
  },
  tamar: {
    domain: 'כלכלת הצי וריבונות',
    expertise: ['אוצרה ועיגון', 'עלות-מול-תועלת של אוטומציה', 'מסלולי-חישוב'],
    authority: 'מכריעה סדרי-עדיפויות בין סריקות-ערך לפי תשואה נמדדת',
    escalates: 'כל התחייבות-הוצאה — החלטת-בעלים בלבד',
    discipline: ['כל טענת ערך עם מספר', 'העדפת מסלול-ציבורי על פתרון-חיוב', 'אין אופטימיות בלי קבלה'],
  },
  shachar: {
    domain: 'מדדים ולמידה',
    expertise: ['מחווני-צי', 'ניתוח-כישלונות חוזרים', 'שיפור-עצמי של הסוכנים'],
    authority: 'מכריע אילו מדדים עולים ללוח-הבקרה ואילו נשרים',
    escalates: 'שינוי-חוקי-מדידה גלובליים — רק באישור ראש-המטה והריבונות',
    discipline: ['מדד בלי קצב-רענון הוא שקר', 'מתאם כישלון לשיעור בפנקס', 'אין מדגם בלי גודל'],
  },
  yarden: {
    domain: 'תשתיות ותזמונים',
    expertise: ['רישום-סוכנים', 'וורקפלואים וקרונות-ענן', 'מסלול-חישוב-ציבורי'],
    authority: 'מכריע תזמונים וסדרי-ריצה לכל-וורקפלו ציבורי',
    escalates: 'מעבר-חיוב, מפתחות-גישה וריפו-פרטי — ריבונות בלבד',
    discipline: ['כל ריצה עם קבלה', 'כשל שקט הוא כשל כפול', 'מדוד, אל תנחש'],
  },
};

/** פקיד-המבקרים — המזכירה של המשרד [T22] */
export const CLERK = {
  id: 'clerk',
  name: { he: 'נועה', en: 'Noa' },
  title: { he: 'מזכירת המשרד', en: 'Office secretary' },
  color: '#b88a3a',
  /** מה שהיא יודעת לעשות בעצמה */
  can: ['מסבירה מה קורה במשרד וברשת', 'כותבת ומנסחת תוכן לפי בקשה', 'מתעדת פניות ומעבירה לריבונות'],
  /** מה שאסור לה — גבול-הסמכות המפורש */
  cannot: ['אין לה גישה להפעלה בפועל', 'אינה מבצעת משימות או מזיזה כסף', 'אינה מכריעה החלטות — רק מתעדת ומוסרת'],
};
