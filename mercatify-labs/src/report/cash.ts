import type { CashPoint, CashSeries, Wave } from './model'

/**
 * Model CZASOWY przepływu gotówki - jedyny w tym repo, który potrafi
 * odtworzyć Figure 2 raportu.
 *
 * Dwa modele, które już tu były, są PŁASKIE i dają inną odpowiedź:
 * `computeTotals` (assets/stack-tool/catalog.js:300) liczy
 * `ceil(oneOff / monthlySaving)`, a `computeScenario`
 * `implementationCost / (netAnnual / 12)`. Dla liczb Voltixa oba mówią
 * ~10,3 miesiąca. Raport mówi 15 - i raport ma rację, bo pyta o co innego:
 * nie "ile razy oszczędność mieści się w koszcie", tylko "kiedy stan konta
 * wraca nad kreskę". Pieniądz wychodzi, kiedy trwa praca; wchodzi dopiero,
 * gdy licencja faktycznie gaśnie.
 *
 * ŻADNA z tych trzech liczb nie jest błędna i żadnej nie zastępujemy -
 * `computeScenario.netPaybackMonths` zostaje nietknięte. Raport pokazuje obie
 * i nazywa różnicę ("Two payback numbers, and why they differ").
 */

/** Horyzont raportu. 36 miesięcy, bo tyle pokazuje kafelek "36-month net". */
export const DEFAULT_HORIZON_MONTHS = 36

export interface CashInput {
  waves: Wave[]
  /** Stawka blended za godzinę. */
  rate: number
  /** Koszt utrzymania platformy, naliczany od miesiąca 1. */
  hostingMonthly: number
  horizonMonths?: number
}

/** Miesiące, w których fala pochłania budżet. Oba końce włącznie, liczone od 1. */
export interface WaveSpendWindow {
  waveNumber: number
  startMonth: number
  endMonth: number
}

function assertPositiveInt(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `[mercatify-labs] computeCashSeries: ${field} must be a positive whole number, got ${JSON.stringify(value)}`,
    )
  }
}

function assertNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `[mercatify-labs] computeCashSeries: ${field} must be a non-negative finite number, got ${JSON.stringify(value)}`,
    )
  }
}

/**
 * Brama na fale. `Wave[]` jest typowane, ale obie funkcje tego pliku są
 * EKSPORTOWANE i host wchodzi w nie własnym JSON-em - typ nie jest tu obroną.
 *
 * Trzy awarie, które ta brama zamienia z cichych w głośne, wszystkie
 * zmierzone na realnym wywołaniu:
 *
 * 1. POWTÓRZONE `n`. `planWaveSpendWindows` poprawnie robiło dwa okna, ale
 *    `new Map(windows.map(w => [w.waveNumber, w]))` nadpisywało pierwsze
 *    drugim: obie fale lądowały w jednym miesiącu, a poprzedni zostawał bez
 *    wydatku i bez etykiety. Wykres wychodził przesunięty w czasie, bez
 *    jednego słowa błędu. Duplikat `n` to trywialna pomyłka przy kopiowaniu
 *    fali.
 * 2. `hours: NaN`. `cumulative` zamieniało się w `NaN` od tego miesiąca w
 *    dół, a ponieważ `NaN < x` jest zawsze fałszem, `reduce` liczący dno
 *    ZAMRAŻAŁ się na stanie sprzed zanieczyszczenia i oddawał
 *    `maxExposure: 0, maxExposureMonth: 0` - czyli "brak ryzyka, już w M0"
 *    zamiast prawdziwego dna.
 * 3. `hours: -50`. Koszt fali wychodził ujemny, więc w jej miesiącu
 *    `monthlyNet` robił się DODATNI - praca zamieniała się w zysk.
 *
 * Sprawdzamy też `weekFrom`, którego arytmetyka nie używa (liczy z `weekTo`):
 * bez tego `{weekFrom: 10, weekTo: 2}` przechodziło, a fala chronologicznie
 * wcześniejsza z wyższym `n` lądowała na końcu wykresu, bo
 * `Math.max(proportional, startMonth)` maskował niespójność zamiast ją
 * zgłosić.
 */
function assertWaves(waves: readonly Wave[]): void {
  const seen = new Set<number>()
  for (const wave of waves) {
    const label = `wave ${JSON.stringify(wave.n)}`
    assertPositiveInt(wave.n, `${label}: n`)
    if (seen.has(wave.n)) {
      throw new Error(
        `[mercatify-labs] computeCashSeries: two waves share n=${wave.n}. ` +
          `Wave numbers key the spend calendar, so a duplicate silently drops one wave's budget.`,
      )
    }
    seen.add(wave.n)
    assertPositiveInt(wave.weekFrom, `${label}: weekFrom`)
    assertPositiveInt(wave.weekTo, `${label}: weekTo`)
    if (wave.weekFrom > wave.weekTo) {
      throw new Error(
        `[mercatify-labs] computeCashSeries: ${label} runs from week ${wave.weekFrom} to week ${wave.weekTo} - backwards.`,
      )
    }
    assertNonNegative(wave.hours, `${label}: hours`)
    assertPositiveInt(wave.bankedFromMonth, `${label}: bankedFromMonth`)
    if (wave.monthlyBanked !== null) assertNonNegative(wave.monthlyBanked, `${label}: monthlyBanked`)
  }

  // Numer fali MUSI iść w parze z kalendarzem: `n` kluczuje okna wydatku, a
  // `weekTo` decyduje, kiedy okno wypada. Rozjazd zgłaszamy, zamiast po cichu
  // przesortować - jeśli fala 2 kończy się przed falą 1, to dane są błędne,
  // a nie tylko nieuporządkowane.
  const byNumber = [...waves].sort((a, b) => a.n - b.n)
  for (let i = 1; i < byNumber.length; i += 1) {
    if (byNumber[i].weekTo < byNumber[i - 1].weekTo) {
      throw new Error(
        `[mercatify-labs] computeCashSeries: wave ${byNumber[i].n} ends in week ${byNumber[i].weekTo}, ` +
          `before wave ${byNumber[i - 1].n} ends in week ${byNumber[i - 1].weekTo}. ` +
          `Wave numbers must follow the calendar.`,
      )
    }
  }
}

/**
 * Rozkłada fale na miesiące kalendarza programu.
 *
 * Reguła, odtworzona z Figure 2 złotego raportu i zweryfikowana testem na
 * wszystkich 25 punktach jego serii:
 *
 *   1. program trwa `ceil(sumaTygodni / 4)` miesięcy,
 *   2. udział fali w kalendarzu jest proporcjonalny do jej udziału w
 *      tygodniach - koniec fali wypada w miesiącu
 *      `round(jejOstatniTydzien / sumaTygodni * dlugoscProgramu)`,
 *   3. fala zaczyna wydawać w miesiącu po zakończeniu poprzedniej.
 *
 * Dla Voltixa (22 tygodnie, 4 fale) daje to M1 / M2-M3 / M4 / M5-M6, czyli
 * dokładnie 3600 / 3300 / 3600 / 2700 na miesiąc.
 *
 * Eksportowane osobno, bo `groupIntoWaves` musi liczyć `bankedFromMonth` tą
 * SAMĄ regułą (`endMonth + 1`). Dwie kopie tej arytmetyki rozjechałyby się
 * przy pierwszej zmianie długości fali.
 */
export function planWaveSpendWindows(waves: readonly Wave[]): WaveSpendWindow[] {
  if (waves.length === 0) return []
  assertWaves(waves)

  const ordered = [...waves].sort((a, b) => a.n - b.n)
  const totalWeeks = ordered.reduce((max, wave) => Math.max(max, wave.weekTo), 0)
  if (totalWeeks <= 0) {
    throw new Error(
      '[mercatify-labs] planWaveSpendWindows: no wave declares a positive weekTo - the programme has no calendar.',
    )
  }
  const programmeMonths = Math.ceil(totalWeeks / 4)

  const windows: WaveSpendWindow[] = []
  let previousEnd = 0
  for (const wave of ordered) {
    const proportional = Math.round((wave.weekTo / totalWeeks) * programmeMonths)
    // Każda fala zajmuje CO NAJMNIEJ jeden miesiąc i nigdy nie cofa
    // kalendarza: dwie krótkie fale w jednym miesiącu kalendarzowym nadal
    // wydają budżet po kolei, bo inaczej `endMonth` spadłby poniżej
    // `startMonth` i pętla wydatku nie wykonałaby ani jednej iteracji.
    const startMonth = previousEnd + 1
    const endMonth = Math.max(proportional, startMonth)
    windows.push({ waveNumber: wave.n, startMonth, endMonth })
    previousEnd = endMonth
  }
  return windows
}

/**
 * Etykieta kamienia milowego. Deterministyczna, wyprowadzona z FAKTÓW (która
 * fala się domknęła, gdzie wypada dno, kiedy przecinamy zero) - to nie jest
 * proza agenta i nie przechodzi przez `assertNoFigures`.
 */
function milestoneFor(
  month: number,
  waveEndingHere: number | undefined,
  totalWaves: number,
  isMaxExposure: boolean,
  isBreakEven: boolean,
  fullRunRateMonth: number,
  horizonMonths: number,
): string {
  if (isBreakEven) return 'Break-even'
  if (waveEndingHere !== undefined && isMaxExposure) {
    return `All ${totalWaves} waves delivered - maximum exposure`
  }
  if (isMaxExposure) return 'Maximum exposure'
  if (waveEndingHere !== undefined) return `Wave ${waveEndingHere} delivered`
  if (month === fullRunRateMonth) return 'Full run rate reached'
  if (month === 12) return 'End of year 1'
  if (month === 24 && horizonMonths > 24) return 'End of year 2'
  if (month === horizonMonths) return `End of month ${horizonMonths}`
  if (month === 0) return 'Programme start'
  return ''
}

/**
 * Buduje pełną serię od M0 do horyzontu.
 *
 * Kwoty są zaokrąglane do pełnych jednostek waluty DOPIERO przy zapisie
 * punktu, a reszta z dzielenia kosztu fali ląduje w jej ostatnim miesiącu -
 * dzięki temu suma wydatków po całym programie równa się co do jednostki
 * `hours * rate`, a nie "prawie".
 *
 * ZASTRZEŻENIE, zmierzone: ta gwarancja trzyma tylko dla CAŁKOWITEGO kosztu
 * fali. Przy `rate = 118.75` i `hours = 31` dokładny koszt to 3681,25, a suma
 * serii daje 3681 - rozjazd ćwierć jednostki, bo `Math.round` na punkcie nie
 * ma gdzie odłożyć reszty. Stawki ułamkowe są w tej dziedzinie rzadkie, ale
 * jeśli wejdą, trzeba je zaokrąglić NA GRANICY funkcji, a nie liczyć na to,
 * że reszta się znajdzie. Test "no rounding drift" chodzi po całkowitych
 * wejściach i tego przypadku nie złapie.
 */
export function computeCashSeries(input: CashInput): CashSeries {
  const horizonMonths = input.horizonMonths ?? DEFAULT_HORIZON_MONTHS
  assertPositiveInt(horizonMonths, 'horizonMonths')
  if (!Number.isFinite(input.rate) || input.rate < 0) {
    throw new Error(
      `[mercatify-labs] computeCashSeries: rate must be a non-negative number, got ${JSON.stringify(input.rate)}`,
    )
  }
  if (!Number.isFinite(input.hostingMonthly) || input.hostingMonthly < 0) {
    throw new Error(
      `[mercatify-labs] computeCashSeries: hostingMonthly must be a non-negative number, got ${JSON.stringify(input.hostingMonthly)}`,
    )
  }

  assertWaves(input.waves)
  const ordered = [...input.waves].sort((a, b) => a.n - b.n)
  const windows = planWaveSpendWindows(ordered)
  const windowByWave = new Map(windows.map((w) => [w.waveNumber, w]))

  // Wydatek per miesiąc, z resztą doklejoną do ostatniego miesiąca fali.
  const spendByMonth = new Map<number, number>()
  const waveEndingAt = new Map<number, number>()
  for (const wave of ordered) {
    const window = windowByWave.get(wave.n)
    if (window === undefined) continue
    waveEndingAt.set(window.endMonth, wave.n)
    const cost = wave.hours * input.rate
    const span = window.endMonth - window.startMonth + 1
    const perMonth = Math.round(cost / span)
    for (let month = window.startMonth; month <= window.endMonth; month += 1) {
      const isLast = month === window.endMonth
      const amount = isLast ? cost - perMonth * (span - 1) : perMonth
      spendByMonth.set(month, (spendByMonth.get(month) ?? 0) + amount)
    }
  }

  const fullRunRateMonth = ordered.reduce((max, w) => Math.max(max, w.bankedFromMonth), 0)

  // Przebieg 1: same liczby. Etykiety dopiero potem, bo "maximum exposure"
  // i "break-even" da się nazwać dopiero, gdy zna się całą serię.
  const raw: Array<{ month: number; monthlyNet: number; cumulative: number }> = []
  let cumulative = 0
  raw.push({ month: 0, monthlyNet: 0, cumulative: 0 })
  for (let month = 1; month <= horizonMonths; month += 1) {
    const banked = ordered.reduce(
      (sum, wave) => (month >= wave.bankedFromMonth ? sum + (wave.monthlyBanked ?? 0) : sum),
      0,
    )
    const monthlyNet = Math.round(banked - input.hostingMonthly - (spendByMonth.get(month) ?? 0))
    cumulative += monthlyNet
    raw.push({ month, monthlyNet, cumulative })
  }

  const maxExposurePoint = raw.reduce((lowest, point) =>
    point.cumulative < lowest.cumulative ? point : lowest,
  )
  // Przecięcie zera liczy się tylko PO tym, jak pozycja zeszła pod kreskę -
  // bez tego program, który nigdy nic nie kosztuje, "przecinałby zero" w M0.
  const breakEvenPoint =
    maxExposurePoint.cumulative < 0
      ? raw.find((point) => point.month > maxExposurePoint.month && point.cumulative >= 0)
      : undefined

  const points: CashPoint[] = raw.map((point) => ({
    month: point.month,
    monthlyNet: point.monthlyNet,
    cumulative: point.cumulative,
    milestone: milestoneFor(
      point.month,
      waveEndingAt.get(point.month),
      ordered.length,
      point.month === maxExposurePoint.month && maxExposurePoint.cumulative < 0,
      breakEvenPoint !== undefined && point.month === breakEvenPoint.month,
      fullRunRateMonth,
      horizonMonths,
    ),
  }))

  return {
    points,
    horizonMonths,
    maxExposure: maxExposurePoint.cumulative,
    maxExposureMonth: maxExposurePoint.month,
    breakEvenMonth: breakEvenPoint?.month ?? null,
    netAtHorizon: raw[raw.length - 1].cumulative,
  }
}
