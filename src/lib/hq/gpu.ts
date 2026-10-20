/**
 * gpu.ts — אמת-המנוע (Task 9): חקירת-מנוע-הרינדור פעם-אחת, לפני שהקנבס עולה.
 * ---------------------------------------------------------------------------
 * השיעור-הקשה מ-Task 8: צינור-רינדור במשקל-GPU (PMREM + השתקפות-רצפה חיה
 * + Bloom + צללים-רכים) נשלח גם אל סביבה בלי מאיץ-GPU (SwiftShader/llvmpipe)
 * ותלה את הטאב לגמרי — הדף קפא, אפילו eval של הדפדפן לא נענה.
 * מעכשיו החוק: **הצינור הכבד רץ רק על מאיץ-חומשה אמיתי**, והכל נמדד —
 * לא מנוחש (רוחב-מסך ומספר-ליבות נשארים החלטות-עזר בלבד).
 */

export type GpuTier = 'hardware' | 'software' | 'none';

let cached: GpuTier | null = null;
let cachedLabel = '';

/** מחרוזת-המנוע האמיתית (לצ'יפ כנה ב-HUD) — 'לא נמדד' לפני הרצה ראשונה */
export function gpuLabel(): string {
  return cachedLabel || 'לא נמדד';
}

/** סיווג מנוע-הרינדור: מאיץ-חומשה · תוכנה (SwiftShader/llvmpipe) · חסר.
 *  לא ידוע/שגיאה = software (fail-honest — מנוע לא מוכר מקבל את מסלול-החיסכון). */
export function probeGpuTier(): GpuTier {
  if (cached) return cached;
  try {
    if (typeof document === 'undefined') return (cached = 'software');
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      cachedLabel = 'WebGL חסר';
      return (cached = 'none');
    }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    cachedLabel = raw.length > 42 ? `${raw.slice(0, 42)}…` : raw;
    const s = raw.toLowerCase();
    const soft =
      s.includes('swiftshader') ||
      s.includes('llvmpipe') ||
      s.includes('softpipe') ||
      s.includes('software') ||
      s.includes('basic render');
    cached = soft ? 'software' : 'hardware';
  } catch {
    cachedLabel = 'מנוע לא מזוהה';
    cached = 'software'; // fail-honest: לא מוכר = מניחים איטי
  }
  return cached;
}
