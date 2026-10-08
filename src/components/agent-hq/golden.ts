/** Deterministic golden-angle hue (from token-billing-explained):
 *  hue = (id * 137.508) % 360 — stable, evenly-distributed colors for any id set
 *  (commit authors, hashes, book ids) without fighting the pink/cyan hero pair.
 *  Pair with fixed s/l, e.g. `hsl(${goldenHue(id)}, 80%, 64%)`. */
export function goldenHue(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0;
  return Math.round((n * 137.508) % 360);
}
