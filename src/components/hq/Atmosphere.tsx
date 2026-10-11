/**
 * Atmosphere.tsx — תאורת המשרד (מהדורת אור-יום, Task 51 · שדרוג 11-a).
 * ------------------------------------------------------------------
 * חוק אור-היום (DESIGN.md §0.1 — אור = כנות): חדר כהה מסתיר מידע; חדר בהיר
 * הוא המידע. מדד-בסיס של משימה 51: בהירות-ממוצעת 22–35/255 (מועדון-לילה) —
 * ההיררכיה כולה נבנתה מחדש כשמש-יום חמה דרך-החלונות:
 * · שמש ראשית מדרום-מערב (צללים אמיתיים, חמה) + שמיים-מילוי ממזרח
 * · כיפה/אמביינט מוגבהים — אפס פינה-שחורה
 * · זרקור חם מעל להבת-הריבונות — נקודת-מרכז נשארת חגיגית
 * · Task 11-a — היררכיית-אור מלאה: key (שמש) / fill (שמיים-מזרח) /
 *   rim (קו-תפאורה מצפון-מזרח — מנתק את הצוות והרהיטים מהרקע בעדינות) /
 *   צללי-מגע רכים (ContactShadows — אחיזת-קרקע לרהיטים ולצוות) /
 *   מחזור-יום-עדין: השמש נודדת באיטיות בין-צהריים-חמים לזהב-אחר-הצהריים
 *   (מחזור 6 דקות — נוכחות חיה בלי רעש; תאורה היא תפאורה, לא נתונים).
 * · 7 גופי-אור — אותה משמעות-עלות של משימה 45 (הזוהר המקומי הוא חומר אמיסיבי)
 */
'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

/** מחזור היום העדין — משך מחזור מלא בשניות (צהריים → זהב → צהריים) */
const DAY_CYCLE_S = 360;
/** צבע-הזהב של אחר-הצהריים — מוקצה פעם אחת (אפס הקצאות בלולאת-הפריים) */
const GOLD = new THREE.Color('#ffe3b8');

export function Atmosphere() {
  // refs לגופי-האור שנעים במחזור — mutation ישיר, אפס re-render
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const t = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.5); // מגן-החלפת-טאב — כמו במצלמה
    t.current += dt;
    const phase = (t.current / DAY_CYCLE_S) * Math.PI * 2; // 0..2π
    // משרת-שמש: נדידה עדינה של הזווית האופקית (±0.35 rad) + נשימת-עוצמה קטנה
    if (sunRef.current) {
      const base = sunRef.current.userData.baseX ?? (sunRef.current.userData.baseX = sunRef.current.position.x);
      sunRef.current.position.x = base + Math.sin(phase) * 1.9;
      sunRef.current.intensity = 2.55 + Math.sin(phase) * 0.35;
      // מזהב עדין לקראת אחר-הצהריים — בלי לגעת בחוק אור-היום (בהיר נשאר בהיר)
      sunRef.current.color.set('#fff2da').lerp(GOLD, (Math.sin(phase) + 1) / 2 * 0.5);
    }
    if (hemiRef.current) {
      hemiRef.current.intensity = 3.15 + Math.sin(phase) * 0.12;
    }
  });

  return (
    <group>
      {/* כיפה: שמיים-יום מעל, רצפת-אבן בהירה מתחת — החדר כולו נושם */}
      <hemisphereLight ref={hemiRef} args={['#f6f0e2', '#cfc6b6', 3.15]} />
      <ambientLight intensity={1.18} color="#c6bfb1" />
      {/* שמש ראשית — נכנסת מהחלונות הדרומיים-מערביים, חמה, צללים אמיתיים.
          Task 11-a: מרכיב ה-key של היררכיית-האור, עם מחזור-יום עדין. */}
      <directionalLight
        ref={sunRef}
        position={[-6.5, 8.5, 7.0]}
        intensity={2.7}
        color="#fff2da"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
      />
      {/* מילוי-שמיים מהמזרח — רך, בלי צללים; אפס פינה-שחורה בחצי-המזרחי */}
      <directionalLight position={[8.5, 5.2, 2.5]} intensity={1.05} color="#e2e8ec" />
      {/* Task 11-a — אור-שפה (rim) מצפון-מזרח, מאחורי הצוות: קו בהיר עדין
          שמנתק דמויות ורהיטים מהרקע (טכניקת שלושת-האורות הקלאסית) */}
      <directionalLight position={[3.5, 4.2, -8.5]} intensity={0.55} color="#dfe8f0" />
      {/* זרקור מרכזי חם מעל הלהבה — לב-החדר נשאר נקודת-המוקד */}
      <spotLight
        position={[0, 3.35, 0.6]}
        angle={0.75}
        penumbra={0.7}
        intensity={2.1}
        color="#ffd9a6"
        distance={14}
        decay={2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0003}
      />
      {/* אור מילוי מהדרום (קבלה) */}
      <pointLight position={[0, 2.6, 4.6]} intensity={1.15} color="#ffcf9e" distance={10} decay={2} />
      {/* Task 11-a — צללי-מגע רכים: אחיזת-קרקע כנה לכל מה שעומד על הרצפה.
          רזולוציה מרוסנת (512) — הם אמצעי-הצגה, לא מוקד-ביצועים. */}
      <ContactShadows
        position={[0, 0.002, 0]}
        scale={26}
        resolution={512}
        far={1.6}
        blur={2.6}
        opacity={0.32}
        color="#4a3f30"
        frames={Infinity}
      />
    </group>
  );
}
