/**
 * TWIN-MARKER-LAW (R22, CR-0051) — the marker-side law for twin-audit evidence, pure.
 *
 * THE BUG THIS MODULE KILLS: twin-audit.mjs used to read
 *   markerA = ev.domainMarker || ev.aMarker
 * i.e. a `domainMarker` evidence ("the marker lives on the DOMAIN side of the pair")
 * was ALSO demanded of the CONSOLE side — punishing a correctly differentiated pair
 * whose whole point is that the Console side must NOT carry the marker (absenceOnA).
 * money-console-domain measured evidenceOk=false on its own correct state → the gate
 * fired daily → and the alarm itself was dead (bash backtick bug) — a false alarm that
 * could not even fail loudly. Two defects canceling into silence is the worst state a
 * watchdog can be in.
 *
 * THE LAW: aMarker = side A only · bMarker = side B only · domainMarker = whichever
 * side is the Domain repo (never both, never the foreign side).
 * pure · deterministic · shared by twin-audit.mjs (ESM import) and E42 (CJS require).
 */
function evidenceMarkers(ev, sides) {
  const e = ev || {};                       // fail-soft: a missing evidence object carries no markers
  const s = sides || {};
  const domA = s.aIsDomain === true, domB = s.bIsDomain === true;
  const a = e.aMarker || (domA && e.domainMarker ? e.domainMarker : null);
  const b = e.bMarker || (domB && e.domainMarker ? e.domainMarker : null);
  return { a: a || null, b: b || null };
}
module.exports = { evidenceMarkers };
