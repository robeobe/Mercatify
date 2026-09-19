/**
 * Wspólny strażnik strict mode dla deskryptorów agentów.
 *
 * `src/llmClient.ts:147` wysyła `json_schema: { strict: true, schema:
 * agent.resultSchema }` przy KAŻDYM wywołaniu. Strict mode wymaga, żeby każdy
 * obiekt domykał się przez `additionalProperties: false` i wymieniał wszystkie
 * właściwości w `required`, oraz zabrania map (`additionalProperties` o
 * kształcie schematu). Ten plik jest JEDYNĄ kopią tej logiki - trzy deskryptory
 * ścieżki A importują ją zamiast przeklejać, żeby wzmocnienie strażnika nie
 * wymagało trzech identycznych edycji, które mogą się po cichu rozjechać.
 *
 * Nie jest zbierany przez Jest: `testMatch` to `**\/__tests__\/**\/*.test.ts`,
 * a ten plik nie kończy się na `.test.ts`.
 */

type Json = Record<string, any>

const FORBIDDEN_KEYWORDS = [
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minItems',
  'maxItems',
  'uniqueItems',
  'prefixItems',
] as const

function isPlainObject(node: unknown): node is Json {
  return !!node && typeof node === 'object' && !Array.isArray(node)
}

/**
 * Obiekt rozpoznajemy po OBECNOŚCI `properties`, nie po `type === 'object'`.
 * Schemat bez jawnego `type`, za to z mapą w `additionalProperties`, jest
 * dokładnie tym kształtem, którego zabraniają Global Constraints (R2) - a
 * sprawdzanie po `type` przepuszczało go bez słowa.
 */
export function assertStrictModeCompatible(node: unknown, path = 'root'): void {
  if (!isPlainObject(node)) return

  const looksLikeObject = node.type === 'object' || isPlainObject(node.properties)
  if (looksLikeObject) {
    const props = Object.keys(node.properties ?? {})
    expect({ path, additionalProperties: node.additionalProperties }).toEqual({
      path,
      additionalProperties: false,
    })
    expect({ path, required: [...(node.required ?? [])].sort() }).toEqual({
      path,
      required: [...props].sort(),
    })
    for (const key of props) assertStrictModeCompatible(node.properties[key], `${path}.${key}`)
  }

  // Mapa w `additionalProperties` jest zakazana GDZIEKOLWIEK, nie tylko pod
  // węzłem rozpoznanym jako obiekt.
  if (isPlainObject(node.additionalProperties)) {
    throw new Error(
      `[strict-mode] ${path}.additionalProperties jest mapą (schematem), a strict mode tego zabrania`,
    )
  }

  /**
   * Słowa kluczowe SPOZA podzbioru strict mode. Dokumentacja Structured
   * Outputs wyłącza je wprost (String: `minLength`, `maxLength`, `pattern`,
   * `format`; Array: `minItems`, `maxItems`, `uniqueItems`, `prefixItems`), a
   * API ODRZUCA taki schemat błędem 400 zamiast go zignorować. LM Studio jest
   * pobłażliwe, więc lokalnie nic nie boli - aż do chwili, w której ktoś
   * ustawi `LLM_BASE_URL=https://api.openai.com/v1`, co kontrakt CLI wystawia
   * jako udokumentowaną zmienną.
   *
   * Strażnik, który sprawdza tylko `additionalProperties` i `required`,
   * certyfikuje "zgodność ze strict mode", której nie weryfikuje - a to gorsze
   * niż brak strażnika, bo pozwala odhaczyć punkt "Done when".
   *
   * Gwarancje, które te słowa miały dawać, żyją w czystych walidatorach
   * (`validateScreens`, `validateCritique`, `validateQaResult`) - tam, gdzie
   * i tak muszą być, bo `strict: true` to prośba do serwera, nie gwarancja.
   */
  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (node[keyword] !== undefined) {
      throw new Error(
        `[strict-mode] ${path}.${keyword} nie nalezy do podzbioru strict mode - API odrzuci ten schemat`,
      )
    }
  }

  if (node.items !== undefined) assertStrictModeCompatible(node.items, `${path}[]`)

  // Kombinatory: bez tej rekursji otwarty obiekt schowany pod `anyOf`
  // przechodził niezauważony.
  for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branches = node[keyword]
    if (Array.isArray(branches)) {
      branches.forEach((branch, i) => assertStrictModeCompatible(branch, `${path}.${keyword}[${i}]`))
    }
  }

  // Definicje nazwane - tak samo muszą być domknięte.
  for (const keyword of ['$defs', 'definitions'] as const) {
    const defs = node[keyword]
    if (isPlainObject(defs)) {
      for (const key of Object.keys(defs)) {
        assertStrictModeCompatible(defs[key], `${path}.${keyword}.${key}`)
      }
    }
  }
}
