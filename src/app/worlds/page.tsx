import type { Metadata } from 'next'
import { WorldDeck } from '@/components/worlds/WorldDeck'

// /worlds — דלת העולמות (T-59 worlds-wiring, Task 15 lane claim a3643a40).
// העולמות של worlds/ (T13) — משרד · רשת · עסקים · מקביל · גיוס·ערך — על גשר-האמת
// /api/worlds-state. דף אדיטיבי-בלבד: אפס שינויים בקבצים קיימים.
export const metadata: Metadata = { title: 'העולמות המקבילים — FleetHQ' }

export default function WorldsPage() {
  return (
    <main className="h-[100dvh] w-full overflow-hidden">
      <WorldDeck />
    </main>
  )
}
