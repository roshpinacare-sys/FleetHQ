# worlds/ — עולמות-הריבונות [T13]

מרחב-שמות עצמאי ואדיטיבי-בלבד — **אפס-שינויים בקבצים קיימים** (שיתוף-בטוח עם
office-3D-v2 של הסוכן-המקביל). המקור-החי והמאומת: Sandbox דף-3000.

| רכיב | תפקיד | מקור-אמת |
|---|---|---|
| `NetworkWorld` | האורגניזם כמפת-זרימה חיה (צמתים=עורקים, קווים=זרימות) | `Sandbox:ops/flow/flow-map.json` (F-series, צריכה-בלבד) + lighthouse |
| `BusinessWorld` | אולם-האוצרה + **ביקורת-אמת חיה** (מפורסם מול מדידת-שרשרת ישירה) | beacon + api.steemit.com + `Domain:dex/grid.json` |
| `ParallelWorld` | גן-הנפש: מטאפורות-פסיכולוגיות **של מדידות** (המדידה מוצגת לצד המטאפורה) | FleetHQ office-state |
| `RecruitmentBoard` | הלולאה: מה-הפוטנציאל/מה-פתוח/מה-נותן-ערך + גיוס מראיות | value-scan.yml + office-state + flow-map |
| `WorldShell` | קנבס מותאם-מובייל + תוויות-ספרייט עברית (CanvasTexture — בלי פורטלים) | — |

## חיווט (נבדק ב-Sandbox)

```tsx
import { WorldDeck } from '@/components/worlds/WorldDeck';
// <main><WorldDeck /></main> — לשוניות: משרד|רשת|עסקים|מקביל|גיוס·ערך
```
WorldDeck מייבא `@/components/hq/RoomRoot` (קיים) ומציג אותו בלשונית-המשרד.
ה-API: `/api/worlds-state` (העתק מ-Sandbox `src/app/api/worlds-state/route.ts`).

## חוקי-אמת (זהים ל-Sandbox)

- אפס-זיופים: כל מספר = מדידה פומבית; מקור-שנפל = דגל-כנה, לעולם לא מילוי.
- ביקורת-אמת: העולם-העסקי משווה בכל-רגע את המפורסם (משואה) מול השרשרת —
  סטייה >1 SP → שלט-אמבר; התאמה → אישור-שקט.
- תוויות = CanvasTexture ספרייט (עברית shaping מלא, בלי drei-Html — מנוע-באג
  unmount-sync בזמן-רינדור).

---
*T13 · אפס-דריסות · אפס-זיופים · הכל-חי.*
