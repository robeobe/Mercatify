import { getArchetype, REQUIRED_INVENTORY_STATES, type ScreenArchetype } from './platform'

export interface Epic {
  id: string
  title: string
  outcome: string
}

export interface Story {
  id: string
  epicId: string
  role: string
  goal: string
  outcome: string
  acceptanceCriteria: string[]
}

export interface ScreenEntry {
  id: string
  name: string
  task: string
  archetype: ScreenArchetype
  states: string[]
  storyIds: string[]
  sectionRefs: string[]
}

export interface OmRequirements {
  epics: Epic[]
  stories: Story[]
  screens: ScreenEntry[]
  openQuestions: string[]
  summary: string
}

function fail(path: string, expected: string): never {
  throw new Error(`[mercatify-labs] ${path}: expected ${expected}`)
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'an object')
  return value as Record<string, unknown>
}

function asNonEmptyStrings(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) fail(path, 'a non-empty array of strings')
  value.forEach((entry, i) => {
    if (typeof entry !== 'string' || entry.length === 0) fail(`${path}[${i}]`, 'a non-empty string')
  })
  return value as string[]
}

function requireStrings(entry: Record<string, unknown>, base: string, keys: string[]): void {
  for (const key of keys) {
    if (typeof entry[key] !== 'string' || (entry[key] as string).length === 0) {
      fail(`${base}.${key}`, 'a non-empty string')
    }
  }
}

/**
 * Brama między wynikiem `om_prototyper` a plikiem wymagań, który pojedzie do
 * skilla `om-mockup-prototype`. Sprawdza nie tylko kształt, ale też cztery
 * rzeczy, których skill wymaga wprost, a żaden schemat JSON nie wyrazi:
 *
 * 1. Każda historia ma kryteria akceptacji (krok 1 skilla: bez nich stop).
 * 2. Każde odwołanie - historia do epiku, ekran do historii - trafia w byt,
 *    który naprawdę istnieje w tym samym dokumencie.
 * 3. Inwentarz pokrywa first-run, empty, no-access i no-results (krok 2).
 * 4. Identyfikatory ekranów są unikalne, bo komentarze recenzentów kotwiczą
 *    się na `id="sN"` i kolizja cicho przenosi cudzą uwagę na inny ekran.
 */
export function validateOmRequirements(raw: unknown): OmRequirements {
  const root = asRecord(raw, 'result')

  if (!Array.isArray(root.epics) || root.epics.length === 0) fail('result.epics', 'a non-empty array')
  if (!Array.isArray(root.stories) || root.stories.length === 0) fail('result.stories', 'a non-empty array')
  if (!Array.isArray(root.screens) || root.screens.length === 0) fail('result.screens', 'a non-empty array')
  if (!Array.isArray(root.openQuestions)) fail('result.openQuestions', 'an array')
  if (typeof root.summary !== 'string' || root.summary.length === 0) {
    fail('result.summary', 'a non-empty string')
  }

  const epics: Epic[] = root.epics.map((rawEpic, i) => {
    const base = `epics[${i}]`
    const entry = asRecord(rawEpic, base)
    requireStrings(entry, base, ['id', 'title', 'outcome'])
    return { id: entry.id as string, title: entry.title as string, outcome: entry.outcome as string }
  })
  const epicIds = new Set(epics.map((e) => e.id))

  const stories: Story[] = root.stories.map((rawStory, i) => {
    const base = `stories[${i}]`
    const entry = asRecord(rawStory, base)
    requireStrings(entry, base, ['id', 'epicId', 'role', 'goal', 'outcome'])
    if (!epicIds.has(entry.epicId as string)) {
      throw new Error(`[mercatify-labs] ${base}.epicId: "${entry.epicId}" is not one of the epics`)
    }
    const acceptanceCriteria = asNonEmptyStrings(entry.acceptanceCriteria, `${base}.acceptanceCriteria`)
    return {
      id: entry.id as string,
      epicId: entry.epicId as string,
      role: entry.role as string,
      goal: entry.goal as string,
      outcome: entry.outcome as string,
      acceptanceCriteria,
    }
  })
  const storyIds = new Set(stories.map((s) => s.id))

  const seenScreenIds = new Set<string>()
  const screens: ScreenEntry[] = root.screens.map((rawScreen, i) => {
    const base = `screens[${i}]`
    const entry = asRecord(rawScreen, base)
    requireStrings(entry, base, ['id', 'name', 'task', 'archetype'])

    if (seenScreenIds.has(entry.id as string)) {
      throw new Error(`[mercatify-labs] ${base}.id: duplicate screen id "${entry.id}"`)
    }
    seenScreenIds.add(entry.id as string)

    const spec = getArchetype(entry.archetype as string)
    const states = asNonEmptyStrings(entry.states, `${base}.states`)
    const allowed = new Set([...spec.requiredStates, ...REQUIRED_INVENTORY_STATES])
    for (const state of states) {
      if (!allowed.has(state)) {
        throw new Error(
          `[mercatify-labs] ${base}.states: "${state}" is not a state of the ${spec.archetype} archetype`,
        )
      }
    }

    const cited = asNonEmptyStrings(entry.storyIds, `${base}.storyIds`)
    for (const id of cited) {
      if (!storyIds.has(id)) {
        throw new Error(`[mercatify-labs] ${base}.storyIds: "${id}" is not one of the stories`)
      }
    }

    return {
      id: entry.id as string,
      name: entry.name as string,
      task: entry.task as string,
      archetype: spec.archetype,
      states,
      storyIds: cited,
      sectionRefs: asNonEmptyStrings(entry.sectionRefs, `${base}.sectionRefs`),
    }
  })

  const coveredStates = new Set(screens.flatMap((s) => s.states))
  for (const required of REQUIRED_INVENTORY_STATES) {
    if (!coveredStates.has(required)) {
      throw new Error(
        `[mercatify-labs] result.screens: the inventory covers no "${required}" state (om-mockup-prototype step 2)`,
      )
    }
  }

  return {
    epics,
    stories,
    screens,
    openQuestions: root.openQuestions as string[],
    summary: root.summary,
  }
}
