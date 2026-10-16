import type { CrewMember } from './types';

// The crew of the Fleet HQ (מפקדת הצי). Original cast for this project:
// a lead of staff plus five operators, each owning real books of the real fleet.
export const CREW: CrewMember[] = [
  {
    id: 'aluf',
    name: { he: 'אלוף', en: 'Aluf' },
    title: { he: 'ראש-המטה', en: 'Chief of staff' },
    color: '#E0973F',
    specialty: { he: 'מתכנן את העבודה, מחלק משימות וחותם סיכומים', en: 'Plans the work, splits tasks, signs the summary' },
    books: [],
    role: 'lead',
  },
  {
    id: 'gal',
    name: { he: 'גל', en: 'Gal' },
    title: { he: 'מפעיל שוק', en: 'Market operator' },
    color: '#3BA08F',
    specialty: { he: 'ספרי הדקס, המסחר וההגיון הפנימי', en: 'Exchange, fills and internal markets' },
    books: ['dex-book', 'fills-ledger', 'market-grid', 'truth-history'],
    role: 'worker',
  },
  {
    id: 'erez',
    name: { he: 'ארז', en: 'Erez' },
    title: { he: 'מבקר פנים', en: 'Internal auditor' },
    color: '#C9A227',
    specialty: { he: 'ביקורות, טענות וחוזי יכולת', en: 'Audits, claims and capability contracts' },
    books: ['claims-audit', 'workflow-audit', 'harness-audit', 'capability-matrix', 'deep-audit'],
    role: 'worker',
  },
  {
    id: 'tamar',
    name: { he: 'תמר', en: 'Tamar' },
    title: { he: 'כלכלנית הצי', en: 'Fleet economist' },
    color: '#7BA05B',
    specialty: { he: 'כלכלה, ריבונות וספרי הון', en: 'Economics, sovereignty and capital books' },
    books: ['econ-book', 'sovereign-state', 'fleet-roster', 'sovereign-policy'],
    role: 'worker',
  },
  {
    id: 'shachar',
    name: { he: 'שחר', en: 'Shachar' },
    title: { he: 'קצין מודיעין', en: 'Intelligence officer' },
    color: '#C76B4A',
    specialty: { he: 'מדדים, מפקד ולמידה של הצי', en: 'Indicators, census and fleet learning' },
    books: ['fleet-indicators', 'fleet-census', 'pulse-book', 'learning-summary'],
    role: 'worker',
  },
  {
    id: 'yarden',
    name: { he: 'ירדן', en: 'Yarden' },
    title: { he: 'מהנדס תשתיות', en: 'Infrastructure engineer' },
    color: '#6E8FA8',
    specialty: { he: 'רישום הסוכנים, תזמונים ואוטובוס התיאום', en: 'Agent registry, schedulers and the coord bus' },
    books: ['registry', 'coord-bus', 'status', 'mirror', 'scheduler-audit'],
    role: 'worker',
  },
];

export const LEAD = 'aluf';
export const WORKERS = CREW.filter((c) => c.role === 'worker').map((c) => c.id);

export function crewOf(id: string): CrewMember | undefined {
  return CREW.find((c) => c.id === id);
}
