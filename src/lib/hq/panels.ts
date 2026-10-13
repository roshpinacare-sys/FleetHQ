/**
 * panels.ts — מצב-הפאנלים של החדר (זוסטנד מקומי). [T22]
 * ---------------------------------------------------------------------------
 * החדר התלת-ממדי הוא לא ויטרינה: כל-תחנה שנלחצת פותחת את הפאנל האמיתי שלה —
 * דוכן-ההחלטות → פנקס-הכרעות · הקבלה → פקיד-המבקרים · שולחן-סוכן → תיק-מומחה ·
 * לוח-המשימות / קיר-הגיט / הספרייה → הפאנלים האמיתיים של הנתונים החיים.
 * Esc סוגר. פאנל-אחד בכל-רגע — פשוט וממושמע.
 */
'use client';

import { create } from 'zustand';

export type RoomPanel =
  | null
  | { kind: 'decisions' }
  | { kind: 'clerk' }
  | { kind: 'expert'; agentId: string }
  | { kind: 'wall' }
  | { kind: 'git' }
  | { kind: 'library' };

interface PanelsState {
  panel: RoomPanel;
  open(p: RoomPanel): void;
  close(): void;
}

export const useRoomPanels = create<PanelsState>((set) => ({
  panel: null,
  open: (panel) => set({ panel }),
  close: () => set({ panel: null }),
}));
