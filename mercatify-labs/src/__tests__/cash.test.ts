/** @jest-environment node */
import { computeCashSeries, planWaveSpendWindows } from '../report/cash'
import type { Wave } from '../report/model'

const wave = (over: Partial<Wave> & Pick<Wave, 'n' | 'weekFrom' | 'weekTo' | 'hours'>): Wave => ({
  title: `Wave ${over.n}`,
  hoursAreFloor: false,
  scope: [],
  toolsOff: [],
  toolsReduced: [],
  monthlyBanked: 0,
  bankedFromMonth: 1,
  ...over,
})

/**
 * Cztery fale Voltixa dokładnie tak, jak opisuje je sekcja 06 złotego
 * raportu (`src/__tests__/fixtures/voltix.golden.html`).
 */
const VOLTIX_WAVES: Wave[] = [
  wave({ n: 1, weekFrom: 1, weekTo: 4, hours: 30, monthlyBanked: 389, bankedFromMonth: 2 }),
  wave({ n: 2, weekFrom: 5, weekTo: 10, hours: 55, monthlyBanked: 890, bankedFromMonth: 4 }),
  wave({ n: 3, weekFrom: 11, weekTo: 16, hours: 30, monthlyBanked: 349, bankedFromMonth: 5 }),
  wave({ n: 4, weekFrom: 17, weekTo: 22, hours: 45, monthlyBanked: 415, bankedFromMonth: 7 }),
]

/**
 * Seria przepisana ZNAK W ZNAK z tablicy `months` w `<script>` złotego
 * raportu. To jest test, który odpowiada na jedyne pytanie, jakie ma sens
 * zadać temu plikowi: czy nasz model to ten sam model, który napisał raport.
 */
const GOLDEN_CUMULATIVE: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1, -3780], [2, -6871], [3, -9962], [4, -12463], [5, -13715], [6, -14967],
  [7, -13104], [8, -11241], [9, -9378], [10, -7515], [11, -5652], [12, -3789],
  [13, -1926], [14, -63], [15, 1800], [16, 3663], [17, 5526], [18, 7389],
  [19, 9252], [20, 11115], [21, 12978], [22, 14841], [23, 16704], [24, 18567],
]

describe('planWaveSpendWindows', () => {
  it('lands the Voltix waves on M1 / M2-M3 / M4 / M5-M6', () => {
    expect(planWaveSpendWindows(VOLTIX_WAVES)).toEqual([
      { waveNumber: 1, startMonth: 1, endMonth: 1 },
      { waveNumber: 2, startMonth: 2, endMonth: 3 },
      { waveNumber: 3, startMonth: 4, endMonth: 4 },
      { waveNumber: 4, startMonth: 5, endMonth: 6 },
    ])
  })

  it('agrees with every bankedFromMonth in the golden report - saving starts the month after the wave ends', () => {
    const windows = planWaveSpendWindows(VOLTIX_WAVES)
    for (const w of VOLTIX_WAVES) {
      const window = windows.find((x) => x.waveNumber === w.n)
      expect(window).toBeDefined()
      expect(w.bankedFromMonth).toBe((window as { endMonth: number }).endMonth + 1)
    }
  })

  it('returns nothing for no waves', () => {
    expect(planWaveSpendWindows([])).toEqual([])
  })

  it('never lets a wave end before it starts', () => {
    const windows = planWaveSpendWindows([
      wave({ n: 1, weekFrom: 1, weekTo: 1, hours: 4 }),
      wave({ n: 2, weekFrom: 2, weekTo: 2, hours: 4 }),
      wave({ n: 3, weekFrom: 3, weekTo: 3, hours: 4 }),
    ])
    for (const w of windows) expect(w.endMonth).toBeGreaterThanOrEqual(w.startMonth)
  })
})

describe('computeCashSeries - the golden Voltix run', () => {
  const series = computeCashSeries({ waves: VOLTIX_WAVES, rate: 120, hostingMonthly: 180 })

  it.each(GOLDEN_CUMULATIVE)('reproduces month %i at %i', (month, cumulative) => {
    const point = series.points.find((p) => p.month === month)
    expect(point).toBeDefined()
    expect((point as { cumulative: number }).cumulative).toBe(cumulative)
  })

  it('reports the headline figures the report prints', () => {
    expect(series.maxExposure).toBe(-14967)
    expect(series.maxExposureMonth).toBe(6)
    expect(series.breakEvenMonth).toBe(15)
    expect(series.netAtHorizon).toBe(40923) // "36-month net +$40,923"
    expect(series.horizonMonths).toBe(36)
  })

  it('reaches the full run rate of +1863 a month from month 7', () => {
    for (const month of [7, 12, 24, 36]) {
      expect(series.points.find((p) => p.month === month)?.monthlyNet).toBe(1863)
    }
  })

  it('spends exactly hours x rate over the programme - no rounding drift', () => {
    const totalHours = VOLTIX_WAVES.reduce((s, w) => s + w.hours, 0)
    const bankedThroughM6 = series.points
      .filter((p) => p.month >= 1 && p.month <= 6)
      .reduce((sum, p) => sum + p.monthlyNet, 0)
    const savingsThroughM6 = VOLTIX_WAVES.reduce(
      (sum, w) => sum + (w.monthlyBanked ?? 0) * Math.max(0, 6 - w.bankedFromMonth + 1),
      0,
    )
    const hosting = 180 * 6
    expect(savingsThroughM6 - hosting - bankedThroughM6).toBe(totalHours * 120) // 160 h x 120 = 19 200
  })

  it('labels the milestones the report labels', () => {
    const at = (m: number) => series.points.find((p) => p.month === m)?.milestone
    expect(at(1)).toBe('Wave 1 delivered')
    expect(at(6)).toBe('All 4 waves delivered - maximum exposure')
    expect(at(7)).toBe('Full run rate reached')
    expect(at(12)).toBe('End of year 1')
    expect(at(15)).toBe('Break-even')
  })
})

describe('computeCashSeries - edge cases', () => {
  it('S6: never breaks even when hosting outruns the saving', () => {
    const series = computeCashSeries({
      waves: [wave({ n: 1, weekFrom: 1, weekTo: 4, hours: 10, monthlyBanked: 50, bankedFromMonth: 2 })],
      rate: 120,
      hostingMonthly: 400,
    })
    expect(series.breakEvenMonth).toBeNull()
    expect(series.netAtHorizon).toBeLessThan(0)
  })

  it('S7: no waves means no spend - the series is flat at minus hosting', () => {
    const series = computeCashSeries({ waves: [], rate: 120, hostingMonthly: 180, horizonMonths: 3 })
    expect(series.points.map((p) => p.cumulative)).toEqual([0, -180, -360, -540])
    expect(series.breakEvenMonth).toBeNull()
  })

  it('breakEvenMonth is null, never Infinity - JSON.stringify(Infinity) is a silent null', () => {
    const series = computeCashSeries({ waves: [], rate: 120, hostingMonthly: 1, horizonMonths: 2 })
    expect(JSON.parse(JSON.stringify(series)).breakEvenMonth).toBeNull()
  })

  it('rejects a nonsense horizon rather than looping oddly', () => {
    expect(() => computeCashSeries({ waves: [], rate: 1, hostingMonthly: 0, horizonMonths: 0 })).toThrow(
      /horizonMonths/,
    )
  })

  it('rejects a negative rate', () => {
    expect(() => computeCashSeries({ waves: [], rate: -1, hostingMonthly: 0 })).toThrow(/rate/)
  })
})

describe('computeCashSeries - input gates found in review', () => {
  it('rejects two waves sharing a number - the duplicate silently dropped one budget', () => {
    expect(() =>
      computeCashSeries({
        waves: [
          wave({ n: 2, weekFrom: 1, weekTo: 4, hours: 70 }),
          wave({ n: 2, weekFrom: 5, weekTo: 8, hours: 70 }),
        ],
        rate: 10,
        hostingMonthly: 0,
      }),
    ).toThrow(/share n=2/)
  })

  it('rejects NaN hours - they froze maxExposure at 0, reading as "no risk"', () => {
    expect(() =>
      computeCashSeries({
        waves: [wave({ n: 1, weekFrom: 1, weekTo: 4, hours: Number.NaN })],
        rate: 120,
        hostingMonthly: 180,
      }),
    ).toThrow(/hours/)
  })

  it('rejects negative hours - they turned the work into a profit', () => {
    expect(() =>
      computeCashSeries({
        waves: [wave({ n: 1, weekFrom: 1, weekTo: 4, hours: -50 })],
        rate: 120,
        hostingMonthly: 180,
      }),
    ).toThrow(/hours/)
  })

  it('rejects a wave that runs backwards', () => {
    expect(() =>
      computeCashSeries({
        waves: [wave({ n: 1, weekFrom: 10, weekTo: 2, hours: 10 })],
        rate: 120,
        hostingMonthly: 0,
      }),
    ).toThrow(/backwards/)
  })

  it('rejects wave numbers that contradict the calendar', () => {
    expect(() =>
      computeCashSeries({
        waves: [
          wave({ n: 1, weekFrom: 15, weekTo: 24, hours: 10 }),
          wave({ n: 2, weekFrom: 1, weekTo: 14, hours: 10 }),
        ],
        rate: 120,
        hostingMonthly: 0,
      }),
    ).toThrow(/must follow the calendar/)
  })

  it('gates planWaveSpendWindows too - it is exported and a host calls it directly', () => {
    expect(() =>
      planWaveSpendWindows([
        wave({ n: 1, weekFrom: 1, weekTo: 4, hours: 10 }),
        wave({ n: 1, weekFrom: 5, weekTo: 8, hours: 10 }),
      ]),
    ).toThrow(/share n=1/)
  })
})
