import type { MercatoMappingResult } from '../types'
import type { MigrationPlanItem, MigrationPlanResult } from '../migrationPlanner'

const PRICED_DECISIONS = new Set(['build', 'configure'])

function fail(path: string, expected: string): never {
  throw new Error(`[mercatify-labs] ${path}: expected ${expected}`)
}

/**
 * Brama między wynikiem agenta Migration Planner a resztą ścieżki.
 * `runAgent` zwraca `unknown` po `parseJsonLoosely` (`src/llmClient.ts:121`),
 * więc bez tego `attachEffortHours` wpisałby w mapowanie string albo NaN.
 */
export function validateMigrationPlan(raw: unknown): MigrationPlanResult {
  if (typeof raw !== 'object' || raw === null) fail('result', 'an object')
  const root = raw as Record<string, unknown>
  if (!Array.isArray(root.items)) fail('result.items', 'an array')
  if (typeof root.summary !== 'string' || root.summary.length === 0) {
    fail('result.summary', 'a non-empty string')
  }

  const items: MigrationPlanItem[] = root.items.map((rawItem, i) => {
    const base = `items[${i}]`
    if (typeof rawItem !== 'object' || rawItem === null) fail(base, 'an object')
    const entry = rawItem as Record<string, unknown>

    for (const key of ['capability', 'source', 'rationale'] as const) {
      if (typeof entry[key] !== 'string' || (entry[key] as string).length === 0) {
        fail(`${base}.${key}`, 'a non-empty string')
      }
    }
    if (!Number.isInteger(entry.estimatedHours) || (entry.estimatedHours as number) < 0) {
      fail(`${base}.estimatedHours`, 'a non-negative integer count of hours, never money')
    }
    if (!Number.isInteger(entry.sequence) || (entry.sequence as number) < 1) {
      fail(`${base}.sequence`, 'an integer >= 1')
    }

    return {
      capability: entry.capability as string,
      source: entry.source as string,
      estimatedHours: entry.estimatedHours as number,
      sequence: entry.sequence as number,
      rationale: entry.rationale as string,
    }
  })

  return { items, summary: root.summary }
}

export interface PlanCoverage {
  /** Mapowania build/configure, których plan nie wycenił. */
  missing: Array<{ source: string; capability: string }>
  /** Pozycje planu, które nie odpowiadają żadnemu realnemu mapowaniu. */
  orphaned: Array<{ source: string; capability: string }>
  /** Numery slotów użyte więcej niż raz. */
  duplicateSequences: number[]
}

const key = (source: string, capability: string) => `${source}::${capability}`

/**
 * Czysty raport rozjazdu między tym, co wymaga roboty, a tym, co agent
 * wycenił. Nic nie naprawia i nic nie odrzuca - `attachEffortHours` i tak
 * bezpiecznie pomija sieroty; to jest miejsce, w którym rozjazd przestaje
 * być cichy i staje się czymś, co człowiek widzi.
 */
export function auditPlanCoverage(
  mappings: MercatoMappingResult[],
  plan: MigrationPlanResult,
): PlanCoverage {
  const needsWork = mappings.filter((m) => PRICED_DECISIONS.has(m.decision))
  const plannedKeys = new Set(plan.items.map((i) => key(i.source, i.capability)))
  const mappingKeys = new Set(needsWork.map((m) => key(m.source, m.capability)))

  const missing = needsWork
    .filter((m) => !plannedKeys.has(key(m.source, m.capability)))
    .map((m) => ({ source: m.source, capability: m.capability }))

  const orphaned = plan.items
    .filter((i) => !mappingKeys.has(key(i.source, i.capability)))
    .map((i) => ({ source: i.source, capability: i.capability }))

  const seenSequences = new Set<number>()
  const duplicateSequences: number[] = []
  for (const itemEntry of plan.items) {
    if (seenSequences.has(itemEntry.sequence) && !duplicateSequences.includes(itemEntry.sequence)) {
      duplicateSequences.push(itemEntry.sequence)
    }
    seenSequences.add(itemEntry.sequence)
  }

  return { missing, orphaned, duplicateSequences }
}
