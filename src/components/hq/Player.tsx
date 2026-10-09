/**
 * Player.tsx — גוף השחקן + ריג המצלמה.
 * · מצלמת עקיבה מהירה (third person) עם מבט בגרירת עכבר וזום בגלגלת
 * · מצב ראשון (F) · מיקוד קולנועי לתחנות (bus focus) עם יציאה אוטומטית
 * · קלט: WASD/חצים · Shift ריצה · קליק על רצפה = הליכה אליה · ג'ויסטיק מגע מה-HUD
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PLAN_W, PLAN_H, SCALE, WALL_H, to3, FOCUS_PRESETS, PLAYER_R, FLAME } from '@/lib/hq/contract';
import { Player, input, bus } from '@/lib/hq/world';
import { makeBlobShadowTexture } from '@/lib/hq/textures';

const player = new Player();

// ─────────────── קלט ───────────────
function useInputWiring() {
  const { gl } = useThree();
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      input.keys.add(e.code);
      input.introDone = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = true;
      if (e.code === 'KeyF') input.firstPerson = !input.firstPerson;
      if (e.code === 'Escape') bus.emit('focus', { target: null });
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      input.keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = false;
    };
    const blur = () => { input.keys.clear(); input.sprint = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);

    // גרירת עכבר לסיבוב מצלמה + קליק על רצפה = הליכה
    const el = gl.domElement;
    let dragging = false;
    let moved = 0;
    let lx = 0, ly = 0;
    const pd = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      input.introDone = true;
      dragging = true; moved = 0; lx = e.clientX; ly = e.clientY;
    };
    const pm = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) {
        orbit.current.yaw -= dx * 0.0052;
        orbit.current.pitch = Math.max(0.08, Math.min(1.15, orbit.current.pitch + dy * 0.0036));
      }
      lx = e.clientX; ly = e.clientY;
    };
    const pu = () => { dragging = false; };
    el.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);

    const wheel = (e: WheelEvent) => {
      orbit.current.dist = Math.max(1.2, Math.min(9.5, orbit.current.dist + e.deltaY * 0.0035));
    };
    el.addEventListener('wheel', wheel, { passive: true });

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      el.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl]);
}

// ─────────────── המצלמה ───────────────
const orbit = { yaw: 0.05, pitch: 0.34, dist: 5.6 };
// מצלמת הפתיחה: זווית קולנועית יציבה מדרום-מערב — הלהבה במרכז, הצוות מתחת
// לנברשות, הספרייה מימין (ראשית-הקריאה בעברית). המצלמה מתחילה בדיוק כאן
// (בלי טיסה) כדי שהפריים הראשון יהיה מושלם; כל קלט ראשון עובר לעקיבה חלקה.
const introPos = new THREE.Vector3(to3(300, 900)[0], 2.5, to3(300, 900)[1]);
const introLook = new THREE.Vector3(to3(FLAME[0], FLAME[1])[0], 1.1, to3(FLAME[0], FLAME[1])[1]);
const camPos = introPos.clone();
const camLook = introLook.clone();

function CameraRig() {
  const { camera } = useThree();
  const focus = useRef<{ x: number; y: number; kind: string; until: number } | null>(null);
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3() }), []);

  useEffect(() => {
    const off = bus.on('focus', ({ target, kind }) => {
      if (!target) { focus.current = null; return; }
      input.introDone = true; // מיקוד מסרב את מצלמת הפתיחה
      focus.current = { x: target.x, y: target.y, kind: kind || 'flame', until: performance.now() + 9000 };
    });
    return off;
  }, []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const k = 1 - Math.exp(-dt * 4.2);
    const cam = camera as THREE.PerspectiveCamera;

    // מצלמת פתיחה — עד הקלט הראשון: שוללת את המצלמה אל זווית החשיפה,
    // וכשהשחקן נוגע (מקש/גרירה/ג'ויסטיק/קליק) — מעבר חלק למצלמת-העקיבה
    if (!input.introDone && !focus.current) {
      camPos.lerp(introPos, k);
      camLook.lerp(introLook, 1 - Math.exp(-dt * 3));
      cam.position.copy(camPos);
      cam.lookAt(camLook);
      return;
    }

    // יציאה אוטומטית ממיקוד אחרי 9 שניות
    if (focus.current && performance.now() > focus.current.until) focus.current = null;
    // תנועת השחקן מבטלת מיקוד
    if (focus.current && player.walkAmt > 0.25) focus.current = null;

    if (focus.current) {
      const f = focus.current;
      const [tx, tz] = to3(f.x, f.y);
      const preset = FOCUS_PRESETS[f.kind] || FOCUS_PRESETS.flame;
      const d = preset.dist;
      // מצלמה ניצבת מאחורי התחנה בכיוון השחקן
      const ang = Math.atan2(player.x - f.x, player.y - f.y);
      const px = tx + Math.sin(ang) * d;
      const pz = tz + Math.cos(ang) * d;
      const py = 1.1 + Math.tan(preset.pitch) * d * 0.62;
      tmp.a.set(
        THREE.MathUtils.clamp(px, -PLAN_W * SCALE / 2 + 0.6, PLAN_W * SCALE / 2 - 0.6),
        Math.min(py, WALL_H - 0.35),
        THREE.MathUtils.clamp(pz, -PLAN_H * SCALE / 2 + 0.6, PLAN_H * SCALE / 2 - 0.6),
      );
      tmp.b.set(tx, f.kind === 'wall' || f.kind === 'git' ? 1.5 : 1.15, tz);
      camPos.lerp(tmp.a, 1 - Math.exp(-dt * 3.4));
      camLook.lerp(tmp.b, 1 - Math.exp(-dt * 4));
    } else if (input.firstPerson) {
      const [px, pz] = to3(player.x, player.y);
      tmp.a.set(px, 1.62, pz);
      const fx = Math.sin(player.facing), fz = Math.cos(player.facing);
      tmp.b.set(px + fx * 2.4, 1.5, pz + fz * 2.4);
      camPos.copy(tmp.a);
      camLook.lerp(tmp.b, 1 - Math.exp(-dt * 9));
    } else {
      // עקיבה חופשית
      const [px, pz] = to3(player.x, player.y);
      const d = orbit.dist;
      const cx = px + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * d;
      const cz = pz + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * d;
      const cy = 1.25 + Math.sin(orbit.pitch) * d;
      tmp.a.set(
        THREE.MathUtils.clamp(cx, -PLAN_W * SCALE / 2 + 0.55, PLAN_W * SCALE / 2 - 0.55),
        Math.min(cy, WALL_H - 0.3),
        THREE.MathUtils.clamp(cz, -PLAN_H * SCALE / 2 + 0.55, PLAN_H * SCALE / 2 - 0.55),
      );
      // מבט-קדימה: המצלמה תמיד מביטה קצת לפני השחקן — כך גם כשהיא
      // נצמדת לקיר הדרומי בנקודת-ההיוולד, הפריים נשאר על החדר ולא
      // מתרסק לירידה אנכית על הראש של השחקן.
      tmp.b.set(px + Math.sin(player.facing) * 2.4, 1.5, pz + Math.cos(player.facing) * 2.4);
      camPos.lerp(tmp.a, k);
      camLook.lerp(tmp.b, 1 - Math.exp(-dt * 5.5));
    }
    cam.position.copy(camPos);
    cam.lookAt(camLook);
  });
  return null;
}

// ─────────────── גוף השחקן ───────────────
function PlayerBody() {
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const shadowTex = useMemo(() => makeBlobShadowTexture(), []);
  const phase = useRef(0);

  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (!g) return;
    player.update(Math.min(dt, 0.05));
    const [x, z] = to3(player.x, player.y);
    g.position.set(x, 0, z);
    if (inner.current) {
      inner.current.rotation.y = player.facing;
      // תנודת הליכה
      phase.current += Math.min(dt, 0.05) * player.walkAmt * 11;
      const s = Math.sin(phase.current);
      if (legL.current) legL.current.rotation.x = s * 0.72 * player.walkAmt;
      if (legR.current) legR.current.rotation.x = -s * 0.72 * player.walkAmt;
      if (armL.current) armL.current.rotation.x = -s * 0.55 * player.walkAmt;
      if (armR.current) armR.current.rotation.x = s * 0.55 * player.walkAmt;
      inner.current.position.y = Math.abs(Math.sin(phase.current)) * 0.045 * player.walkAmt;
    }
    // במבט ראשון — הגוף מוסתר
    const vis = !input.firstPerson;
    g.visible = vis;
    void clock;
  });

  return (
    <group ref={group}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.016}>
        <planeGeometry args={[1.0, 1.0]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} opacity={0.8} />
      </mesh>
      <group ref={inner}>
        {/* גוף */}
        <mesh position={[0, 1.06, 0]} castShadow>
          <capsuleGeometry args={[0.21, 0.5, 6, 14]} />
          <meshStandardMaterial color="#4d4338" roughness={0.8} />
        </mesh>
        {/* אפוד מפקדה */}
        <mesh position={[0, 1.12, 0.02]} castShadow>
          <boxGeometry args={[0.4, 0.44, 0.3]} />
          <meshStandardMaterial color="#3a4438" roughness={0.85} />
        </mesh>
        <mesh position={[0, 1.18, 0.18]}>
          <boxGeometry args={[0.1, 0.06, 0.02]} />
          <meshStandardMaterial color="#ffb054" emissive="#ffb054" emissiveIntensity={1.6} toneMapped={false} />
        </mesh>
        {/* ראש */}
        <mesh position={[0, 1.58, 0.02]} castShadow>
          <sphereGeometry args={[0.155, 18, 14]} />
          <meshStandardMaterial color="#e0b48c" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.64, 0]} castShadow>
          <sphereGeometry args={[0.16, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#2b2119" roughness={0.9} />
        </mesh>
        {/* ידיים */}
        <group ref={armL} position={[-0.27, 1.3, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.06, 0.34, 4, 10]} />
            <meshStandardMaterial color="#4d4338" roughness={0.8} />
          </mesh>
        </group>
        <group ref={armR} position={[0.27, 1.3, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.06, 0.34, 4, 10]} />
            <meshStandardMaterial color="#4d4338" roughness={0.8} />
          </mesh>
        </group>
        {/* רגליים */}
        <group ref={legL} position={[-0.11, 0.78, 0]}>
          <mesh position={[0, -0.36, 0]} castShadow>
            <capsuleGeometry args={[0.075, 0.52, 4, 10]} />
            <meshStandardMaterial color="#26221e" roughness={0.9} />
          </mesh>
        </group>
        <group ref={legR} position={[0.11, 0.78, 0]}>
          <mesh position={[0, -0.36, 0]} castShadow>
            <capsuleGeometry args={[0.075, 0.52, 4, 10]} />
            <meshStandardMaterial color="#26221e" roughness={0.9} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// ─────────────── רצפת קליקים ───────────────
function ClickFloor() {
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position-y={0.001}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        // המרה ליחידות תוכנית
        const p = e.point;
        const px = p.x / SCALE + PLAN_W / 2;
        const py = p.z / SCALE + PLAN_H / 2;
        input.tapTarget = { x: px, y: py };
        bus.emit('focus', { target: null });
      }}
    >
      <planeGeometry args={[PLAN_W * SCALE, PLAN_H * SCALE]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export function PlayerRig() {
  useEffect(() => {
    // debug hook (dev): live player + input state for browser probing
    (window as unknown as Record<string, unknown>).__hqP = player;
    (window as unknown as Record<string, unknown>).__hqIn = input;
  }, []);
  useInputWiring();
  return (
    <group>
      <PlayerBody />
      <ClickFloor />
      <CameraRig />
    </group>
  );
}

export { player, PLAYER_R };
