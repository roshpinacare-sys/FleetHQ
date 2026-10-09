/**
 * MiniMap.tsx — מפת קומה חיה (קנבס 2D): תחנות, צוות, שחקן.
 */
'use client';

import { useEffect, useRef } from 'react';
import { PLAN_W, PLAN_H, DESKS, FLAME, TASK_WALL, GIT_WALL, PODIUM, LIBRARY_TABLE, RECEPTION, LEAD_TABLE, COFFEE } from '@/lib/hq/contract';
import { useHq } from '@/lib/hq/store';
import { STATE_COLORS } from '@/lib/hq/protocol';
import { player } from './Player';

export function MiniMap() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const W = cv.width, H = cv.height;
    const sx = W / PLAN_W, sy = H / PLAN_H;
    let raf = 0;
    let last = 0;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 90) return;
      last = t;
      ctx.clearRect(0, 0, W, H);
      // רקע
      ctx.fillStyle = 'rgba(14,12,10,0.82)';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,196,110,0.35)';
      ctx.strokeRect(1, 1, W - 2, H - 2);
      // שטיח
      ctx.fillStyle = 'rgba(120,90,50,0.25)';
      ctx.beginPath();
      ctx.arc(FLAME[0] * sx, FLAME[1] * sy, 4.6 * 0.0125 * 80 * sx, 0, 7);
      ctx.fill();
      // תחנות
      const dot = (x: number, y: number, r: number, col: string) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x * sx, y * sy, r, 0, 7);
        ctx.fill();
      };
      Object.entries(DESKS).forEach(([id, d]) => {
        const c = useHq.getState().snap.crew.find((x) => x.id === id);
        dot(d.x, d.y, 5, c?.color ?? '#888');
      });
      dot(TASK_WALL.cx, TASK_WALL.cy, 6, '#e0a154');
      dot(GIT_WALL.cx, GIT_WALL.cy, 6, '#54d88c');
      dot(PODIUM.x, PODIUM.y, 6, '#e07b54');
      dot(LIBRARY_TABLE[0], LIBRARY_TABLE[1], 6, '#a78bfa');
      dot(RECEPTION.x, RECEPTION.y, 6, '#54d8c0');
      dot(LEAD_TABLE.x, LEAD_TABLE.y, 5, '#E0973F');
      dot(COFFEE.x + 30, COFFEE.y, 4, '#8a6b3f');
      // להבה
      const pulse = 5 + Math.sin(t / 260) * 1.6;
      dot(FLAME[0], FLAME[1], pulse, '#ffb054');
      // צוות — מיקומים חיים
      const brains = useHq.getState().brains;
      brains.forEach((b) => {
        const ag = useHq.getState().snap.agents.find((a) => a.id === b.id);
        dot(b.x, b.y, 3.4, STATE_COLORS[ag?.state || 'idle']);
      });
      // השחקן
      dot(player.x, player.y, 4.4, '#ffffff');
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(player.x * sx, player.y * sy, 7.5, 0, 7);
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} width={220} height={140} className="rounded-lg" aria-label="floor plan" />;
}
