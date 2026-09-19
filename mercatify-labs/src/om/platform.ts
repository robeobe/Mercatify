import patterns from './backendPatterns.json'

/**
 * Wiedza o Open Mercato pochodzi z pliku, nie z pamięci modelu - to jest
 * żelazna zasada 1 (SPEC.md §2) zastosowana do anatomii ekranu zamiast do
 * katalogu SaaS. Agent WYBIERA archetyp z tej listy; nie opisuje panelu
 * z głowy.
 *
 * Plik startowy zawiera wyłącznie to, co jest zweryfikowane w
 * `references/screen-patterns.md` na gałęzi wskazanej w polu `source`.
 * Rozszerza go człowiek, tak samo jak `catalogData.json`.
 */
export type ScreenArchetype = 'data-table' | 'crud-form' | 'kanban' | 'detail-drawer'

export interface ArchetypeSpec {
  archetype: ScreenArchetype
  label: string
  usedFor: string
  requiredStates: string[]
  anatomyNotes: string[]
}

export const REQUIRED_INVENTORY_STATES: string[] = patterns.requiredInventoryStates
export const TOKEN_RULES: string[] = patterns.tokenRules

export function listArchetypes(): ArchetypeSpec[] {
  return Object.entries(patterns.archetypes).map(([archetype, spec]) => ({
    archetype: archetype as ScreenArchetype,
    ...(spec as Omit<ArchetypeSpec, 'archetype'>),
  }))
}

export function getArchetype(name: string): ArchetypeSpec {
  const spec = (patterns.archetypes as Record<string, unknown>)[name]
  if (!spec) throw new Error(`[mercatify-labs] Unknown Open Mercato screen archetype: ${name}`)
  return { archetype: name as ScreenArchetype, ...(spec as Omit<ArchetypeSpec, 'archetype'>) }
}
