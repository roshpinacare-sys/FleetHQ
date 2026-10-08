"use client";

// The minimap — a small honest copy of the estate with a live viewport rect.
// Click / drag inside it jumps the big camera (the focus law).

import { useEffect, useRef } from "react";
import type { WorldState } from "@/lib/fleet-world/types";
import { DISTRICT_IDS, DISTRICT_POS, FLAME, HEALTH_COLOR, H, W } from "@/lib/fleet-world/positions";
import type { WorldCanvasApi } from "./WorldCanvas";

interface Props {
  data: WorldState | null;
  canvasApi: React.RefObject<WorldCanvasApi | null>;
}

const MW = 176;
const MH = 110;

export default function MiniMap({ data, canvasApi }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = MW * dpr;
    cv.height = MH * dpr;

    let raf = 0;
    const render = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, MW, MH);
      // backing
      ctx.fillStyle = "rgba(7,9,5,0.85)";
      ctx.beginPath();
      ctx.roundRect(0, 0, MW, MH, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(240,208,96,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const sx = MW / W;
      const sy = MH / H;

      // estate silhouette
      ctx.fillStyle = "rgba(43,54,28,0.4)";
      ctx.beginPath();
      ctx.ellipse((FLAME.x * sx), (FLAME.y * sy), 640 * sx, 445 * sy, 0, 0, Math.PI * 2);
      ctx.fill();

      // flame
      ctx.fillStyle = "rgba(240,178,60,0.95)";
      ctx.beginPath();
      ctx.arc(FLAME.x * sx, FLAME.y * sy, 2.4, 0, Math.PI * 2);
      ctx.fill();

      // districts
      for (const id of DISTRICT_IDS) {
        const d = data?.districts.find((x) => x.id === id);
        const p = DISTRICT_POS[id];
        const col = HEALTH_COLOR[d?.health ?? "down"];
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(p.x * sx, p.y * sy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // viewport rect
      const cam = canvasApi.current?.getCamera();
      if (cam && cam.scale > 0 && cam.w > 0) {
        const vw = Math.min(MW, (cam.w / cam.scale) * sx);
        const vh = Math.min(MH, (cam.h / cam.scale) * sy);
        const cx = ((cam.w / 2 - cam.ox) / cam.scale) * sx;
        const cy = ((cam.h / 2 - cam.oy) / cam.scale) * sy;
        ctx.strokeStyle = "rgba(240,208,96,0.9)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(cx - vw / 2, cy - vh / 2, vw, vh, 3);
        ctx.stroke();
      }
      raf = requestAnimationFrame(render);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const iv = window.setInterval(render, 1000);
      return () => window.clearInterval(iv);
    }
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [data, canvasApi]);

  const jump = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const wx = ((e.clientX - rect.left) / rect.width) * W;
    const wy = ((e.clientY - rect.top) / rect.height) * H;
    canvasApi.current?.center(wx, wy);
  };

  return (
    <canvas
      ref={ref}
      className="h-auto w-[176px] cursor-crosshair touch-none rounded-[10px]"
      style={{ aspectRatio: `${MW}/${MH}` }}
      onPointerDown={(e) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        jump(e);
      }}
      onPointerMove={(e) => draggingRef.current && jump(e)}
      onPointerUp={() => (draggingRef.current = false)}
      onPointerCancel={() => (draggingRef.current = false)}
      aria-label="Minimap — click to move the view"
      role="img"
    />
  );
}
