import { aliasesFor, resolveCapabilityAlias } from './catalogAliases'
import { resolveToolAlias } from './catalogToolAliases'
import type { Catalog, CatalogCapabilityEntry } from './types'
import rawCatalog from './catalogData.json'

// Iron rule #1: known SaaS → OM decisions come from this curated matrix via
// lookup, never from live LLM reasoning on the critical path. See
// .ai/specs/2026-09-18-mercatify.md §5.1.
export const catalog: Catalog = rawCatalog as Catalog

/**
 * Nazwa dosłowna, a gdy jej nie ma - jawna tablica aliasów NAZW
 * (`src/catalogToolAliases.ts`). Dwa kroki, oba dokładne, nic pomiędzy: tak
 * samo jak przy zdolnościach w `getCatalogCapability` niżej.
 *
 * Drugi krok istnieje, bo katalog trzyma jeden wpis na dwa produkty
 * (`Jobber / ServiceTitan`) i produkt bez nazwy planu (`HubSpot`), a brief
 * klienta nazywa to `Jobber` i `HubSpot Sales`. Bez tego kroku CAŁE narzędzie
 * wypadało poza katalog na samej nazwie - razem ze wszystkimi swoimi
 * zdolnościami, choć każda z nich w katalogu jest.
 *
 * `Object.hasOwn` na obu krokach: `name` pochodzi z pliku klienta albo z
 * wyjścia modelu, a `catalog['constructor']` oddałby funkcję z prototypu jako
 * "znalezione narzędzie".
 */
export function getCatalogTool(name: string): Catalog[string] | undefined {
  if (Object.hasOwn(catalog, name)) return catalog[name]

  const canonical = resolveToolAlias(name)
  if (canonical === undefined) return undefined
  if (!Object.hasOwn(catalog, canonical)) return undefined
  return catalog[canonical]
}

/**
 * Wyszukanie po kluczu dosłownym, a gdy go nie ma - przez jawną tablicę
 * aliasów (`src/catalogAliases.ts`). Dwa kroki, oba dokładne: slug z `CAPS`
 * albo stary klucz sprzed scalenia katalogów. Nic pomiędzy.
 *
 * `Object.hasOwn` zamiast odczytu wprost, bo `capability` przychodzi z
 * wyjścia modelu: `capabilities['constructor']` oddałoby funkcję z prototypu,
 * a wywołujący (`src/mapCapabilities.ts`) potraktowałby ją jak trafienie w
 * katalog i wpisał do raportu nieistniejący werdykt.
 *
 * Brak trafienia to `undefined` - i tak ma zostać. Na tym stoi obietnica z
 * SPEC.md §6.2: zdolność, której katalog nie zna, wychodzi jako `build` /
 * `low` / `not in catalog`, zamiast zostać dociągnięta do najbliższej znanej.
 */
export function getCatalogCapability(toolName: string, capability: string): CatalogCapabilityEntry | undefined {
  const tool = getCatalogTool(toolName)
  if (!tool) return undefined

  const { capabilities } = tool
  if (Object.hasOwn(capabilities, capability)) return capabilities[capability]

  const canonical = resolveCapabilityAlias(capability)
  if (canonical === undefined) return undefined
  if (!Object.hasOwn(capabilities, canonical)) return undefined
  return capabilities[canonical]
}

export function listCatalogToolNames(): string[] {
  return Object.keys(catalog)
}

/**
 * Wszystkie klucze, na które katalog odpowie dla danego narzędzia: slugi
 * kanoniczne plus te stare klucze, które faktycznie prowadzą do jednego z
 * nich. Alias bez pokrycia w tym narzędziu się nie pojawia - lista ma
 * odpowiadać na pytanie "co tu zadziała", a nie "co kiedyś istniało".
 */
export function listCatalogCapabilityKeys(toolName: string): string[] {
  const tool = getCatalogTool(toolName)
  if (!tool) return []
  const canonical = Object.keys(tool.capabilities)
  return [...canonical, ...canonical.flatMap((slug) => aliasesFor(slug))]
}
