/**
 * Czyste szablony HTML dla podglądu (SPEC.md §11.1). Zero I/O, zero LLM:
 * agent Sandbox Engineer WYBIERA szablon i wypełnia dane, a ten plik jest
 * jedynym miejscem, które decyduje o znacznikach. Wolno generowany HTML z
 * modelu to dokładnie ta niedeterminacja, której zabrania SPEC.md §2.
 */
export type ScreenKind = 'dashboard' | 'list' | 'detail'

/**
 * Para kolumna-wartość. Świadomie NIE `Record<string, string>`: mapa jest
 * niewyrażalna w JSON Schema ze `strict: true`, a `src/llmClient.ts:147`
 * wysyła `strict: true` na każdym wywołaniu agenta.
 */
export interface ScreenCell {
  column: string
  value: string
}

export interface ScreenRow {
  cells: ScreenCell[]
}

export interface ScreenSpec {
  /** Stabilna nazwa pliku bez rozszerzenia, np. "deals". */
  name: string
  kind: ScreenKind
  title: string
  /** Nagłówki kolumn dla 'list' i 'dashboard'. Ignorowane dla 'detail'. */
  columns: string[]
  rows: ScreenRow[]
  /**
   * Kod języka dokumentu (WCAG 2.2 SC 3.1.1). Świadomie OPCJONALNY i
   * kontrolowany przez hosta, nie przez agenta: strict mode zabrania pól
   * opcjonalnych w `resultSchema`, więc dokładanie go do deskryptora
   * zmusiłoby model do zgadywania języka. Domyślnie 'en'.
   */
  lang?: string
}

const DEFAULT_LANG = 'en'

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char])
}

const STYLE = [
  'body{font:14px/1.5 system-ui,sans-serif;margin:0;background:#f6f7f9;color:#111}',
  'header{background:#111;color:#fff;padding:16px 24px;font-weight:600}',
  'main{padding:24px;max-width:960px}',
  'table{border-collapse:collapse;width:100%;background:#fff}',
  'th,td{border:1px solid #e3e5e8;padding:8px 12px;text-align:left}',
  'th{background:#f0f1f3;font-weight:600}',
  'dl{background:#fff;border:1px solid #e3e5e8;padding:16px;margin:0}',
  'dt{font-weight:600;margin-top:8px}',
  'dd{margin:0 0 8px}',
].join('')

/**
 * `columns` rządzi tabelą, nie wiersz. Komórka o niezadeklarowanej kolumnie
 * nie trafia do wyjścia, a zadeklarowana kolumna bez komórki daje pustą
 * komórkę - dzięki temu wiersz o dowolnym kształcie nigdy nie rozjeżdża
 * tabeli ani nie wywala renderu.
 */
function renderTable(spec: ScreenSpec): string {
  const head = spec.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')
  const body = spec.rows
    .map((row) => {
      const byColumn = new Map(row.cells.map((cell) => [cell.column, cell.value]))
      const cells = spec.columns
        .map((column) => `<td>${escapeHtml(byColumn.get(column) ?? '')}</td>`)
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

function renderDefinitions(spec: ScreenSpec): string {
  const pairs = spec.rows
    .flatMap((row) => row.cells)
    .map((cell) => `<dt>${escapeHtml(cell.column)}</dt><dd>${escapeHtml(cell.value)}</dd>`)
    .join('')
  return `<dl>${pairs}</dl>`
}

/**
 * Wybór szablonu. `dashboard` i `list` CELOWO dzielą render tabelaryczny -
 * różni je treść, którą wypełnia je agent (dashboard to pary metryka-wartość,
 * lista to rekordy), nie znaczniki. Zapis przez wyczerpujący `switch` zamiast
 * ternarnego operatora jest świadomy: `renderScreen` jest eksportowane, a jego
 * wejście pochodzi z `parseJsonLoosely`, które zwraca `unknown`. Nieznany
 * `kind` ma rzucić, a nie po cichu wyrenderować się jako lista; `never`
 * wymusza aktualizację tego miejsca przy dokładaniu czwartego szablonu.
 */
function renderContent(spec: ScreenSpec): string {
  switch (spec.kind) {
    case 'detail':
      return renderDefinitions(spec)
    case 'list':
    case 'dashboard':
      return renderTable(spec)
    default: {
      const unknownKind: never = spec.kind
      throw new Error(`[mercatify-labs] Unknown screen kind: ${String(unknownKind)}`)
    }
  }
}

/** Deterministyczny render jednego ekranu. Ten sam spec -> identyczny string. */
export function renderScreen(spec: ScreenSpec): string {
  const content = renderContent(spec)
  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(spec.lang ?? DEFAULT_LANG)}"><head><meta charset="utf-8">`,
    `<title>${escapeHtml(spec.title)}</title>`,
    `<style>${STYLE}</style>`,
    '</head><body>',
    `<header>${escapeHtml(spec.title)}</header>`,
    `<main>${content}</main>`,
    '</body></html>',
  ].join('')
}
