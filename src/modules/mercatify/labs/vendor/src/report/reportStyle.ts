/**
 * CSS raportu - JEDNA stała, wklejana w <style> dokumentu.
 *
 * Arkusz jest przepisany ze złotego raportu
 * (`src/__tests__/fixtures/voltix.golden.html`) i celowo trzymany w jednym
 * kawałku zamiast składany z fragmentów per sekcja: dokument jedzie MAILEM,
 * więc nie ma drugiego żądania, w którym mógłby dojechać brakujący fragment.
 * Z tego samego powodu w wyjściu nie ma ani jednego <link> - golden ciągnie
 * Geista z jsdelivr, a raport w skrzynce odbiorczej nie ma jak tego pobrać
 * (i nie powinien wołać do sieci u czytelnika). Łańcuch zapasowy fontów w
 * `body` i `.mono` był w goldenie od początku i to on tu pracuje.
 *
 * Dwie RÓŻNICE względem goldena, obie świadome:
 *  1. `.chip--drop` - werdykt `drop` istnieje w katalogu i w `ReportVerdict`,
 *     ale u Voltixa nie wypadł ani razu, więc golden nie ma dla niego reguły.
 *     Bez niej chip renderowałby się bez tła, czyli nieczytelnie.
 *  2. Brak wspomnianych <link> do fontów.
 */
export const REPORT_STYLE: string = `

  /* Palette and type inherited from the Mercatify site (openmercato.com tokens, Geist). */
  :root {
    --bg: #FFFFFF;
    --surface: #FAFAFA;
    --surface-2: #ECECEC;
    --ink: #0C0C0C;
    --ink-2: #6D6D6D;
    --ink-3: #9E9E9E;
    --rule: #ECECEC;
    --rule-strong: #C8C8C8;
    --accent: #B4F372;
    --accent-ink: #0C0C0C;
    --accent-text: #2F520B;
    --accent-soft: #F6FEEE;
    --violet: #BC9AFF;
    --yellow: #EEFB63;

    /* Chart categorical steps — validated: lightness band, chroma floor,
       CVD separation, normal-vision floor and contrast all pass on this surface. */
    --cat-native: #3F7D20;
    --cat-configure: #6D42C8;
    --cat-build: #A8830F;
    --cat-integrate: #0C7D9E;
    --cat-unknown: #9E9E9E;
    --grid: #E4E4E4;

    color-scheme: light;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0C0C0C;
      --surface: #111111;
      --surface-2: #1F1F1F;
      --ink: #FAFAFA;
      --ink-2: #9E9E9E;
      --ink-3: #6D6D6D;
      --rule: #1F1F1F;
      --rule-strong: #303030;
      --accent: #B4F372;
      --accent-ink: #0C0C0C;
      --accent-text: #B4F372;
      --accent-soft: #16210D;
      --cat-native: #61A833;
      --cat-configure: #9169E0;
      --cat-build: #B8891A;
      --cat-integrate: #1C94B0;
      --cat-unknown: #6D6D6D;
      --grid: #242424;
      color-scheme: dark;
    }
  }

  :root[data-theme="dark"] {
    --bg: #0C0C0C;
    --surface: #111111;
    --surface-2: #1F1F1F;
    --ink: #FAFAFA;
    --ink-2: #9E9E9E;
    --ink-3: #6D6D6D;
    --rule: #1F1F1F;
    --rule-strong: #303030;
    --accent-text: #B4F372;
    --accent-soft: #16210D;
    --cat-native: #61A833;
    --cat-configure: #9169E0;
    --cat-build: #B8891A;
    --cat-integrate: #1C94B0;
    --cat-unknown: #6D6D6D;
    --grid: #242424;
    color-scheme: dark;
  }

  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }

  body {
    margin: 0;
    background: var(--surface-2);
    color: var(--ink);
    font-family: "Geist Sans", "Geist", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  a { color: var(--accent-text); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

  h1, h2, h3, h4 { margin: 0; letter-spacing: -0.026em; line-height: 1.15; font-weight: 600; text-wrap: balance; }
  h1 { font-size: clamp(1.9rem, 4.4vw, 2.9rem); line-height: 1.05; }
  h2 { font-size: clamp(1.25rem, 2.4vw, 1.6rem); }
  h3 { font-size: 1.02rem; }
  h4 { font-size: .92rem; }
  p { margin: 0; }

  .mono, .num { font-family: "Geist Mono", ui-monospace, SFMono-Regular, Consolas, monospace; font-variant-numeric: tabular-nums; }

  /* ---------- document shell ---------- */
  .toolbar {
    position: sticky; top: 0; z-index: 30;
    background: var(--bg); border-bottom: 1px solid var(--rule);
  }
  .toolbar__inner {
    max-width: 62rem; margin: 0 auto; padding: 11px 24px;
    display: flex; align-items: center; gap: 12px 20px; flex-wrap: wrap;
  }
  .brand { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 1.02rem; letter-spacing: -0.035em; color: var(--ink); text-decoration: none; margin-right: auto; }
  .brand__mark { width: 21px; height: 21px; border-radius: 5px; background: var(--accent); display: grid; place-items: center; color: var(--accent-ink); font-size: .72rem; font-weight: 700; letter-spacing: 0; }
  .toolbar__note { font-family: "Geist Mono", monospace; font-size: .72rem; color: var(--ink-3); }
  .btn { display: inline-flex; align-items: center; gap: 7px; padding: 8px 15px; border-radius: .5rem; font-size: .86rem; font-weight: 600; font-family: inherit; text-decoration: none; border: 1px solid transparent; cursor: pointer; white-space: nowrap; }
  .btn--primary { background: var(--accent); color: var(--accent-ink); }
  .btn--primary:hover { filter: brightness(1.08); }
  .btn--ghost { border-color: var(--rule-strong); color: var(--ink); background: transparent; }
  .btn--ghost:hover { background: var(--surface-2); }

  .doc { max-width: 62rem; margin: 26px auto 60px; background: var(--bg); border: 1px solid var(--rule); border-radius: .75rem; overflow: hidden; }
  .pad { padding: 44px 48px; }
  @media (max-width: 680px) { .pad { padding: 30px 22px; } }

  .band { border-top: 1px solid var(--rule); }

  /* ---------- cover ---------- */
  .cover { background: var(--surface); border-bottom: 1px solid var(--rule); }
  .eyebrow { display: inline-block; font-family: "Geist Mono", monospace; font-size: .7rem; letter-spacing: .13em; text-transform: uppercase; color: var(--ink-3); }
  .cover h1 { margin-top: 16px; max-width: 18ch; }
  .cover .lede { margin-top: 18px; font-size: clamp(1rem, 1.7vw, 1.14rem); color: var(--ink-2); max-width: 58ch; line-height: 1.5; }

  .meta { margin: 34px 0 0; padding-top: 22px; border-top: 1px solid var(--rule-strong); display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px 24px; }
  .meta dt { font-family: "Geist Mono", monospace; font-size: .66rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); margin: 0 0 5px; }
  .meta dd { margin: 0; font-weight: 600; font-size: .9rem; }
  .meta dd span { display: block; font-weight: 400; color: var(--ink-2); font-size: .82rem; }

  .confidential { margin-top: 26px; font-family: "Geist Mono", monospace; font-size: .7rem; letter-spacing: .05em; color: var(--ink-3); border: 1px dashed var(--rule-strong); border-radius: .4rem; padding: 9px 13px; display: inline-block; }

  /* ---------- section headings ---------- */
  .sec__no { font-family: "Geist Mono", monospace; font-size: .7rem; letter-spacing: .12em; color: var(--accent-text); text-transform: uppercase; }
  .sec__head { margin-bottom: 22px; }
  .sec__head h2 { margin-top: 10px; max-width: 26ch; }
  .sec__head p { margin-top: 12px; color: var(--ink-2); max-width: 64ch; font-size: .96rem; }

  /* ---------- key numbers ---------- */
  /* Exactly six tiles — 3x2 so the grid never leaves a bare cell. */
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: .6rem; overflow: hidden; }
  @media (max-width: 760px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 440px) { .kpis { grid-template-columns: 1fr; } }
  .kpi { background: var(--bg); padding: 17px 18px; }
  .kpi__k { font-family: "Geist Mono", monospace; font-size: .64rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); display: block; margin-bottom: 7px; }
  .kpi__v { font-size: 1.62rem; font-weight: 600; letter-spacing: -0.035em; font-variant-numeric: tabular-nums; display: block; line-height: 1.05; }
  .kpi__v small { font-size: .74rem; font-weight: 500; color: var(--ink-2); letter-spacing: 0; }
  .kpi__n { display: block; font-size: .75rem; color: var(--ink-3); margin-top: 5px; line-height: 1.35; }
  .kpi--lead { background: var(--accent-soft); }
  .kpi--lead .kpi__v { color: var(--accent-text); }

  /* ---------- callout ---------- */
  .callout { border-left: 3px solid var(--accent); background: var(--accent-soft); border-radius: 0 .5rem .5rem 0; padding: 18px 22px; margin-top: 26px; }
  .callout h4 { margin-bottom: 7px; }
  .callout p { font-size: .94rem; color: var(--ink); }
  .callout--plain { background: var(--surface); border-left-color: var(--rule-strong); }
  .callout--plain p { color: var(--ink-2); }

  /* ---------- tables ---------- */
  .tablewrap { overflow-x: auto; margin-top: 22px; border: 1px solid var(--rule); border-radius: .6rem; }
  table { border-collapse: collapse; width: 100%; font-size: .86rem; }
  .tablewrap--wide table { min-width: 46rem; }
  thead th { text-align: left; padding: 10px 14px; white-space: nowrap; font-family: "Geist Mono", monospace; font-weight: 500; font-size: .64rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); border-bottom: 1px solid var(--rule-strong); background: var(--surface); }
  tbody td { padding: 11px 14px; border-bottom: 1px solid var(--rule); vertical-align: top; }
  tbody tr:last-child td { border-bottom: 0; }
  tfoot td { padding: 11px 14px; border-top: 1px solid var(--rule-strong); font-weight: 600; background: var(--surface); }
  td.num, th.num, tfoot td.num { text-align: right; font-family: "Geist Mono", monospace; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .tool { font-weight: 600; }
  .sub { display: block; color: var(--ink-3); font-size: .78rem; margin-top: 2px; font-weight: 400; }

  /* Chip ink is set per fill so uppercase 10px text clears WCAG AA (4.5:1) in
     both themes: white fails on the amber step in light and on every step in dark. */
  .chip { display: inline-block; padding: 3px 8px; border-radius: .25rem; font-family: "Geist Mono", monospace; font-size: .64rem; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; border: 1px solid transparent; color: #FFFFFF; }
  .chip--native { background: var(--cat-native); }
  .chip--configure { background: var(--cat-configure); }
  .chip--build { background: var(--cat-build); color: #0C0C0C; }
  .chip--integrate { background: var(--cat-integrate); }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .chip--native,
    :root:not([data-theme="light"]) .chip--configure,
    :root:not([data-theme="light"]) .chip--integrate { color: #0C0C0C; }
    :root:not([data-theme="light"]) .g-seg-label { fill: #0C0C0C; }
  }
  :root[data-theme="dark"] .chip--native,
  :root[data-theme="dark"] .chip--configure,
  :root[data-theme="dark"] .chip--integrate { color: #0C0C0C; }
  :root[data-theme="dark"] .g-seg-label { fill: #0C0C0C; }
  .chip--keep { background: transparent; border-color: var(--rule-strong); color: var(--ink-2); }
  .chip--unknown { background: transparent; border-color: var(--rule-strong); color: var(--ink-2); }
  .chip--drop { background: transparent; border-color: var(--rule-strong); color: var(--ink-2); text-decoration: line-through; }

  .conf { font-family: "Geist Mono", monospace; font-size: .7rem; color: var(--ink-2); display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
  .conf__bars { display: inline-flex; gap: 2px; }
  .conf__bars i { width: 4px; height: 10px; border-radius: 1px; background: var(--rule-strong); display: block; }
  .conf--high i:nth-child(-n+3), .conf--medium i:nth-child(-n+2), .conf--low i:nth-child(1) { background: var(--ink-2); }

  /* ---------- charts ---------- */
  .figure { margin-top: 26px; border: 1px solid var(--rule); border-radius: .6rem; padding: 20px 22px 16px; background: var(--bg); }
  .figure__title { font-size: .95rem; font-weight: 600; letter-spacing: -0.012em; }
  .figure__sub { font-size: .82rem; color: var(--ink-2); margin-top: 4px; max-width: 62ch; }
  .figure svg { display: block; width: 100%; height: auto; margin-top: 14px; overflow: visible; }
  .figure__cap { font-size: .76rem; color: var(--ink-3); margin-top: 10px; }

  .legend { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 13px; }
  .legend span { display: inline-flex; align-items: center; gap: 7px; font-size: .8rem; color: var(--ink-2); }
  .legend i { width: 10px; height: 10px; border-radius: 2px; display: block; flex: none; }
  .legend .num { color: var(--ink); font-weight: 600; }

  .g-axis text { font-family: "Geist Mono", monospace; font-size: 10px; fill: var(--ink-3); }
  .g-grid line { stroke: var(--grid); stroke-width: 1; }
  .g-zero { stroke: var(--rule-strong); stroke-width: 1; stroke-dasharray: 4 3; }
  .g-line { fill: none; stroke: var(--cat-native); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .g-dot { fill: var(--cat-native); stroke: var(--bg); stroke-width: 2; }
  .g-note { font-family: "Geist Mono", monospace; font-size: 10px; fill: var(--ink-2); }
  .g-note--strong { fill: var(--ink); font-weight: 600; }
  .g-shade { fill: var(--surface); }
  .g-seg-label { font-family: "Geist Mono", monospace; font-size: 11px; fill: #FFFFFF; font-weight: 600; }

  .tip { position: fixed; z-index: 40; pointer-events: none; opacity: 0; transition: opacity .1s; background: var(--ink); color: var(--bg); border-radius: .4rem; padding: 7px 10px; font-size: .78rem; line-height: 1.4; box-shadow: 0 6px 20px rgb(0 0 0 / .18); max-width: 15rem; }
  .tip b { font-family: "Geist Mono", monospace; font-variant-numeric: tabular-nums; }

  /* ---------- waves ---------- */
  .waves { margin-top: 24px; display: grid; gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: .6rem; overflow: hidden; }
  .wave { background: var(--bg); padding: 20px 22px; display: grid; grid-template-columns: 7rem 1fr 9rem; gap: 20px; align-items: start; }
  @media (max-width: 720px) { .wave { grid-template-columns: 1fr; gap: 10px; } }
  .wave__when { font-family: "Geist Mono", monospace; font-size: .74rem; color: var(--ink-3); }
  .wave__when b { display: block; color: var(--accent-text); font-size: .7rem; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 5px; }
  .wave__body p { font-size: .9rem; color: var(--ink-2); margin-top: 6px; }
  .wave__body .drops { margin-top: 9px; display: flex; flex-wrap: wrap; gap: 6px; }
  .wave__body .drops span { font-family: "Geist Mono", monospace; font-size: .7rem; border: 1px solid var(--rule-strong); border-radius: .3rem; padding: 3px 8px; color: var(--ink-2); }
  .wave__save { text-align: right; }
  @media (max-width: 720px) { .wave__save { text-align: left; } }
  .wave__save b { display: block; font-size: 1.15rem; font-weight: 600; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
  .wave__save span { font-size: .74rem; color: var(--ink-3); }

  /* ---------- lists ---------- */
  .rule-list { margin: 22px 0 0; padding: 0; list-style: none; border-top: 1px solid var(--rule); }
  .rule-list li { border-bottom: 1px solid var(--rule); padding: 16px 0; display: grid; grid-template-columns: 2.4rem 1fr; gap: 16px; align-items: start; }
  .rule-list .n { font-family: "Geist Mono", monospace; font-size: .76rem; color: var(--ink-3); padding-top: 3px; }
  .rule-list p { font-size: .9rem; color: var(--ink-2); margin-top: 5px; }

  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-top: 24px; }
  .card { border: 1px solid var(--rule); border-radius: .6rem; padding: 20px; background: var(--surface); }
  .card h4 { margin-bottom: 7px; }
  .card p { font-size: .88rem; color: var(--ink-2); }
  .card__tag { font-family: "Geist Mono", monospace; font-size: .64rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); display: block; margin-bottom: 9px; }

  .checklist { margin: 22px 0 0; padding: 0; list-style: none; }
  .checklist li { display: grid; grid-template-columns: 1.4rem 1fr; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--rule); font-size: .92rem; }
  .checklist li:last-child { border-bottom: 0; }
  .checklist .box { width: 13px; height: 13px; border: 1px solid var(--rule-strong); border-radius: 3px; margin-top: 5px; }
  .checklist b { font-weight: 600; }
  .checklist span.who { display: block; font-size: .78rem; color: var(--ink-3); margin-top: 2px; }

  /* ---------- signature ---------- */
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; }
  @media (max-width: 680px) { .sign { grid-template-columns: 1fr; gap: 24px; } }
  .sign__line { border-bottom: 1px solid var(--rule-strong); height: 40px; }
  .sign__who { font-size: .8rem; color: var(--ink-3); margin-top: 8px; font-family: "Geist Mono", monospace; }

  .docfoot { background: var(--surface); border-top: 1px solid var(--rule); padding: 22px 48px 28px; display: flex; flex-wrap: wrap; gap: 8px 24px; justify-content: space-between; font-size: .78rem; color: var(--ink-3); }
  @media (max-width: 680px) { .docfoot { padding-inline: 22px; } }
  .docfoot a { color: var(--ink-2); text-decoration: none; }

  .footnote { font-family: "Geist Mono", monospace; font-size: .72rem; color: var(--ink-3); margin-top: 14px; line-height: 1.55; }

  .print-footer { display: none; }

  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }

  /* ================= PRINT / PDF ================= */
  @page {
    size: A4;
    margin: 14mm 13mm 18mm;
  }

  @media print {
    /* Force the light instrument on paper, whatever the screen theme is. */
    :root, :root[data-theme="dark"] {
      --bg: #FFFFFF; --surface: #FAFAFA; --surface-2: #ECECEC;
      --ink: #0C0C0C; --ink-2: #545454; --ink-3: #767676;
      --rule: #DFDFDF; --rule-strong: #B4B4B4;
      --accent: #B4F372; --accent-ink: #0C0C0C; --accent-text: #2F520B; --accent-soft: #F4FDEA;
      --cat-native: #3F7D20; --cat-configure: #6D42C8; --cat-build: #A8830F; --cat-integrate: #0C7D9E;
      --cat-unknown: #9E9E9E; --grid: #E4E4E4;
      color-scheme: light;
    }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

    html, body { background: #FFFFFF; font-size: 9.4pt; line-height: 1.45; }
    .toolbar, .tip { display: none !important; }

    .doc { max-width: none; margin: 0; border: 0; border-radius: 0; }
    .pad { padding: 0 0 6mm; }
    .cover { border-bottom: 0.6pt solid var(--rule-strong); padding-bottom: 8mm; background: #FFFFFF; }
    .band { border-top: 0; padding-top: 7mm; }

    h1 { font-size: 26pt; }
    h2 { font-size: 14pt; }
    h3 { font-size: 10.5pt; }
    h4 { font-size: 9.6pt; }

    /* Page breaks: each numbered section starts fresh, cover stands alone. */
    .pb { break-before: page; page-break-before: always; }
    .no-break, .figure, .kpis, .callout, .card, .wave, .sign, .tablewrap { break-inside: avoid; page-break-inside: avoid; }
    tr, li { break-inside: avoid; page-break-inside: avoid; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    h2, h3, h4 { break-after: avoid; page-break-after: avoid; }

    /* Tables must fit 184mm of usable width. */
    .tablewrap { overflow: visible; border-color: var(--rule-strong); }
    .tablewrap--wide table { min-width: 0; }
    table { font-size: 8pt; }
    thead th { padding: 5pt 6pt; font-size: 6pt; }
    tbody td, tfoot td { padding: 5pt 6pt; }
    .sub { font-size: 7pt; }
    .chip { font-size: 6pt; padding: 1.5pt 4pt; }
    .chip--native, .chip--configure, .chip--integrate { color: #FFFFFF; }
    .chip--build { color: #0C0C0C; }
    .g-seg-label { fill: #FFFFFF; }
    .conf { font-size: 6.6pt; }

    .kpis { grid-template-columns: repeat(3, 1fr); }
    .kpi__v { font-size: 15pt; }
    .kpi { padding: 8pt 9pt; }
    .figure { padding: 10pt 12pt 8pt; }
    .docfoot { padding: 6mm 0 0; background: #FFFFFF; }

    a { color: var(--ink); text-decoration: none; }

    /* Repeated on every printed page by the print engine. */
    .print-footer {
      display: block; position: fixed; bottom: -12mm; left: 0; right: 0;
      border-top: 0.6pt solid var(--rule); padding-top: 2mm;
      font-family: "Geist Mono", monospace; font-size: 6.6pt; color: var(--ink-3);
      display: flex; justify-content: space-between;
    }
  }
`
