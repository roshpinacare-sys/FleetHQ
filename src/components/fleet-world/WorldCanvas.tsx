"use client";

// The living sovereignty atlas 2.0 — a canvas-rendered digital estate.
// Design laws (our own, not a copy):
//  · Far away, the BEACONS tell you who is alive (each lamp = a real book publish time).
//  · Mid-distance, the PLATES + SKYLINE tell you what each district is and how loud it lives
//    (building height = the district's measured intensity).
//  · Up close, click a CITIZEN or DISTRICT for the exact measured numbers.
//  · The camera is yours: wheel/pinch zoom, drag pan, minimap jumps, focus glide.
//  · The sky follows the real UTC clock (day/night), the aurora follows the measured
//    fleet indicators, the trade arcs follow the engine's real fill tape.
// Everything on this map traces to /api/world — zero invention.

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { District, Lang, WorldState } from "@/lib/fleet-world/types";
import { DISTRICT_IDS, DISTRICT_POS, FLAME, HEALTH_COLOR, H, RING, TIER_COLOR, W, coordDistrict } from "@/lib/fleet-world/positions";
import { dayFactor } from "@/lib/fleet-world/i18n";

const RES = 1.5; // static-layer supersampling
const PAD = 320; // world margin visible when panning
const MIN_ZOOM_F = 0.72; // how far below fit-scale you may zoom out
const MAX_ZOOM = 4;
const DAY_BUCKET_MS = 15 * 60 * 1000;

interface Walker {
  id: string;
  home: string;
  tier: string;
  busy: boolean;
  dormant: boolean;
  x: number;
  y: number;
  tx: number;
  ty: number;
  dwellUntil: number;
  speed: number;
  trail: P[];
  seed: number;
  lastSpark: number;
}

interface Packet {
  x: number;
  y: number;
  fx: number;
  fy: number;
  txx: number;
  tyy: number;
  t: number;
  speed: number;
  color: string;
  kind: "msg" | "coin" | "caravan";
  size: number;
}

interface Pulse {
  x: number;
  y: number;
  t0: number;
  color: string;
  ttl: number;
  r0: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface Dust {
  x: number;
  y: number;
  vy: number;
  a: number;
  r: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  ph: number;
}

interface P {
  x: number;
  y: number;
}

interface Camera {
  scale: number;
  ox: number;
  oy: number;
  glide: { scale: number; ox: number; oy: number } | null;
}

export interface Selection {
  type: "district" | "citizen";
  id: string;
}

export interface WorldCanvasApi {
  focusDistrict: (id: string) => void;
  focusCitizenDistrict: (district: string) => void;
  reset: () => void;
  center: (wx: number, wy: number, scale?: number) => void;
  getCamera: () => { scale: number; ox: number; oy: number; w: number; h: number };
}

interface Props {
  data: WorldState | null;
  lang: Lang;
  selected: Selection | null;
  onSelect: (s: Selection | null) => void;
  onCamera?: (c: { scale: number; ox: number; oy: number; w: number; h: number }) => void;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const WorldCanvas = forwardRef<WorldCanvasApi, Props>(function WorldCanvas(
  { data, lang, selected, onSelect, onCamera },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<Camera>({ scale: 1, ox: 0, oy: 0, glide: null });
  const sizeRef = useRef({ w: 0, h: 0 });
  const stateRef = useRef({
    hover: null as Selection | null,
    hitDistricts: [] as { id: string; x: number; y: number; r: number }[],
    hitCitizens: [] as { id: string; x: number; y: number; r: number }[],
    dragging: false,
    moved: false,
    lastX: 0,
    lastY: 0,
    pointers: new Map<number, { x: number; y: number }>(),
    pinchDist: 0,
  });
  const dataRef = useRef<WorldState | null>(null);
  const langRef = useRef<Lang>(lang);
  const selRef = useRef<Selection | null>(null);
  const onCamRef = useRef<Props["onCamera"]>(onCamera);
  const walkersRef = useRef<Walker[]>([]);
  const packetsRef = useRef<Packet[]>([]);
  const pulsesRef = useRef<Pulse[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const dustRef = useRef<Dust[]>([]);
  const starsRef = useRef<Star[]>([]);
  const spawnedFillsRef = useRef<Set<string>>(new Set());
  const spawnedCoordRef = useRef<Set<string>>(new Set());
  const caravansRef = useRef<number[]>([0.1, 0.45, 0.8]);
  const ringPathRef = useRef<{ pts: P[]; cum: number[]; total: number } | null>(null);
  const staticRef = useRef<{ canvas: HTMLCanvasElement | null; key: string }>({ canvas: null, key: "" });
  const reducedRef = useRef(false);

  // keep the animation loop reading fresh props without re-binding the RAF
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  useEffect(() => {
    selRef.current = selected;
  }, [selected]);
  useEffect(() => {
    onCamRef.current = onCamera;
  }, [onCamera]);

  // ── imperative camera API for the HUD (focus law, minimap jumps, reset)
  useImperativeHandle(ref, () => ({
    focusDistrict(id: string) {
      const p = DISTRICT_POS[id] ?? FLAME;
      focusOn(camRef, sizeRef.current, p.x, p.y - 10, Math.max(camRef.current.scale, 1.55));
    },
    focusCitizenDistrict(district: string) {
      const p = DISTRICT_POS[district] ?? FLAME;
      focusOn(camRef, sizeRef.current, p.x, p.y - 10, Math.max(camRef.current.scale, 1.55));
    },
    reset() {
      fitView(camRef, sizeRef.current, true);
    },
    center(wx: number, wy: number, scale?: number) {
      focusOn(camRef, sizeRef.current, wx, wy, scale ?? camRef.current.scale);
    },
    getCamera() {
      const c = camRef.current;
      return { scale: c.scale, ox: c.ox, oy: c.oy, w: sizeRef.current.w, h: sizeRef.current.h };
    },
  }), []);

  // ── init ambient fields when data first arrives
  useEffect(() => {
    if (!data || dustRef.current.length) return;
    const rnd = mulberry32(1337);
    for (let i = 0; i < 46; i++) {
      dustRef.current.push({
        x: rnd() * W,
        y: rnd() * H,
        vy: 4 + rnd() * 9,
        a: 0.04 + rnd() * 0.1,
        r: 0.6 + rnd() * 1.4,
      });
    }
    const sr = mulberry32(9001);
    for (let i = 0; i < 110; i++) {
      starsRef.current.push({ x: sr() * (W + 2 * PAD) - PAD, y: sr() * 560 - PAD, r: 0.5 + sr() * 1.3, ph: sr() * Math.PI * 2 });
    }
  }, [data]);

  // ── walkers (citizens walking their measured world)
  useEffect(() => {
    if (!data || !data.districts.length || walkersRef.current.length) return;
    const rnd = mulberry32(20261007);
    walkersRef.current = data.citizens.map((c, i) => {
      const home = DISTRICT_POS[c.district] ?? FLAME;
      const sx = home.x + (rnd() - 0.5) * 90;
      const sy = home.y + 40 + rnd() * 40;
      return {
        id: c.id,
        home: c.district,
        tier: c.tier,
        busy: c.busy,
        dormant: c.status !== "LIVE",
        x: sx,
        y: sy,
        tx: sx,
        ty: sy,
        dwellUntil: 0,
        speed: (34 + rnd() * 26) * (c.busy ? 1.45 : 1),
        trail: [],
        seed: i * 7919 + 17,
        lastSpark: 0,
      };
    });
  }, [data]);

  // ── ring road path (for caravans)
  useEffect(() => {
    if (ringPathRef.current) return;
    const pts: P[] = [];
    for (let i = 0; i < RING.length - 1; i++) {
      const a = DISTRICT_POS[RING[i]];
      const b = DISTRICT_POS[RING[i + 1]];
      const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.14;
      const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.14;
      for (let k = 0; k <= 20; k++) {
        const u = k / 20;
        pts.push({
          x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * mx + u * u * b.x,
          y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * my + u * u * b.y,
        });
      }
    }
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    ringPathRef.current = { pts, cum, total: cum[cum.length - 1] };
  }, []);

  // ── spawn pulses + packets for fresh tape events, real fills and coord messages
  useEffect(() => {
    if (!data) return;
    const now = Date.now();
    for (const ev of data.tape) {
      const age = (now - Date.parse(ev.at)) / 1000;
      if (age < 0 || age > 120 || spawnedFillsRef.current.has(ev.id)) continue;
      spawnedFillsRef.current.add(ev.id);
      const src =
        ev.source === "saos-dex" || ev.source === "fee-law" || ev.source === "saos-engine"
          ? "exchange"
          : ev.source === "truth-gate" || ev.source === "agent-verify"
            ? "truth"
            : ev.source === "pulse"
              ? "herald"
              : ev.source === "money-watch"
                ? "mint"
                : ev.source === "fleet-indicators"
                  ? "census"
                  : null;
      const pos = src ? DISTRICT_POS[src] : FLAME;
      const color = ev.weight === 3 ? "#f0d060" : ev.weight === 2 ? "#22c55e" : "#8a9a7b";
      pulsesRef.current.push({ x: pos.x, y: pos.y - 26, t0: performance.now(), color, ttl: 2600, r0: 10 });
      const target = rndTarget(pos);
      packetsRef.current.push({
        x: pos.x, y: pos.y, fx: pos.x, fy: pos.y, txx: target.x, tyy: target.y,
        t: 0, speed: 0.35 + Math.random() * 0.3, color, kind: "msg", size: 7,
      });
    }
    // real engine fills → coin arcs exchange ↔ mint through the flame
    let fillSpawned = 0;
    for (const f of data.engineTape) {
      if (fillSpawned >= 6) break;
      if (spawnedFillsRef.current.has(f.id)) continue;
      spawnedFillsRef.current.add(f.id);
      const ex = DISTRICT_POS.exchange;
      const mn = DISTRICT_POS.mint;
      const dir = fillSpawned % 2 === 0;
      packetsRef.current.push({
        x: dir ? ex.x : mn.x, y: dir ? ex.y : mn.y,
        fx: dir ? ex.x : mn.x, fy: dir ? ex.y : mn.y,
        txx: dir ? mn.x : ex.x, tyy: dir ? mn.y : ex.y,
        t: 0, speed: 0.28 + Math.random() * 0.14, color: "#f0b23c", kind: "coin", size: 8.5,
      });
      fillSpawned++;
    }
    // coordination bus → packets from the reporting district to the flame
    let coordSpawned = 0;
    for (const m of data.coord) {
      if (coordSpawned >= 5) break;
      if (spawnedCoordRef.current.has(m.id)) continue;
      spawnedCoordRef.current.add(m.id);
      const d = coordDistrict(m.proto, m.action);
      const pos = d ? DISTRICT_POS[d] : null;
      if (!pos) continue;
      packetsRef.current.push({
        x: pos.x, y: pos.y, fx: pos.x, fy: pos.y, txx: FLAME.x, tyy: FLAME.y,
        t: 0, speed: 0.3 + Math.random() * 0.2, color: "#5eead4", kind: "msg", size: 6.5,
      });
      coordSpawned++;
    }
    if (spawnedFillsRef.current.size > 500) spawnedFillsRef.current = new Set([...spawnedFillsRef.current].slice(-250));
    if (spawnedCoordRef.current.size > 300) spawnedCoordRef.current = new Set([...spawnedCoordRef.current].slice(-150));
  }, [data]);

  // ── main render loop
  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      sizeRef.current = { w, h };
      fitView(camRef, { w, h }, false);
      staticRef.current.key = ""; // force static re-render
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      tickCamera(camRef, sizeRef.current, dt);
      onCamRef.current?.({ scale: camRef.current.scale, ox: camRef.current.ox, oy: camRef.current.oy, w: sizeRef.current.w, h: sizeRef.current.h });
      draw(ctx, now, dt, stateRef.current, camRef.current, sizeRef.current, dataRef.current, langRef.current, selRef.current, walkersRef, packetsRef, pulsesRef, sparksRef, dustRef.current, starsRef.current, caravansRef, ringPathRef.current, staticRef, reducedRef.current);
      if (!reducedRef.current) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    if (reducedRef.current) {
      const iv = window.setInterval(() => {
        draw(ctx, performance.now(), 0.016, stateRef.current, camRef.current, sizeRef.current, dataRef.current, langRef.current, selRef.current, walkersRef, packetsRef, pulsesRef, sparksRef, dustRef.current, starsRef.current, caravansRef, ringPathRef.current, staticRef, true);
      }, 4000);
      return () => {
        window.clearInterval(iv);
        ro.disconnect();
      };
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // redraw once for reduced-motion when data/lang/selection change
  useEffect(() => {
    if (!reducedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) draw(ctx, performance.now(), 0.016, stateRef.current, camRef.current, sizeRef.current, dataRef.current, langRef.current, selRef.current, walkersRef, packetsRef, pulsesRef, sparksRef, dustRef.current, starsRef.current, caravansRef, ringPathRef.current, staticRef, true);
  }, [data, lang, selected]);

  // ── pointer interaction (pan / zoom / pinch / select)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const zoomAt = (cx: number, cy: number, factor: number) => {
      const cam = camRef.current;
      const { w, h } = sizeRef.current;
      const minS = minScale(w, h);
      const ns = Math.min(MAX_ZOOM, Math.max(minS, cam.scale * factor));
      const wx = (cx - cam.ox) / cam.scale;
      const wy = (cy - cam.oy) / cam.scale;
      cam.scale = ns;
      cam.ox = cx - wx * ns;
      cam.oy = cy - wy * ns;
      cam.glide = null;
      clampCam(cam, w, h);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.14 : 1 / 1.14);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      stateRef.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (stateRef.current.pointers.size === 2) {
        const [a, b] = [...stateRef.current.pointers.values()];
        stateRef.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      stateRef.current.dragging = true;
      stateRef.current.moved = false;
      stateRef.current.lastX = e.clientX;
      stateRef.current.lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      const st = stateRef.current;
      if (st.pointers.has(e.pointerId)) st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // pinch
      if (st.pointers.size === 2) {
        const [a, b] = [...st.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (st.pinchDist > 0 && Math.abs(d - st.pinchDist) > 1) {
          const rect = canvas.getBoundingClientRect();
          const mx = (a.x + b.x) / 2 - rect.left;
          const my = (a.y + b.y) / 2 - rect.top;
          zoomAt(mx, my, d / st.pinchDist);
          st.pinchDist = d;
          st.moved = true;
        }
        return;
      }
      // pan
      if (st.dragging) {
        const dx = e.clientX - st.lastX;
        const dy = e.clientY - st.lastY;
        if (Math.abs(dx) + Math.abs(dy) > 4) st.moved = true;
        const cam = camRef.current;
        cam.ox += dx;
        cam.oy += dy;
        cam.glide = null;
        clampCam(cam, sizeRef.current.w, sizeRef.current.h);
        st.lastX = e.clientX;
        st.lastY = e.clientY;
      }
      // hover
      const rect = canvas.getBoundingClientRect();
      const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top, camRef.current, st);
      st.hover = hit;
      canvas.style.cursor = st.dragging && st.moved ? "grabbing" : hit ? "pointer" : "grab";
    };
    const onPointerUp = (e: PointerEvent) => {
      const st = stateRef.current;
      st.pointers.delete(e.pointerId);
      if (st.pointers.size < 2) st.pinchDist = 0;
      if (st.dragging && !st.moved) {
        const rect = canvas.getBoundingClientRect();
        const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top, camRef.current, st);
        if (hit) onSelect(hit);
      }
      st.dragging = false;
      st.moved = false;
    };
    const onDouble = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, 1.7);
    };
    const onLeave = () => {
      stateRef.current.hover = null;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("dblclick", onDouble);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("dblclick", onDouble);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [onSelect]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-grab touch-none"
        aria-label="The living map of the fleet estate — interactive, zoomable"
        role="img"
      />
    </div>
  );
});

export default WorldCanvas;

// ─── camera ───────────────────────────────────────────────────────────────────

function minScale(w: number, h: number): number {
  return Math.min(w / (W + PAD), h / (H + PAD)) * MIN_ZOOM_F;
}

function fitView(cam: { current: Camera }, size: { w: number; h: number }, animate: boolean) {
  if (!size.w || !size.h) return;
  const sFit = Math.min(size.w / W, size.h / H);
  const portrait = size.h > size.w * 1.15;
  const s = portrait ? Math.max(sFit, Math.min(size.w / (W * 0.85), sFit * 2.4)) : sFit;
  const cxw = portrait ? FLAME.x : W / 2;
  const cyw = portrait ? FLAME.y + 30 : H / 2;
  const target = { scale: s, ox: size.w / 2 - cxw * s, oy: size.h / 2 - cyw * s };
  if (animate) {
    cam.current.glide = target;
  } else {
    cam.current.scale = target.scale;
    cam.current.ox = target.ox;
    cam.current.oy = target.oy;
    cam.current.glide = null;
  }
  clampCam(cam.current, size.w, size.h);
}

function focusOn(cam: { current: Camera }, size: { w: number; h: number }, wx: number, wy: number, s: number) {
  if (!size.w || !size.h) return;
  const target = { scale: s, ox: size.w / 2 - wx * s, oy: size.h / 2 - wy * s };
  cam.current.glide = target;
}

function tickCamera(cam: { current: Camera }, size: { w: number; h: number }, dt: number) {
  const c = cam.current;
  if (c.glide) {
    const k = 1 - Math.pow(0.0018, dt); // smooth exponential glide
    c.scale += (c.glide.scale - c.scale) * k;
    c.ox += (c.glide.ox - c.ox) * k;
    c.oy += (c.glide.oy - c.oy) * k;
    if (
      Math.abs(c.glide.scale - c.scale) < 0.002 &&
      Math.abs(c.glide.ox - c.ox) < 0.6 &&
      Math.abs(c.glide.oy - c.oy) < 0.6
    ) {
      c.scale = c.glide.scale;
      c.ox = c.glide.ox;
      c.oy = c.glide.oy;
      c.glide = null;
    }
  }
  clampCam(c, size.w, size.h);
}

function clampCam(c: Camera, w: number, h: number) {
  if (!w || !h) return;
  c.scale = Math.min(MAX_ZOOM, Math.max(minScale(w, h), c.scale));
  const s = c.scale;
  const minX = w - (W + PAD) * s;
  const maxX = PAD * s;
  const minY = h - (H + PAD) * s;
  const maxY = PAD * s;
  c.ox = minX > maxX ? (minX + maxX) / 2 : Math.min(maxX, Math.max(minX, c.ox));
  c.oy = minY > maxY ? (minY + maxY) / 2 : Math.min(maxY, Math.max(minY, c.oy));
}

function hitTest(cx: number, cy: number, cam: Camera, st: { hitCitizens: { id: string; x: number; y: number; r: number }[]; hitDistricts: { id: string; x: number; y: number; r: number }[] }): Selection | null {
  const x = (cx - cam.ox) / cam.scale;
  const y = (cy - cam.oy) / cam.scale;
  for (const c of st.hitCitizens) {
    if ((x - c.x) ** 2 + (y - c.y) ** 2 <= c.r ** 2) return { type: "citizen", id: c.id };
  }
  for (const d of st.hitDistricts) {
    if ((x - d.x) ** 2 + (y - d.y) ** 2 <= d.r ** 2) return { type: "district", id: d.id };
  }
  return null;
}

// ─── static layer (world-space scenery, re-rendered per day-bucket/lang/size) ──

function renderStatic(
  key: string,
  staticRef: { current: { canvas: HTMLCanvasElement | null; key: string } },
  data: WorldState | null,
  lang: Lang,
  dayF: number,
): HTMLCanvasElement | null {
  const cached = staticRef.current;
  if (cached.canvas && cached.key === key) return cached.canvas;
  const cv = cached.canvas ?? document.createElement("canvas");
  cv.width = Math.ceil((W + 2 * PAD) * RES);
  cv.height = Math.ceil((H + 2 * PAD) * RES);
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(RES, 0, 0, RES, PAD * RES, PAD * RES); // world coords with margin

  const night = 1 - dayF;

  // ── sky
  const sky = ctx.createLinearGradient(0, -PAD, 0, H + PAD);
  if (dayF > 0.5) {
    sky.addColorStop(0, "#1c2416");
    sky.addColorStop(0.5, "#141a0f");
    sky.addColorStop(1, "#0a0d07");
  } else if (dayF > 0.05) {
    sky.addColorStop(0, "#171d13");
    sky.addColorStop(0.5, "#10150c");
    sky.addColorStop(1, "#090b06");
  } else {
    sky.addColorStop(0, "#0d110b");
    sky.addColorStop(0.5, "#0a0d08");
    sky.addColorStop(1, "#070906");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(-PAD, -PAD, W + 2 * PAD, H + 2 * PAD);

  // ── distant mountains (two silhouettes)
  const mtn = (baseY: number, amp: number, seed: number, col: string) => {
    const rnd = mulberry32(seed);
    ctx.beginPath();
    ctx.moveTo(-PAD, baseY + 200);
    const peaks = 14;
    for (let i = 0; i <= peaks; i++) {
      const x = -PAD + ((W + 2 * PAD) * i) / peaks;
      const y = baseY - rnd() * amp - (i % 2 === 0 ? amp * 0.35 : 0);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + PAD, baseY + 200);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  };
  mtn(120, 130, 777, dayF > 0.5 ? "rgba(30,38,24,0.85)" : "rgba(18,22,15,0.9)");
  mtn(200, 95, 4242, dayF > 0.5 ? "rgba(24,31,20,0.9)" : "rgba(14,18,12,0.92)");

  // ── the moat + its water
  ctx.save();
  borderPath(ctx, 0, 26);
  ctx.fillStyle = dayF > 0.5 ? "rgba(24,38,46,0.85)" : "rgba(14,22,28,0.9)";
  ctx.fill();
  ctx.restore();
  ctx.save();
  borderPath(ctx, 0, 14);
  ctx.fillStyle = dayF > 0.5 ? "rgba(36,58,66,0.9)" : "rgba(18,30,36,0.92)";
  ctx.fill();
  ctx.restore();

  // bridges across the moat at the ring road's four compass points
  for (const ang of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const bx = 800 + Math.cos(ang) * 700;
    const by = 520 + Math.sin(ang) * 470;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = "rgba(120,104,70,0.9)";
    ctx.fillRect(-9, -30, 18, 60);
    ctx.fillStyle = "rgba(160,140,92,0.85)";
    ctx.fillRect(-9, -30, 18, 6);
    ctx.fillRect(-9, 24, 18, 6);
    ctx.restore();
  }

  // ── the estate ground
  borderPath(ctx, 0, 0);
  const ground = ctx.createRadialGradient(FLAME.x, FLAME.y, 40, FLAME.x, FLAME.y, 700);
  const gb = 0.5 + dayF * 0.25;
  ground.addColorStop(0, `rgba(${Math.round(48 * gb + 12)},${Math.round(60 * gb + 12)},${Math.round(30 * gb + 8)},0.6)`);
  ground.addColorStop(0.6, `rgba(${Math.round(30 * gb + 8)},${Math.round(38 * gb + 8)},${Math.round(20 * gb + 6)},0.55)`);
  ground.addColorStop(1, "rgba(16,21,12,0.6)");
  ctx.fillStyle = ground;
  ctx.fill();
  ctx.strokeStyle = `rgba(240,208,96,${0.14 + night * 0.06})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = "rgba(240,208,96,0.05)";
  ctx.lineWidth = 8;
  ctx.stroke();

  // faint survey grid inside the border
  ctx.save();
  borderPath(ctx, 0, 0);
  ctx.clip();
  ctx.strokeStyle = "rgba(216,211,194,0.045)";
  ctx.lineWidth = 1;
  for (let x = 80; x < W; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x, H - 40);
    ctx.stroke();
  }
  for (let y = 80; y < H; y += 80) {
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(W - 40, y);
    ctx.stroke();
  }
  ctx.restore();

  // ── roads (spokes + ring)
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(216,211,194,0.10)";
  for (const id of DISTRICT_IDS) {
    const p = DISTRICT_POS[id];
    const mx = (FLAME.x + p.x) / 2 + (p.y - FLAME.y) * 0.12;
    const my = (FLAME.y + p.y) / 2 - (p.x - FLAME.x) * 0.12;
    ctx.beginPath();
    ctx.moveTo(FLAME.x, FLAME.y);
    ctx.quadraticCurveTo(mx, my, p.x, p.y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(240,208,96,0.07)";
  ctx.beginPath();
  for (let i = 0; i < RING.length - 1; i++) {
    const a = DISTRICT_POS[RING[i]];
    const b = DISTRICT_POS[RING[i + 1]];
    const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.14;
    const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.14;
    if (i === 0) ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
  }
  ctx.stroke();

  // ── watchtowers on the border
  for (const ang of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const tx = 800 + Math.cos(ang) * 620;
    const ty = 520 + Math.sin(ang) * 420;
    ctx.strokeStyle = "rgba(150,140,112,0.75)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx - 6, ty + 12);
    ctx.lineTo(tx - 2, ty - 16);
    ctx.moveTo(tx + 6, ty + 12);
    ctx.lineTo(tx + 2, ty - 16);
    ctx.stroke();
    ctx.strokeRect(tx - 8, ty - 24, 16, 10);
  }

  // ── districts: plateau + skyline + glyph + plate
  const dmap = new Map((data?.districts ?? []).map((d) => [d.id, d]));
  for (const id of DISTRICT_IDS) {
    const d = dmap.get(id);
    const p = DISTRICT_POS[id];
    const intensity = d?.intensity ?? 0.5;

    // plateau
    ctx.save();
    ctx.translate(p.x, p.y);
    hexPath(ctx, 52);
    const pg = ctx.createLinearGradient(0, -40, 0, 40);
    pg.addColorStop(0, "rgba(52,63,33,0.8)");
    pg.addColorStop(1, "rgba(30,38,20,0.85)");
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = "rgba(216,211,194,0.18)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // skyline: procedural buildings scaled by the district's measured intensity
    const rnd = mulberry32(hashStr(id));
    const nB = 3 + Math.round(intensity * 2.4);
    for (let i = 0; i < nB; i++) {
      const bw = 9 + rnd() * 7;
      const bh = 12 + intensity * 26 + rnd() * 8;
      const bx = p.x - 34 + i * (68 / nB) + rnd() * 6;
      const by = p.y - 16 - bh;
      ctx.fillStyle = dayF > 0.5 ? "rgba(38,45,30,0.95)" : "rgba(26,32,22,0.95)";
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(150,142,112,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // windows — lit at night (the estate never sleeps, but its lamps do dim)
      if (night > 0.45) {
        ctx.fillStyle = "rgba(240,208,96,0.75)";
        for (let wy = by + 3; wy < by + bh - 3; wy += 5) {
          if (rnd() < 0.62) ctx.fillRect(bx + 2.5, wy, 2, 2);
          if (bw > 8 && rnd() < 0.5) ctx.fillRect(bx + bw - 4.5, wy, 2, 2);
        }
      }
    }

    // glyph
    drawGlyph(ctx, id, p.x, p.y + 2);

    // beacon mast
    ctx.strokeStyle = "rgba(216,211,194,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + 30, p.y - 8);
    ctx.lineTo(p.x + 30, p.y - 44);
    ctx.stroke();

    // name plate
    const label = d ? d.name[lang] : id;
    ctx.font = "600 13.5px Heebo, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.direction = lang === "he" ? "rtl" : "ltr";
    ctx.fillStyle = "rgba(232,228,216,0.82)";
    ctx.fillText(label, p.x, p.y + 56);
    ctx.direction = "ltr";
  }

  staticRef.current = { canvas: cv, key };
  return cv;
}

function hexPath(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r * 0.86;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function borderPath(ctx: CanvasRenderingContext2D, t: number, grow: number): void {
  const cx = 800;
  const cy = 520;
  const pts: P[] = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const wob = 1 + 0.055 * Math.sin(a * 3 + t * 0.00018) + 0.04 * Math.cos(a * 5 - t * 0.00011);
    pts.push({ x: cx + Math.cos(a) * (655 + grow) * wob, y: cy + Math.sin(a) * (435 + grow) * wob });
  }
  ctx.beginPath();
  const mid = (p: P, q: P): P => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  let m = mid(pts[N - 1], pts[0]);
  ctx.moveTo(m.x, m.y);
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    const n = pts[(i + 1) % N];
    ctx.quadraticCurveTo(p.x, p.y, mid(p, n).x, mid(p, n).y);
  }
  ctx.closePath();
}

// ─── glyphs (hand-drawn, one per district) ────────────────────────────────────

function drawGlyph(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#cfc9b4";
  ctx.fillStyle = "#cfc9b4";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  switch (kind) {
    case "exchange": {
      ctx.beginPath();
      ctx.moveTo(-20, -14);
      ctx.lineTo(20, -14);
      ctx.moveTo(0, -22);
      ctx.lineTo(0, 12);
      ctx.moveTo(-12, 12);
      ctx.lineTo(12, 12);
      ctx.stroke();
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 20, -14);
        ctx.lineTo(s * 20, -2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s * 20, 2, 6.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case "truth": {
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(10, 8);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-14, 14);
      ctx.lineTo(14, 14);
      ctx.stroke();
      const g = ctx.createLinearGradient(0, -30, 0, -78);
      g.addColorStop(0, "rgba(240,208,96,0.55)");
      g.addColorStop(1, "rgba(240,208,96,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-3.5, -78, 7, 48);
      break;
    }
    case "census": {
      ctx.beginPath();
      ctx.moveTo(-20, -10);
      ctx.lineTo(20, -10);
      ctx.stroke();
      for (const cx2 of [-14, 0, 14]) {
        ctx.beginPath();
        ctx.moveTo(cx2, -10);
        ctx.lineTo(cx2, 12);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-20, 12);
      ctx.lineTo(20, 12);
      ctx.stroke();
      break;
    }
    case "mint": {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 10 - i * 8, 15, 5.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, 10 - 2 * 8 - 5);
      ctx.lineTo(0, 10 - 2 * 8 - 12);
      ctx.stroke();
      break;
    }
    case "anchors": {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(s * 13, 6, 13, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-26, 8);
      ctx.lineTo(26, 8);
      ctx.stroke();
      break;
    }
    case "stasis": {
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.quadraticCurveTo(14, -14, 14, 0);
      ctx.quadraticCurveTo(14, 14, 0, 20);
      ctx.quadraticCurveTo(-14, 14, -14, 0);
      ctx.quadraticCurveTo(-14, -14, 0, -18);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 10);
      ctx.stroke();
      break;
    }
    case "library": {
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.quadraticCurveTo(-12, -14, -20, -8);
      ctx.lineTo(-20, 10);
      ctx.quadraticCurveTo(-12, 4, 0, 12);
      ctx.quadraticCurveTo(12, 4, 20, 10);
      ctx.lineTo(20, -8);
      ctx.quadraticCurveTo(12, -14, 0, -6);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(0, 12);
      ctx.stroke();
      break;
    }
    default: {
      // herald: the horn + sound waves
      ctx.beginPath();
      ctx.moveTo(-14, -10);
      ctx.lineTo(6, -2);
      ctx.lineTo(6, 8);
      ctx.lineTo(-14, 14);
      ctx.closePath();
      ctx.stroke();
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(6, -2, i * 5 + 3, -Math.PI / 3, Math.PI / 3);
        ctx.strokeStyle = `rgba(207,201,180,${0.85 - i * 0.22})`;
        ctx.stroke();
      }
      ctx.strokeStyle = "#cfc9b4";
      break;
    }
  }
  ctx.restore();
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function rndTarget(from: P): P {
  const k = DISTRICT_IDS[Math.floor(Math.random() * DISTRICT_IDS.length)];
  const p = DISTRICT_POS[k];
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  if (d < 80) return FLAME;
  return p;
}

function healthOf(d: District | undefined): string {
  return d?.health ?? "down";
}

function walkerTick(ws: Walker[], now: number, dt: number, sparks: Spark[]) {
  for (const w of ws) {
    const dist = Math.hypot(w.tx - w.x, w.ty - w.y);
    if (dist < 4) {
      if (now > w.dwellUntil) {
        const rnd = mulberry32(w.seed + Math.floor(now / 1000));
        const goOut = w.dormant ? false : rnd() < (w.busy ? 0.5 : 0.38);
        let target: P;
        if (goOut) {
          const k = DISTRICT_IDS[Math.floor(rnd() * DISTRICT_IDS.length)];
          target = DISTRICT_POS[k];
        } else {
          const home = DISTRICT_POS[w.home] ?? FLAME;
          target = { x: home.x + (rnd() - 0.5) * (w.dormant ? 26 : 100), y: home.y + 34 + rnd() * (w.dormant ? 12 : 46) };
        }
        w.tx = target.x;
        w.ty = target.y;
        w.dwellUntil = now + (2000 + rnd() * (w.busy ? 4000 : 7000));
      } else if (w.busy && !w.dormant && Math.random() < dt * 2.2) {
        // the working desk throws real-looking sparks (the WORK is visible)
        sparks.push({
          x: w.x + (Math.random() - 0.5) * 8,
          y: w.y - 2,
          vx: (Math.random() - 0.5) * 22,
          vy: -26 - Math.random() * 22,
          life: 0.55,
          color: Math.random() < 0.7 ? "#f0d060" : "#f7e9b8",
        });
      }
    } else {
      const step = w.speed * dt;
      w.x += ((w.tx - w.x) / dist) * step;
      w.y += ((w.ty - w.y) / dist) * step;
      w.trail.push({ x: w.x, y: w.y });
      if (w.trail.length > 14) w.trail.shift();
    }
  }
}

function ringPoint(rp: { pts: P[]; cum: number[]; total: number } | null, t: number): P | null {
  if (!rp) return null;
  const d = ((t % 1) + 1) % 1 * rp.total;
  let lo = 0;
  let hi = rp.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rp.cum[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const seg = rp.cum[i] - rp.cum[i - 1] || 1;
  const u = (d - rp.cum[i - 1]) / seg;
  return {
    x: rp.pts[i - 1].x + (rp.pts[i].x - rp.pts[i - 1].x) * u,
    y: rp.pts[i - 1].y + (rp.pts[i].y - rp.pts[i - 1].y) * u,
  };
}

interface DrawRefs {
  current: Walker[];
}

// ─── the main draw ────────────────────────────────────────────────────────────

function draw(
  ctx: CanvasRenderingContext2D,
  now: number,
  dt: number,
  st: {
    hover: Selection | null;
    hitDistricts: { id: string; x: number; y: number; r: number }[];
    hitCitizens: { id: string; x: number; y: number; r: number }[];
    dragging: boolean;
    moved: boolean;
  },
  cam: Camera,
  size: { w: number; h: number },
  data: WorldState | null,
  lang: Lang,
  sel: Selection | null,
  walkersRef: DrawRefs,
  packetsRef: { current: Packet[] },
  pulsesRef: { current: Pulse[] },
  sparksRef: { current: Spark[] },
  dust: Dust[],
  stars: Star[],
  caravansRef: { current: number[] },
  ringPath: { pts: P[]; cum: number[]; total: number } | null,
  staticRef: { current: { canvas: HTMLCanvasElement | null; key: string } },
  reduced: boolean,
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = ctx.canvas.width / dpr;
  const chh = ctx.canvas.height / dpr;

  const dayF = dayFactor(new Date());
  const night = 1 - dayF;
  const dayBucket = Math.floor(Date.now() / DAY_BUCKET_MS);

  // ── static world layer
  const key = `${Math.round(size.w)}x${Math.round(size.h)}|${dpr}|${dayBucket}|${lang}|${data?.at ?? "none"}`;
  const stat = renderStatic(key, staticRef, data, lang, dayF);

  // ── deep background (outside the static extents)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#070905";
  ctx.fillRect(0, 0, cw, chh);

  // ── world transform
  const s = cam.scale;
  const ox = cam.ox;
  const oy = cam.oy;
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);

  if (stat) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(stat, -PAD, -PAD, W + 2 * PAD, H + 2 * PAD);
  }

  // ── stars (world-space, visible at night)
  if (night > 0.12) {
    for (const star of stars) {
      const tw = reduced ? 0.7 : 0.55 + 0.45 * Math.sin(now * 0.0016 + star.ph);
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240,235,214,${(night * 0.75 * tw).toFixed(3)})`;
      ctx.fill();
    }
  }

  // ── aurora: the measured mood of the fleet paints the sky
  const ind = data?.indicators;
  const auroraCol =
    ind && (ind.grow ?? 0) > (ind.decline ?? 0)
      ? "34,197,94"
      : ind && (ind.decline ?? 0) > (ind.grow ?? 0)
        ? "248,113,113"
        : "240,208,96";
  if (!reduced) {
    for (let i = 0; i < 3; i++) {
      const ax = W / 2 + Math.sin(now * 0.00012 + i * 2.1) * 520;
      const ay = 60 + Math.cos(now * 0.00009 + i * 1.7) * 70;
      const ar = 340 + i * 90;
      const g = ctx.createRadialGradient(ax, ay, 0, ax, ay, ar);
      g.addColorStop(0, `rgba(${auroraCol},${0.05 + night * 0.05})`);
      g.addColorStop(1, `rgba(${auroraCol},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ax, ay, ar, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── dust motes
  for (const p of dust) {
    if (!reduced) {
      p.y -= p.vy * dt;
      if (p.y < 20) p.y = H - 20;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(240,225,180,${p.a})`;
    ctx.fill();
  }

  // ── caravans on the ring road (the estate's trade circuit)
  if (!reduced && ringPath) {
    for (let i = 0; i < caravansRef.current.length; i++) {
      caravansRef.current[i] = (caravansRef.current[i] + dt * 0.016) % 1;
      const pos = ringPoint(ringPath, caravansRef.current[i]);
      if (!pos) continue;
      const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 9);
      g.addColorStop(0, "rgba(240,208,96,0.8)");
      g.addColorStop(1, "rgba(240,208,96,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f0d060";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const districts = data?.districts ?? [];
  const dmap = new Map(districts.map((d) => [d.id, d]));

  // ── packets traveling the roads (messages, coins, reports)
  if (!reduced) {
    if (Math.random() < dt * 3.2 && data) {
      const fk = DISTRICT_IDS[Math.floor(Math.random() * DISTRICT_IDS.length)];
      const from = DISTRICT_POS[fk];
      const to = Math.random() < 0.55 ? FLAME : rndTarget(from);
      packetsRef.current.push({
        x: from.x, y: from.y, fx: from.x, fy: from.y, txx: to.x, tyy: to.y,
        t: 0, speed: 0.4 + Math.random() * 0.35, color: "#f0d060", kind: "msg", size: 7,
      });
    }
    for (const pk of packetsRef.current) {
      pk.t += pk.speed * dt;
      const mx = (pk.fx + pk.txx) / 2 + (pk.tyy - pk.fy) * 0.12;
      const my = (pk.fy + pk.tyy) / 2 - (pk.txx - pk.fx) * 0.12;
      const u = Math.min(1, pk.t);
      const xu = (1 - u) * (1 - u) * pk.fx + 2 * (1 - u) * u * mx + u * u * pk.txx;
      const yu = (1 - u) * (1 - u) * pk.fy + 2 * (1 - u) * u * my + u * u * pk.tyy;
      const grad = ctx.createRadialGradient(xu, yu, 0, xu, yu, pk.size);
      grad.addColorStop(0, pk.color);
      grad.addColorStop(1, hexA(pk.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(xu, yu, pk.size, 0, Math.PI * 2);
      ctx.fill();
      if (pk.kind === "coin") {
        ctx.fillStyle = "#f7e08a";
        ctx.beginPath();
        ctx.arc(xu, yu, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    packetsRef.current = packetsRef.current.filter((pk) => pk.t < 1);
    if (packetsRef.current.length > 80) packetsRef.current = packetsRef.current.slice(-80);
  }

  // ── the flame of sovereignty (the estate heart)
  const flick = reduced ? 1 : 1 + 0.08 * Math.sin(now * 0.006) + 0.05 * Math.sin(now * 0.017 + 1.3);
  const fglow = ctx.createRadialGradient(FLAME.x, FLAME.y, 4, FLAME.x, FLAME.y, 90 * flick);
  fglow.addColorStop(0, "rgba(240,208,96,0.34)");
  fglow.addColorStop(0.5, "rgba(240,178,60,0.12)");
  fglow.addColorStop(1, "rgba(240,178,60,0)");
  ctx.fillStyle = fglow;
  ctx.beginPath();
  ctx.arc(FLAME.x, FLAME.y, 90 * flick, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(FLAME.x, FLAME.y);
  ctx.beginPath();
  ctx.moveTo(0, -26 * flick);
  ctx.bezierCurveTo(10, -14, 9, -2, 0, 10);
  ctx.bezierCurveTo(-9, -2, -10, -14, 0, -26 * flick);
  const fbody = ctx.createLinearGradient(0, -26, 0, 12);
  fbody.addColorStop(0, "#f7e08a");
  fbody.addColorStop(0.55, "#f0b23c");
  fbody.addColorStop(1, "rgba(240,120,40,0.15)");
  ctx.fillStyle = fbody;
  ctx.fill();
  ctx.restore();
  // orbiting sparks of the flame
  if (!reduced) {
    for (let i = 0; i < 5; i++) {
      const a = now * 0.0006 + (i * Math.PI * 2) / 5;
      const rr = 40 + 10 * Math.sin(now * 0.001 + i);
      ctx.beginPath();
      ctx.arc(FLAME.x + Math.cos(a) * rr, FLAME.y - 8 + Math.sin(a) * rr * 0.5, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240,208,96,${0.5 - i * 0.07})`;
      ctx.fill();
    }
  }
  // truth verdict ring
  const truthOk = data ? data.truth.verdict === "ALL-GREEN" && data.truth.assertions.failed === 0 : false;
  ctx.beginPath();
  ctx.arc(FLAME.x, FLAME.y, 34, 0, Math.PI * 2);
  ctx.strokeStyle = data ? (truthOk ? "rgba(34,197,94,0.75)" : "rgba(234,179,8,0.8)") : "rgba(216,211,194,0.3)";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([7, 6]);
  ctx.lineDashOffset = reduced ? 0 : -now * 0.012;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = "600 15px Heebo, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(240,225,180,0.9)";
  ctx.direction = lang === "he" ? "rtl" : "ltr";
  ctx.fillText(lang === "he" ? "להבת-הריבונות" : "Flame of Sovereignty", FLAME.x, FLAME.y + 56);
  if (data) {
    ctx.font = "500 11.5px ui-monospace, monospace";
    ctx.fillStyle = "rgba(216,211,194,0.6)";
    ctx.fillText(
      `${data.truth.assertions.passed}/${data.truth.assertions.total} · ${data.census.liveDesks} ${lang === "he" ? "עמדות חיות" : "live desks"} · ${(data.token.height ?? 0).toLocaleString("en-US")} ${lang === "he" ? "גובה" : "height"}`,
      FLAME.x,
      FLAME.y + 74,
    );
  }
  ctx.direction = "ltr";

  // ── districts (dynamic: lamps, rings, hover plates)
  st.hitDistricts = [];
  for (const id of DISTRICT_IDS) {
    const d = dmap.get(id);
    const p = DISTRICT_POS[id];
    const health = healthOf(d);
    const col = HEALTH_COLOR[health];
    const hovered = st.hover?.type === "district" && st.hover.id === id;
    const isSel = sel?.type === "district" && sel.id === id;
    st.hitDistricts.push({ id, x: p.x, y: p.y, r: 64 });

    // selection ring on the plateau
    if (isSel || hovered) {
      ctx.save();
      ctx.translate(p.x, p.y);
      hexPath(ctx, hovered ? 56 : 52);
      ctx.strokeStyle = isSel ? "rgba(240,208,96,0.95)" : "rgba(240,208,96,0.55)";
      ctx.lineWidth = isSel ? 2.5 : 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // lamp
    const lampY = p.y - 50;
    const breathe = reduced ? 1 : 1 + 0.16 * Math.sin(now * 0.004 + p.x);
    const lg = ctx.createRadialGradient(p.x + 30, lampY, 1, p.x + 30, lampY, 26 * breathe);
    lg.addColorStop(0, col);
    lg.addColorStop(0.35, col + "aa");
    lg.addColorStop(1, col + "00");
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(p.x + 30, lampY, 26 * breathe, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x + 30, lampY, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = "rgba(7,9,5,0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // fresh-book pulse rings
    const ageH = d?.ageHours ?? 99;
    if (!reduced && ageH < 3) {
      const ph = ((now + p.x * 7) % 4200) / 4200;
      ctx.beginPath();
      ctx.arc(p.x + 30, lampY, 8 + ph * 22, 0, Math.PI * 2);
      ctx.strokeStyle = col + Math.round((1 - ph) * 90).toString(16).padStart(2, "0");
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // hover / selected plate
    if (hovered || isSel) {
      const label = d ? d.name[lang] : id;
      ctx.font = "700 15px Heebo, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.direction = lang === "he" ? "rtl" : "ltr";
      const w = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(10,13,8,0.85)";
      ctx.beginPath();
      ctx.roundRect(p.x - w / 2 - 10, p.y + 40, w + 20, 22, 7);
      ctx.fill();
      ctx.strokeStyle = "rgba(240,208,96,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#f7e9b8";
      ctx.fillText(label, p.x, p.y + 56);
      if (d) {
        ctx.font = "500 10.5px ui-monospace, monospace";
        ctx.fillStyle = col + "cc";
        const cap = d.ageHours != null ? `${health === "alive" ? "●" : "○"} ${d.ageHours < 1 ? Math.round(d.ageHours * 60) + "m" : Math.round(d.ageHours) + "h"} ${lang === "he" ? "" : "ago"}` : "○ —";
        ctx.fillText(cap, p.x, p.y + 71);
      }
      ctx.direction = "ltr";
    }
  }

  // ── the exchange hologram (live internal book price + fill sparkline)
  if (data && data.engineTape.length > 0) {
    drawHologram(ctx, data, lang, now, reduced);
  }

  // ── pulses (event rings)
  if (!reduced) {
    for (const pu of pulsesRef.current) {
      const u = (now - pu.t0) / pu.ttl;
      if (u >= 1) continue;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, pu.r0 + u * 46, 0, Math.PI * 2);
      ctx.strokeStyle = pu.color + Math.round((1 - u) * 160).toString(16).padStart(2, "0");
      ctx.lineWidth = 2.5 * (1 - u) + 0.5;
      ctx.stroke();
    }
    pulsesRef.current = pulsesRef.current.filter((pu) => now - pu.t0 < pu.ttl);
  }

  // ── sparks (work is visible)
  if (!reduced) {
    for (const sp of sparksRef.current) {
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += 60 * dt;
      sp.life -= dt;
      if (sp.life > 0) {
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(sp.x - sp.vx * 0.03, sp.y - sp.vy * 0.03);
        ctx.strokeStyle = hexA(sp.color, Math.max(0, sp.life));
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
    sparksRef.current = sparksRef.current.filter((sp) => sp.life > 0);
    if (sparksRef.current.length > 60) sparksRef.current = sparksRef.current.slice(-60);
  }

  // ── citizens
  st.hitCitizens = [];
  const citizens = data?.citizens ?? [];
  const cmap = new Map(citizens.map((c) => [c.id, c]));
  if (walkersRef.current.length && !reduced) walkerTick(walkersRef.current, now, dt, sparksRef.current);
  for (const w of walkersRef.current) {
    const c = cmap.get(w.id);
    if (!c) continue;
    // sync the measured flags every frame — the books may have changed while walking
    if (c.busy !== w.busy) {
      w.busy = c.busy;
      w.speed = (34 + (w.seed % 26)) * (c.busy ? 1.45 : 1);
    }
    w.dormant = c.status !== "LIVE";
    const hovered = st.hover?.type === "citizen" && st.hover.id === w.id;
    const isSel = sel?.type === "citizen" && sel.id === w.id;
    st.hitCitizens.push({ id: w.id, x: w.x, y: w.y, r: 18 });
    const tierCol = TIER_COLOR[c.tier] ?? TIER_COLOR.C;
    const dormant = w.dormant;

    // trail
    if (!reduced && w.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(w.trail[0].x, w.trail[0].y);
      for (const tp of w.trail) ctx.lineTo(tp.x, tp.y);
      ctx.strokeStyle = hexA(dormant ? "#96948a" : tierCol, 0.2);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // glow + orb
    const g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, hovered || isSel ? 16 : 11);
    g.addColorStop(0, hexA(dormant ? "#96948a" : tierCol, hovered || isSel ? 0.6 : 0.4));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w.x, w.y, hovered || isSel ? 16 : 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w.x, w.y, 4.4, 0, Math.PI * 2);
    ctx.fillStyle = dormant ? "#6f6d64" : tierCol;
    ctx.fill();
    ctx.strokeStyle = "rgba(7,9,5,0.85)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // the working desk swings its tool
    if (w.busy && !dormant && !reduced) {
      const swinging = Math.hypot(w.tx - w.x, w.ty - w.y) < 4;
      const a = swinging ? -0.9 + 0.5 * Math.sin(now * 0.01 + w.seed) : -0.6;
      ctx.beginPath();
      ctx.moveTo(w.x + 3, w.y - 1);
      ctx.lineTo(w.x + 3 + Math.cos(a) * 7, w.y - 1 + Math.sin(a) * 7);
      ctx.strokeStyle = "rgba(216,211,194,0.85)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      if (w.busy) {
        ctx.beginPath();
        ctx.arc(w.x + 6, w.y - 7, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(240,208,96,0.9)";
        ctx.fill();
      }
    }
    if (isSel) {
      ctx.beginPath();
      ctx.arc(w.x, w.y, 12 + (reduced ? 0 : 2 * Math.sin(now * 0.005)), 0, Math.PI * 2);
      ctx.strokeStyle = "#f0d060";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    if (hovered || isSel) {
      const label = c.name;
      ctx.font = "700 12.5px ui-monospace, monospace";
      ctx.textAlign = "center";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(10,13,8,0.9)";
      ctx.beginPath();
      ctx.roundRect(w.x - tw / 2 - 8, w.y - 34, tw + 16, 19, 6);
      ctx.fill();
      ctx.strokeStyle = hexA(tierCol, 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#f7e9b8";
      ctx.fillText(label, w.x, w.y - 21);
      // busy chip
      if (w.busy) {
        ctx.font = "600 9px ui-monospace, monospace";
        ctx.fillStyle = "rgba(74,222,128,0.9)";
        ctx.fillText(lang === "he" ? "עובד" : "working", w.x, w.y + 16);
      }
    }
  }
}

// ─── the exchange hologram ────────────────────────────────────────────────────

function drawHologram(ctx: CanvasRenderingContext2D, data: WorldState, lang: Lang, now: number, reduced: boolean) {
  const p = DISTRICT_POS.exchange;
  const bw = 172;
  const bh = 52;
  const bx = p.x - bw / 2;
  const by = p.y - 128 + (reduced ? 0 : Math.sin(now * 0.0012) * 2.5);

  ctx.save();
  // panel
  ctx.fillStyle = "rgba(10,13,8,0.78)";
  ctx.strokeStyle = "rgba(240,208,96,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 8);
  ctx.fill();
  ctx.stroke();
  // holo legs
  ctx.strokeStyle = "rgba(240,208,96,0.25)";
  ctx.beginPath();
  ctx.moveTo(bx + 24, by + bh);
  ctx.lineTo(p.x - 14, p.y - 40);
  ctx.moveTo(bx + bw - 24, by + bh);
  ctx.lineTo(p.x + 14, p.y - 40);
  ctx.stroke();

  // price line
  const price = data.token.refPriceMu;
  ctx.font = "700 13px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "#f7e9b8";
  ctx.fillText(`SAOS ${price != null ? (price / 1000).toFixed(3) : "—"}`, bx + 10, by + 16);
  ctx.font = "500 8.5px Heebo, Arial, sans-serif";
  ctx.fillStyle = "rgba(138,154,123,0.95)";
  ctx.fillText(lang === "he" ? "מחיר-ספר פנימי · אין ביד-חוץ" : "internal book price · no external bid", bx + 10, by + bh - 6);

  // sparkline from the real fill tape
  const prices = data.engineTape.slice(0, 40).map((f) => f.price).reverse();
  if (prices.length >= 2) {
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const span = hi - lo || 1;
    const sx = bx + bw - 74;
    const sy = by + 8;
    const sw = 62;
    const sh = 22;
    ctx.beginPath();
    for (let i = 0; i < prices.length; i++) {
      const px = sx + (i / (prices.length - 1)) * sw;
      const py = sy + sh - ((prices[i] - lo) / span) * sh;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    const up = prices[prices.length - 1] >= prices[0];
    ctx.strokeStyle = up ? "#4ade80" : "#f87171";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // delta label
    const delta = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
    ctx.font = "700 9.5px ui-monospace, monospace";
    ctx.fillStyle = up ? "#4ade80" : "#f87171";
    ctx.textAlign = "right";
    ctx.fillText(`${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%`, bx + bw - 8, by + bh - 6);
  }
  ctx.restore();
}

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
