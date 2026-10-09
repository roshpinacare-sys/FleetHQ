/**
 * Atmosphere.tsx — תאורת המשרד (מהדורת המכשיר):
 * · היררכיית תאורה אמינה ומאוחדת: ירח קריר מהמערב (צללים) + זרקור חם מעל
 *   להבת-הריבונות (צללים) + כיפה/אמביינט למילוי + אור-מילוי דרומי.
 * · 5 גופי-אור במקום 28: כל תאורה מקומית אחרת הפכה לחומר אמיסיבי (זוהר-מסך,
 *   פסי-נברשות, שילוט) — פחות עלות-קומפילציה ועלות-פריים, אותה קריאות.
 * · הוסרו אפקטי-קולנוע שאינם מידע: עמודות-אור ווליומטריות, אבק-מרחף,
 *   Bloom/Vignette/Grain/FXAA — החדות היא MSAA מקורי בקנבס.
 */
'use client';

export function Atmosphere() {
  return (
    <group>
      <hemisphereLight args={['#6b6156', '#2b2620', 1.5]} />
      <ambientLight intensity={0.52} color="#8a7f72" />
      {/* אור ירח מהמערב — צללים ארוכים */}
      <directionalLight
        position={[-9, 6.5, 1.5]}
        intensity={1.5}
        color="#d8e0ee"
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
      {/* זרקור מרכזי חם מעל הלהבה */}
      <spotLight
        position={[0, 3.35, 0.6]}
        angle={0.75}
        penumbra={0.7}
        intensity={3.0}
        color="#ffd9a6"
        distance={14}
        decay={2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0003}
      />
      {/* אור מילוי מהדרום (קבלה) */}
      <pointLight position={[0, 2.6, 4.6]} intensity={0.55} color="#ffcf9e" distance={9} decay={2} />
    </group>
  );
}
