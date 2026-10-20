/**
 * Atmosphere.tsx — תאורת המשרד (מהדורת אור-יום, Task 51).
 * ------------------------------------------------------------------
 * חוק אור-היום (DESIGN.md §0.1 — אור = כנות): חדר כהה מסתיר מידע; חדר בהיר
 * הוא המידע. מדד-בסיס של משימה 51: בהירות-ממוצעת 22–35/255 (מועדון-לילה) —
 * ההיררכיה כולה נבנתה מחדש כשמש-יום חמה דרך-החלונות:
 * · שמש ראשית מדרום-מערב (צללים אמיתיים, חמה) + שמיים-מילוי ממזרח
 * · כיפה/אמביינט מוגבהים — אפס פינה-שחורה
 * · זרקור חם מעל להבת-הריבונות — נקודת-מרכז נשארת חגיגית
 * · 5 גופי-אור — אותה משמעת-עלות של משימה 45 (הזוהר המקומי הוא חומר אמיסיבי)
 */
'use client';

export function Atmosphere() {
  return (
    <group>
      {/* כיפה: שמיים-יום מעל, רצפת-אבן בהירה מתחת — החדר כולו נושם */}
      <hemisphereLight args={['#f6f0e2', '#cfc6b6', 3.15]} />
      <ambientLight intensity={1.18} color="#c6bfb1" />
      {/* שמש ראשית — נכנסת מהחלונות הדרומיים-מערביים, חמה, צללים אמיתיים */}
      <directionalLight
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
    </group>
  );
}
