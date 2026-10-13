/**
 * vite.config.ts — ה-build הסטטי של המשרד התלת-מימדי (exec-14-3d, מסלול office3d-static).
 * ------------------------------------------------------------------
 * מטרה: העמוד-הפומבי התמידי של המשרד (office-pages) יישא את החדר התלת-מימדי
 * כחוויה-מובילה — אפס-בקאנד, אפס-סודות, אפס-תלות ב-Next.
 * · root = התיקייה הזו (הרצה: bun run office3d:build משורש-הריפו)
 * · alias '@' → ../../src — אותו קוד-מקור בדיוק כמו האפ הראשי
 * · outDir → ../../dist-office3d (מחוץ ל-next build הרגיל)
 * · base './' — נטען מכל נתיב ב-GitHub Pages
 * · publicDir = public/ של שורש-הריפו — המודלים public/models/humans/*.glb
 *   נוחתים ב-dist תחת ./models/humans/ (MODEL_BASE מכוון אליהם)
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src', import.meta.url)),
    },
  },
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  // ה-CSS כאן טהור (hud.css) — לא להריץ את קונפיג-ה-PostCSS של השורש (Tailwind של Next)
  css: { postcss: { plugins: [] } },
  build: {
    outDir: fileURLToPath(new URL('../../dist-office3d', import.meta.url)),
    emptyOutDir: true,
    // חד-עמוד פשוט; ה-GLB כבד (~7.9MB) אך מותר במפורש במשימה
    chunkSizeWarningLimit: 1500,
  },
});
