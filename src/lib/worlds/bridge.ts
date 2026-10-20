/**
 * worlds/bridge.ts — גשר-האמת של העולמות (צד-לקוח). [T13]
 * סקר נמוך-תדיר (60 שניות ברירת-מחדל) של /api/worlds-state.
 * אין מצב-מדומה: אין תשובה → אין נתונים, והעולמות כותבים זאת בכנות.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import type { WorldsPayload } from './types';

export interface WorldsBridge {
  data: WorldsPayload | null;
  ageSec: number | null;
  error: string | null;
  refresh: () => void;
}

export function useWorldsState(pollMs = 60_000): WorldsBridge {
  const [data, setData] = useState<WorldsPayload | null>(null);
  const [ageSec, setAge] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const fetching = useRef(false);

  const load = async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const res = await fetch('/api/worlds-state', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as WorldsPayload;
      if (mounted.current) {
        setData(json);
        setAge(0);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      fetching.current = false;
    }
  };

  useEffect(() => {
    mounted.current = true;
    void load();
    const poll = setInterval(() => void load(), pollMs);
    const tick = setInterval(() => {
      if (mounted.current) setAge((a) => (a === null ? null : a + 1));
    }, 1000);
    return () => {
      mounted.current = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [pollMs]);

  return { data, ageSec, error, refresh: () => void load() };
}

/** טקסט-גיל כנה בעברית */
export function ageHe(sec: number | null): string {
  if (sec === null) return 'לא ידוע';
  if (sec < 90) return `לפני ${sec} שנ'`;
  const m = Math.round(sec / 60);
  if (m < 90) return `לפני ${m} דק'`;
  const h = Math.round(m / 60);
  return `לפני ${h} שע'`;
}
