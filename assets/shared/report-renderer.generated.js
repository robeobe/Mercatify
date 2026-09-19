/* WYGENEROWANE - nie edytuj ręcznie.
   Źródło: mercatify-labs/src/report/renderReport.ts wraz z domknięciem jego
   importów (transpilacja TypeScript -> ES2019, jeden IIFE, mikro-rejestr
   CommonJS). Odśwież: cd mercatify-labs && npm run renderer:generate
   Pilnuje tego mercatify-labs/src/__tests__/browserRendererIntegrity.test.ts,
   który porównuje nie tylko treść pliku, ale i WYNIK: ten sam ReportModel
   przepuszczony przez wersję TS i przez tę kopię musi dać identyczny string.

   Wystawia:
     window.renderReport(model)  -> string z pełnym dokumentem HTML
     window.REPORT_GLOSSARY      -> stała do facts.glossary (Appendix A)
   Model opisuje src/report/model.ts; adapter z mapowania stron w assets/
   siedzi w assets/shared/report-model.js. */
(function (globalScope) {
  'use strict';

  var __modules = {};
  var __cache = {};

  function __resolve(from, spec) {
    if (spec.charAt(0) !== '.') return spec;
    var parts = from.split('/');
    parts.pop();
    spec.split('/').forEach(function (seg) {
      if (seg === '' || seg === '.') return;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    });
    return parts.join('/');
  }

  function __load(id) {
    var cached = __cache[id];
    if (cached) return cached.exports;
    var factory = __modules[id];
    if (!factory) throw new Error('[mercatify] renderer: brak modułu ' + id);
    var mod = { exports: {} };
    __cache[id] = mod;
    factory(mod, mod.exports, function (spec) { return __load(__resolve(id, spec)); });
    return mod.exports;
  }

  function __define(id, factory) { __modules[id] = factory; }

  __define("report/format", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOT_GIVEN = void 0;
exports.money = money;
exports.count = count;
exports.isoToLongDate = isoToLongDate;
const SYMBOLS = Object.freeze({
    EUR: '€',
    USD: '$',
    PLN: 'zł',
    GBP: '£',
});
exports.NOT_GIVEN = '—';
function money(value, currency) {
    if (value === null || value === undefined || !Number.isFinite(value))
        return exports.NOT_GIVEN;
    const symbol = Object.hasOwn(SYMBOLS, currency) ? SYMBOLS[currency] : '';
    const rounded = Math.round(value);
    const sign = rounded < 0 ? '-' : '';
    const digits = Math.abs(rounded).toLocaleString('en-US');
    if (symbol.length === 0)
        return `${sign}${digits}`;
    return currency === 'PLN' ? `${sign}${digits} ${symbol}` : `${sign}${symbol}${digits}`;
}
function count(value) {
    if (value === null || value === undefined || !Number.isFinite(value))
        return exports.NOT_GIVEN;
    return (Math.round(value) || 0).toLocaleString('en-US');
}
const MONTHS = Object.freeze([
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]);
function isoToLongDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (match === null)
        return iso;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31)
        return iso;
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
        return iso;
    }
    return `${day} ${MONTHS[month - 1]} ${year}`;
}
  });

  __define("report/glossary", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_GLOSSARY = void 0;
const VERDICT_ENTRIES = Object.freeze([
    {
        verdict: 'native',
        means: 'The platform already does this. Setup only.',
        costsYou: 'Configuration time, no new code',
    },
    {
        verdict: 'configure',
        means: 'The platform does this once settings, business rules or custom fields are in place.',
        costsYou: 'Analyst time, no new code',
    },
    {
        verdict: 'build',
        means: 'New code is required. Always accompanied by an hour estimate.',
        costsYou: 'Developer time, quoted per item',
    },
    {
        verdict: 'integrate',
        means: 'Better left to a specialist tool and wired in through its API.',
        costsYou: 'The retained licence, plus wiring',
    },
    {
        verdict: 'keep',
        means: 'We recommend you do not move it. Out of scope by judgement.',
        costsYou: 'Nothing changes',
    },
    {
        verdict: 'drop',
        means: 'Nobody would miss it. Switch it off without replacing it anywhere.',
        costsYou: 'Nothing to build and nothing to keep paying',
    },
    {
        verdict: 'off-catalog',
        means: 'No curated entry. Reported as unmapped rather than guessed.',
        costsYou: 'One follow-up conversation',
    },
]);
const RULES = Object.freeze([
    {
        id: 'Rule 01',
        title: 'The catalog decides, the model narrates',
        body: 'Tool-to-platform verdicts come from a curated matrix by lookup, never from live model ' +
            'reasoning on the critical path. Language models write the explanations; they do not cast the votes.',
    },
    {
        id: 'Rule 02',
        title: 'The model never computes money',
        body: 'It selects the inputs. A pure function returns the figure. Every number in section 05 can be ' +
            'recomputed by hand at the table, which is why the formula is shown next to each line.',
    },
    {
        id: 'Rule 03',
        title: 'Confidence is a band, not a decimal',
        body: 'High - observed directly in your system or invoices. Medium - inferred from consistent evidence. ' +
            'Low - stated once, unverified. A "87% match" is a claim nobody can defend in a room full of ' +
            'people who know their own business.',
    },
]);
exports.REPORT_GLOSSARY = Object.freeze({ verdicts: VERDICT_ENTRIES, rules: RULES });
  });

  __define("report/renderReport", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderReport = renderReport;
const reportStyle_1 = require("./reportStyle");
const slots_1 = require("./slots");
const cover_1 = require("./templates/cover");
const kpis_1 = require("./templates/kpis");
const execSummary_1 = require("./templates/execSummary");
const basis_1 = require("./templates/basis");
const stackTable_1 = require("./templates/stackTable");
const coverage_1 = require("./templates/coverage");
const money_1 = require("./templates/money");
const cashflow_1 = require("./templates/cashflow");
const sequence_1 = require("./templates/sequence");
const preview_1 = require("./templates/preview");
const risks_1 = require("./templates/risks");
const nextSteps_1 = require("./templates/nextSteps");
const appendixA_1 = require("./templates/appendixA");
const appendixB_1 = require("./templates/appendixB");
const shared_1 = require("./templates/shared");
function marker(name) {
    return `<!-- ============ ${name} ============ -->`;
}
function documentTitle(facts) {
    return `Stack Consolidation Report — ${facts.meta.preparedFor.organization}`;
}
function documentDescription(facts) {
    return (`Mercatify stack consolidation report for ${facts.meta.preparedFor.organization} ` +
        `(${facts.meta.caseId}): capability coverage, computed savings and a phased migration ` +
        'onto Open Mercato.');
}
function jsonForScript(value) {
    return JSON.stringify(value).replace(/</g, '\\u003C');
}
function renderScript(facts) {
    const hits = (0, cashflow_1.cashHits)(facts);
    return (0, shared_1.joinParts)([
        '<script>',
        '(function () {',
        "  var printBtn = document.getElementById('printBtn');",
        "  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });",
        "  var toggle = document.getElementById('themeToggle');",
        '  if (toggle) {',
        "    toggle.addEventListener('click', function () {",
        '      var root = document.documentElement;',
        "      var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;",
        "      var current = root.getAttribute('data-theme') || (dark ? 'dark' : 'light');",
        "      root.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');",
        '    });',
        '  }',
        "  var tip = document.getElementById('tip');",
        '  if (!tip) return;',
        '  function showTip(html, event) {',
        '    tip.innerHTML = html;',
        "    tip.style.opacity = '1';",
        '    var pad = 14;',
        '    var box = tip.getBoundingClientRect();',
        '    var x = event.clientX + pad;',
        '    var y = event.clientY + pad;',
        '    if (x + box.width > window.innerWidth - 8) x = event.clientX - box.width - pad;',
        '    if (y + box.height > window.innerHeight - 8) y = event.clientY - box.height - pad;',
        "    tip.style.left = x + 'px';",
        "    tip.style.top = y + 'px';",
        '  }',
        "  function hideTip() { tip.style.opacity = '0'; }",
        '  function text(value) {',
        "    var node = document.createElement('span');",
        '    node.textContent = value;',
        '    return node.innerHTML;',
        '  }',
        "  var segs = document.querySelectorAll('#fig-coverage .seg');",
        '  Array.prototype.forEach.call(segs, function (seg) {',
        "    seg.addEventListener('mousemove', function (e) {",
        "      showTip('<b>' + text(seg.getAttribute('data-value')) + '</b><br>' + text(seg.getAttribute('data-label')), e);",
        '    });',
        "    seg.addEventListener('mouseleave', hideTip);",
        '  });',
        `  var hitsData = ${jsonForScript(hits)};`,
        `  var hitWidth = ${jsonForScript((0, cashflow_1.cashHitWidth)(facts))};`,
        `  var plotTop = ${cashflow_1.CASH_PLOT_BOX.top};`,
        `  var plotHeight = ${cashflow_1.CASH_PLOT_BOX.height};`,
        "  var svg = document.getElementById('cashSvg');",
        "  var hits = document.getElementById('cashHits');",
        '  if (!svg || !hits || hitsData.length === 0) return;',
        "  var NS = 'http://www.w3.org/2000/svg';",
        "  var crosshair = document.createElementNS(NS, 'line');",
        "  crosshair.setAttribute('stroke', 'var(--rule-strong)');",
        "  crosshair.setAttribute('stroke-width', '1');",
        "  crosshair.setAttribute('y1', String(plotTop));",
        "  crosshair.setAttribute('y2', String(plotTop + plotHeight));",
        "  crosshair.setAttribute('opacity', '0');",
        '  hits.appendChild(crosshair);',
        "  var marker = document.createElementNS(NS, 'circle');",
        "  marker.setAttribute('r', '4.5');",
        "  marker.setAttribute('fill', 'var(--cat-native)');",
        "  marker.setAttribute('stroke', 'var(--bg)');",
        "  marker.setAttribute('stroke-width', '2');",
        "  marker.setAttribute('opacity', '0');",
        '  hits.appendChild(marker);',
        '  hitsData.forEach(function (row) {',
        "    var hit = document.createElementNS(NS, 'rect');",
        "    hit.setAttribute('x', String(row.x - hitWidth / 2));",
        "    hit.setAttribute('y', String(plotTop));",
        "    hit.setAttribute('width', String(hitWidth));",
        "    hit.setAttribute('height', String(plotHeight));",
        "    hit.setAttribute('fill', 'transparent');",
        "    hit.addEventListener('mousemove', function (e) {",
        "      crosshair.setAttribute('x1', String(row.x));",
        "      crosshair.setAttribute('x2', String(row.x));",
        "      crosshair.setAttribute('opacity', '1');",
        "      marker.setAttribute('cx', String(row.x));",
        "      marker.setAttribute('cy', String(row.y));",
        "      marker.setAttribute('opacity', '1');",
        "      var note = row.note ? '<br>' + text(row.note) : '';",
        "      showTip('Month ' + text(String(row.month)) + '<br><b>' + text(row.label) + '</b> cumulative' + note, e);",
        '    });',
        "    hit.addEventListener('mouseleave', function () {",
        "      crosshair.setAttribute('opacity', '0');",
        "      marker.setAttribute('opacity', '0');",
        '      hideTip();',
        '    });',
        '    hits.appendChild(hit);',
        '  });',
        '})();',
        '</script>',
    ]);
}
function renderMoneySection(facts, prose) {
    return (0, shared_1.joinParts)([
        '<section class="pad band pb">',
        (0, money_1.renderMoney)(facts, prose),
        (0, cashflow_1.renderCashflow)(facts, prose),
        (0, money_1.renderPaybackCallout)(facts, prose),
        '</section>',
    ]);
}
function renderReport(model) {
    const { facts } = model;
    const prose = model.prose === undefined ? {} : (0, slots_1.resolveProseSlots)(model.prose, facts);
    const body = (0, shared_1.joinParts)([
        (0, cover_1.renderToolbar)(facts),
        '<div class="doc" id="top">',
        marker('COVER'),
        (0, cover_1.renderCover)(facts, prose),
        marker('AT A GLANCE'),
        (0, kpis_1.renderKpis)(facts, prose),
        marker('1. EXECUTIVE SUMMARY'),
        (0, execSummary_1.renderExecSummary)(prose),
        marker('2. SCOPE'),
        (0, basis_1.renderBasis)(facts, prose),
        marker('3. STACK TODAY'),
        (0, stackTable_1.renderStackTable)(facts, prose),
        marker('4. COVERAGE'),
        (0, coverage_1.renderCoverage)(facts, prose),
        marker('5. MONEY'),
        renderMoneySection(facts, prose),
        marker('6. SEQUENCE'),
        (0, sequence_1.renderSequence)(facts, prose),
        marker('7. PREVIEW'),
        (0, preview_1.renderPreview)(facts, prose),
        marker('8. RISKS'),
        (0, risks_1.renderRisks)(prose),
        marker('9. NEXT STEPS'),
        (0, nextSteps_1.renderNextSteps)(facts, prose),
        marker('APPENDIX A'),
        (0, appendixA_1.renderAppendixA)(facts, prose),
        marker('APPENDIX B'),
        (0, appendixB_1.renderAppendixB)(facts, prose),
        (0, cover_1.renderDocFoot)(facts),
        '</div>',
        (0, cover_1.renderPrintFooter)(facts),
        '<div class="tip" id="tip" role="status" aria-live="polite"></div>',
        renderScript(facts),
    ]);
    return (0, shared_1.joinParts)([
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        `<title>${(0, shared_1.escapeHtml)(documentTitle(facts))}</title>`,
        `<meta name="description" content="${(0, shared_1.escapeHtml)(documentDescription(facts))}">`,
        `<style>${reportStyle_1.REPORT_STYLE}</style>`,
        '</head>',
        '<body>',
        body,
        '</body>',
        '</html>',
    ]);
}
  });

  __define("report/reportStyle", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_STYLE = void 0;
exports.REPORT_STYLE = `

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
`;
  });

  __define("report/slots", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSlots = resolveSlots;
exports.slotsIn = slotsIn;
exports.resolveProseSlots = resolveProseSlots;
const format_1 = require("./format");
const SLOT_RE = /\{([a-zA-Z0-9_. -]+)\}/g;
const MONEY_FIELDS = new Set([
    'licencesTodayMonthly',
    'licencesTodayAnnual',
    'licencesAfterMonthly',
    'netRecurringAnnual',
    'hostingMonthly',
    'implementationCost',
    'netAtHorizon',
    'maxExposure',
    'cumulative',
    'monthlyNet',
    'monthlyBanked',
    'unitPrice',
    'monthly',
    'annual',
    'totalMonthly',
    'totalAnnual',
    'rate',
    'cost',
    'totalImplementationCost',
    'buildOnlyCost',
    'licencesCancelledMonthly',
]);
const COUNT_FIELDS = new Set([
    'toolCount',
    'seatCount',
    'totalSeats',
    'employees',
    'implementationHours',
    'programmeWeeks',
    'horizonMonths',
    'breakEvenMonth',
    'maxExposureMonth',
    'month',
    'statements',
    'matched',
    'offCatalog',
    'seats',
    'weekFrom',
    'weekTo',
    'hours',
    'bankedFromMonth',
    'n',
    'waveNumber',
    'totalHours',
    'largestBuildHours',
    'buildOnlyMonths',
    'programmeMonths',
    'estimatedHours',
]);
const DATE_FIELDS = new Set(['issued', 'validUntil', 'termEnds']);
function formatLeaf(field, value, currency) {
    if (value === null || value === undefined)
        return '—';
    if (typeof value === 'string')
        return DATE_FIELDS.has(field) ? (0, format_1.isoToLongDate)(value) : value;
    if (typeof value === 'number') {
        if (MONEY_FIELDS.has(field))
            return (0, format_1.money)(value, currency);
        if (COUNT_FIELDS.has(field))
            return (0, format_1.count)(value);
        throw new Error(`[mercatify-labs] resolveSlots: numeric field "${field}" is classified neither as money nor as a ` +
            `count. Add it to MONEY_FIELDS or COUNT_FIELDS in src/report/slots.ts - guessing would either ` +
            `drop a currency symbol from a sentence about money or add one to a number of hours.`);
    }
    if (typeof value === 'boolean')
        return value ? 'yes' : 'no';
    throw new Error(`[mercatify-labs] resolveSlots: field "${field}" is not a renderable value, got ${JSON.stringify(value)}`);
}
function resolvePath(path, facts) {
    const parts = path.split('.');
    const currency = facts.company.currency;
    const head = parts[0];
    if (parts.length === 2) {
        const field = parts[1];
        if (head === 'kpis')
            return leafOf(facts.kpis, field, path, currency);
        if (head === 'cash') {
            if (facts.cash === undefined) {
                throw new Error(`[mercatify-labs] resolveSlots: "{${path}}" needs a cash series, but this run has none (no costs given).`);
            }
            return leafOf(facts.cash, field, path, currency);
        }
        if (head === 'counts')
            return leafOf(facts.basis.counts, field, path, currency);
        if (head === 'meta')
            return leafOf(facts.meta, field, path, currency);
        if (head === 'company')
            return leafOf(facts.company, field, path, currency);
        if (head === 'stack')
            return leafOf(facts.stack, field, path, currency);
        if (head === 'money')
            return leafOf(facts.money, field, path, currency);
    }
    if (parts.length === 3 && head === 'money' && parts[1] === 'paybacks') {
        return leafOf(facts.money.paybacks, parts[2], path, currency);
    }
    if (parts.length === 3 && head === 'wave' && parts[2] === 'cost') {
        const n = Number(parts[1]);
        const line = facts.money.implementation.find((item) => item.waveNumber === n);
        if (line === undefined) {
            throw new Error(`[mercatify-labs] resolveSlots: "{${path}}" names wave ${parts[1]}, which has no implementation line.`);
        }
        return leafOf(line, 'cost', path, currency);
    }
    if (parts.length === 3 && head === 'wave') {
        const n = Number(parts[1]);
        const wave = facts.waves.find((w) => w.n === n);
        if (wave === undefined) {
            throw new Error(`[mercatify-labs] resolveSlots: "{${path}}" names wave ${parts[1]}, but this run has waves ${facts.waves.map((w) => w.n).join(', ') || '(none)'}.`);
        }
        return leafOf(wave, parts[2], path, currency);
    }
    if (head === 'stack' && parts.length > 3) {
        throw new Error(`[mercatify-labs] resolveSlots: "{${path}}" has too many parts for stack.<tool>.<field>. ` +
            `A tool name containing a dot cannot be addressed by a slot - rename it or use a kpis/wave slot.`);
    }
    if (parts.length === 3 && head === 'stack') {
        const row = facts.stack.rows.find((r) => r.tool === parts[1]);
        if (row === undefined) {
            throw new Error(`[mercatify-labs] resolveSlots: "{${path}}" names tool ${JSON.stringify(parts[1])}, which is not in the stack: ${facts.stack.rows.map((r) => r.tool).join(', ')}.`);
        }
        return leafOf(row, parts[2], path, currency);
    }
    throw new Error(`[mercatify-labs] resolveSlots: "{${path}}" is not an allowed slot shape. ` +
        `Allowed: kpis.<f>, cash.<f>, counts.<f>, meta.<f>, company.<f>, money.<f>, ` +
        `stack.<f> (totals), wave.<n>.<f>, stack.<tool>.<f>.`);
}
function leafOf(source, field, path, currency) {
    if (!Object.hasOwn(source, field)) {
        throw new Error(`[mercatify-labs] resolveSlots: "{${path}}" names no such field. Available: ${Object.keys(source).join(', ')}.`);
    }
    return formatLeaf(field, source[field], currency);
}
function resolveSlots(text, facts) {
    return text.replace(SLOT_RE, (_match, path) => resolvePath(path, facts));
}
function slotsIn(text) {
    return [...text.matchAll(SLOT_RE)].map((m) => m[1]);
}
function resolveProseSlots(prose, facts) {
    const walk = (value) => {
        if (typeof value === 'string')
            return resolveSlots(value, facts);
        if (Array.isArray(value))
            return value.map(walk);
        if (typeof value === 'object' && value !== null) {
            return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
        }
        return value;
    };
    const resolved = walk(prose);
    if (typeof resolved !== 'object' || resolved === null || Array.isArray(resolved)) {
        throw new Error('[mercatify-labs] resolveProseSlots: prose must be an object');
    }
    return resolved;
}
  });

  __define("report/templates/appendixA", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderAppendixA = renderAppendixA;
const shared_1 = require("./shared");
const METHOD_NOTE = 'Every case, artifact and figure in this report is a record in an Open Mercato instance ' +
    '— the same platform this report recommends. Mercatify runs its own business on it.';
function renderAppendixA(facts, prose) {
    const { glossary } = facts;
    const verdicts = glossary.verdicts.map((entry) => (0, shared_1.joinParts)([
        '<tr>',
        `<td>${(0, shared_1.verdictChip)(entry.verdict)}</td>`,
        `<td>${(0, shared_1.escapeHtml)(entry.means)}</td>`,
        `<td>${(0, shared_1.escapeHtml)(entry.costsYou)}</td>`,
        '</tr>',
    ]));
    const rules = glossary.rules.map((rule) => (0, shared_1.joinParts)([
        '<div class="card">',
        `<span class="card__tag">${(0, shared_1.escapeHtml)(rule.id)}</span>`,
        `<h4>${(0, shared_1.escapeHtml)(rule.title)}</h4>`,
        `<p>${(0, shared_1.escapeHtml)(rule.body)}</p>`,
        '</div>',
    ]));
    return (0, shared_1.joinParts)([
        '<section class="pad band pb">',
        (0, shared_1.sectionHead)('Appendix A', 'How we reach a verdict', prose.appendixAIntro),
        '<div class="tablewrap">',
        '<table>',
        '<thead><tr><th>Verdict</th><th>Means</th><th>What it costs you</th></tr></thead>',
        '<tbody>',
        ...verdicts,
        '</tbody>',
        '</table>',
        '</div>',
        '<div class="cards">',
        ...rules,
        '</div>',
        `<p class="footnote">${(0, shared_1.escapeHtml)(METHOD_NOTE)}</p>`,
        '</section>',
    ]);
}
  });

  __define("report/templates/appendixB", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderAppendixB = renderAppendixB;
const shared_1 = require("./shared");
function renderAppendixB(facts, prose) {
    var _a;
    if (facts.gaps.length === 0)
        return '';
    const byId = new Map(((_a = prose.gaps) !== null && _a !== void 0 ? _a : []).map((gap) => [gap.gapId, gap]));
    const rows = facts.gaps.map((gap) => {
        var _a, _b;
        const explained = byId.get(gap.id);
        const source = gap.source.length === 0 ? '' : `<span class="sub">${(0, shared_1.escapeHtml)(gap.source)}</span>`;
        const described = gap.described.length === 0 ? gap.capability : gap.described;
        return (0, shared_1.joinParts)([
            '<tr>',
            `<td class="num">${(0, shared_1.escapeHtml)(gap.id)}</td>`,
            `<td><b>${(0, shared_1.escapeHtml)(described)}</b>${source}</td>`,
            `<td>${(0, shared_1.escapeHtml)((_a = explained === null || explained === void 0 ? void 0 : explained.whyUnmapped) !== null && _a !== void 0 ? _a : '—')}</td>`,
            `<td>${(0, shared_1.escapeHtml)((_b = explained === null || explained === void 0 ? void 0 : explained.ourRead) !== null && _b !== void 0 ? _b : '—')}</td>`,
            '</tr>',
        ]);
    });
    return (0, shared_1.joinParts)([
        '<section class="pad band pb">',
        (0, shared_1.sectionHead)('Appendix B', 'Off-catalog items', prose.appendixBIntro),
        '<div class="tablewrap tablewrap--wide">',
        '<table>',
        '<thead><tr><th>#</th><th>What you described</th><th>Why it is unmapped</th><th>Our read</th></tr></thead>',
        '<tbody>',
        ...rows,
        '</tbody>',
        '</table>',
        '</div>',
        '</section>',
    ]);
}
  });

  __define("report/templates/basis", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderBasis = renderBasis;
const format_1 = require("../format");
const shared_1 = require("./shared");
function renderCard(card) {
    const body = card.body.trim().length === 0 ? card.fallback : card.body;
    return (0, shared_1.joinParts)([
        '<div class="card">',
        `<span class="card__tag">${(0, shared_1.escapeHtml)(card.tag)}</span>`,
        `<h4>${(0, shared_1.escapeHtml)(card.title)}</h4>`,
        `<p>${(0, shared_1.escapeHtml)(body)}</p>`,
        '</div>',
    ]);
}
function figureOneTotal(facts) {
    return Object.values(facts.coverage.byVerdict).reduce((sum, value) => sum + value, 0);
}
function countsNote(facts) {
    const { statements, matched, offCatalog } = facts.basis.counts;
    const note = `${(0, shared_1.countedNoun)(statements, 'usage statement')} ${statements === 1 ? 'was' : 'were'} ` +
        `extracted from the above. ${(0, format_1.count)(matched)} matched a catalog capability; ` +
        `${(0, format_1.count)(offCatalog)} did not and ${offCatalog === 1 ? 'is' : 'are'} ` +
        'carried openly into Appendix B.';
    const mapped = figureOneTotal(facts);
    if (mapped === 0 || mapped === statements)
        return note;
    return (`${note} Figure 1 in section 04 counts a different set — the ${(0, format_1.count)(mapped)} tool-and-capability ` +
        'pairs our mapping engine scored — because several statements can describe the same pair. ' +
        'That is why its total is the smaller of the two.');
}
function renderBasis(facts, prose) {
    const { basis } = facts;
    const cards = [
        {
            tag: 'Inputs',
            title: 'What we read',
            body: basis.readWhat,
            fallback: 'The client supplied no description of the material this analysis was based on.',
        },
        {
            tag: 'Period',
            title: 'What it covers',
            body: basis.period,
            fallback: 'No billing period was stated for the costs in this report.',
        },
        {
            tag: 'Exclusions',
            title: 'What we left alone',
            body: basis.exclusions,
            fallback: 'Nothing was declared out of scope.',
        },
    ];
    return (0, shared_1.joinParts)([
        '<section class="pad band pb">',
        (0, shared_1.sectionHead)('Section 02', 'What this analysis is based on', prose.basisIntro),
        '<div class="cards">',
        ...cards.map(renderCard),
        '</div>',
        `<p class="footnote">${(0, shared_1.escapeHtml)(countsNote(facts))}</p>`,
        '</section>',
    ]);
}
  });

  __define("report/templates/cashflow", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CASH_PLOT_BOX = void 0;
exports.plottedPoints = plottedPoints;
exports.cashHits = cashHits;
exports.cashHitWidth = cashHitWidth;
exports.renderCashflow = renderCashflow;
const format_1 = require("../format");
const shared_1 = require("./shared");
const PLOT = Object.freeze({
    viewWidth: 720,
    viewHeight: 290,
    x0: 56,
    x1: 700,
    yTop: 24,
    yBottom: 250,
    axisX: 48,
    baselineShift: 4,
    monthAxisY: 268,
    captionY: 285,
    targetIntervals: 6,
    dotRadius: 4.5,
});
const MIN_HEADROOM = 0.2;
const HEADROOM_PAD = 0.4;
const STEP_MANTISSAS = Object.freeze([1, 2, 2.5, 5, 10]);
function niceStep(raw) {
    if (!Number.isFinite(raw) || raw <= 0)
        return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    let best = STEP_MANTISSAS[0] * magnitude;
    for (const mantissa of STEP_MANTISSAS) {
        const candidate = mantissa * magnitude;
        if (candidate <= raw)
            best = candidate;
    }
    return best;
}
function buildScale(points, months) {
    const values = points.map((point) => point.cumulative);
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const step = niceStep((max - min) / PLOT.targetIntervals);
    let bottom = Math.floor(min / step) * step;
    let top = Math.ceil(max / step) * step;
    if (min < bottom + step * MIN_HEADROOM)
        bottom -= step * HEADROOM_PAD;
    if (max > top - step * MIN_HEADROOM)
        top += step * HEADROOM_PAD;
    if (top === bottom)
        top = bottom + step;
    const width = PLOT.x1 - PLOT.x0;
    const height = PLOT.yBottom - PLOT.yTop;
    return {
        months,
        bottom,
        top,
        step,
        x: (month) => (months === 0 ? PLOT.x0 : PLOT.x0 + (month * width) / months),
        y: (value) => PLOT.yBottom - ((value - bottom) * height) / (top - bottom),
    };
}
function gridValues(scale) {
    const values = [];
    const first = Math.ceil(scale.bottom / scale.step) * scale.step;
    for (let value = first; value <= scale.top + scale.step / 2; value += scale.step) {
        values.push(Math.round(value * 100) / 100);
    }
    return values;
}
function axisLabel(value) {
    if (value === 0)
        return '0';
    const sign = value < 0 ? shared_1.MINUS : '+';
    const magnitude = Math.abs(value);
    if (magnitude >= 1000 && magnitude % 1000 === 0)
        return `${sign}${(0, format_1.count)(magnitude / 1000)}k`;
    return `${sign}${(0, format_1.count)(magnitude)}`;
}
function monthTicks(months) {
    if (months <= 0)
        return [0];
    const raw = [0, months / 4, months / 2, (months * 3) / 4, months].map((tick) => Math.round(tick));
    return [...new Set(raw)];
}
function cashDesc(cash, scale, last, currency) {
    const end = `${last.cumulative < 0 ? 'minus' : 'plus'} ${(0, shared_1.amountInWords)(last.cumulative, currency)}`;
    const endClause = `reaches ${end} at month ${(0, format_1.count)(scale.months)}`;
    if (cash.maxExposure >= 0) {
        return `Position never falls below zero and ${endClause}.`;
    }
    const trough = `Position falls to minus ${(0, shared_1.amountInWords)(cash.maxExposure, currency)} ` +
        `at month ${(0, format_1.count)(cash.maxExposureMonth)}`;
    if (cash.breakEvenMonth === null || cash.breakEvenMonth > scale.months) {
        return `${trough} and is still ${end} at month ${(0, format_1.count)(scale.months)}.`;
    }
    return `${trough}, crosses zero in month ${(0, format_1.count)(cash.breakEvenMonth)}, and ${endClause}.`;
}
function renderGrid(scale) {
    return gridValues(scale)
        .filter((value) => value !== 0)
        .map((value) => `<line x1="${PLOT.x0}" y1="${(0, shared_1.svgNum)(scale.y(value))}" x2="${PLOT.x1}" y2="${(0, shared_1.svgNum)(scale.y(value))}"></line>`);
}
function renderAxis(scale) {
    const yLabels = gridValues(scale).map((value) => `<text x="${PLOT.axisX}" y="${(0, shared_1.svgNum)(scale.y(value) + PLOT.baselineShift)}" text-anchor="end">${(0, shared_1.escapeHtml)(axisLabel(value))}</text>`);
    const xLabels = monthTicks(scale.months).map((month) => `<text x="${(0, shared_1.svgNum)(scale.x(month))}" y="${PLOT.monthAxisY}" text-anchor="middle">M${(0, format_1.count)(month)}</text>`);
    const middle = (0, shared_1.svgNum)((PLOT.x0 + PLOT.x1) / 2);
    return [
        '<g class="g-axis">',
        ...yLabels,
        ...xLabels,
        `<text x="${middle}" y="${PLOT.captionY}" text-anchor="middle">months from programme start</text>`,
        '</g>',
    ];
}
function renderShade(cash, scale) {
    if (cash.breakEvenMonth === null || cash.breakEvenMonth <= 0)
        return [];
    const end = Math.min(cash.breakEvenMonth, scale.months);
    const width = scale.x(end) - PLOT.x0;
    if (width <= 0)
        return [];
    return [
        `<rect class="g-shade" x="${PLOT.x0}" y="${PLOT.yTop}" width="${(0, shared_1.svgNum)(width)}" height="${(0, shared_1.svgNum)(PLOT.yBottom - PLOT.yTop)}"></rect>`,
        `<text class="g-note" x="${PLOT.x0 + 8}" y="${PLOT.yTop + 14}">investment period</text>`,
    ];
}
function renderMarkers(markers, scale) {
    return markers.flatMap((marker) => {
        const cx = scale.x(marker.month);
        const cy = scale.y(marker.value);
        const label = marker.trailing
            ? `<text class="g-note g-note--strong" x="${(0, shared_1.svgNum)(cx + 8)}" y="${(0, shared_1.svgNum)(cy + 14)}">${(0, shared_1.escapeHtml)(marker.text)}</text>`
            : `<text class="g-note g-note--strong" x="${(0, shared_1.svgNum)(cx - 8)}" y="${(0, shared_1.svgNum)(cy - 8)}" text-anchor="end">${(0, shared_1.escapeHtml)(marker.text)}</text>`;
        return [
            `<circle class="g-dot" cx="${(0, shared_1.svgNum)(cx)}" cy="${(0, shared_1.svgNum)(cy)}" r="${PLOT.dotRadius}"></circle>`,
            label,
        ];
    });
}
function markersFor(cash, scale, last, currency) {
    const markers = [];
    if (cash.maxExposure < 0 && cash.maxExposureMonth <= scale.months) {
        markers.push({
            month: cash.maxExposureMonth,
            value: cash.maxExposure,
            text: `${(0, shared_1.signedMoney)(cash.maxExposure, currency)} max exposure (M${(0, format_1.count)(cash.maxExposureMonth)})`,
            trailing: true,
        });
    }
    if (cash.breakEvenMonth !== null && cash.breakEvenMonth <= scale.months) {
        const point = cash.points.find((candidate) => candidate.month === cash.breakEvenMonth);
        if (point !== undefined) {
            markers.push({
                month: point.month,
                value: point.cumulative,
                text: `break-even · M${(0, format_1.count)(point.month)}`,
                trailing: false,
            });
        }
    }
    markers.push({
        month: last.month,
        value: last.cumulative,
        text: (0, shared_1.signedMoney)(last.cumulative, currency),
        trailing: false,
    });
    return markers;
}
function plottedPoints(cash) {
    var _a;
    const months = (_a = cash.figureMonths) !== null && _a !== void 0 ? _a : cash.horizonMonths;
    return cash.points.filter((point) => point.month >= 0 && point.month <= months);
}
function renderFigureTwo(facts, prose, cash) {
    const points = plottedPoints(cash);
    if (points.length < 2)
        return '';
    const last = points[points.length - 1];
    const scale = buildScale(points, last.month);
    const currency = facts.company.currency;
    const path = points
        .map((point, index) => `${index === 0 ? 'M' : 'L'}${(0, shared_1.svgNum)(scale.x(point.month))},${(0, shared_1.svgNum)(scale.y(point.cumulative))}`)
        .join(' ');
    const zeroLine = scale.bottom < 0 && scale.top > 0
        ? `<line class="g-zero" x1="${PLOT.x0}" y1="${(0, shared_1.svgNum)(scale.y(0))}" x2="${PLOT.x1}" y2="${(0, shared_1.svgNum)(scale.y(0))}"></line>`
        : '';
    const title = `Cumulative net cash position over ${(0, format_1.count)(scale.months)} months`;
    return (0, shared_1.joinParts)([
        '<figure class="figure no-break" id="fig-cash">',
        '<figcaption>',
        `<span class="figure__title">Figure 2 — Cumulative net cash position, months 0 to ${(0, shared_1.escapeHtml)((0, format_1.count)(scale.months))}</span>`,
        prose.figure2Sub === undefined
            ? ''
            : `<p class="figure__sub">${(0, shared_1.escapeHtml)(prose.figure2Sub)}</p>`,
        '</figcaption>',
        `<svg viewBox="0 0 ${PLOT.viewWidth} ${PLOT.viewHeight}" role="img" aria-labelledby="fig2title fig2desc" id="cashSvg">`,
        `<title id="fig2title">${(0, shared_1.escapeHtml)(title)}</title>`,
        `<desc id="fig2desc">${(0, shared_1.escapeHtml)(cashDesc(cash, scale, last, currency))}</desc>`,
        ...renderShade(cash, scale),
        '<g class="g-grid">',
        ...renderGrid(scale),
        '</g>',
        zeroLine,
        ...renderAxis(scale),
        `<path class="g-line" d="${path}"></path>`,
        ...renderMarkers(markersFor(cash, scale, last, currency), scale),
        '<g id="cashHits"></g>',
        '</svg>',
        prose.figure2Cap === undefined
            ? ''
            : `<p class="figure__cap">${(0, shared_1.escapeHtml)(prose.figure2Cap)}</p>`,
        '</figure>',
    ]);
}
const MONTHS_IN_YEAR = 12;
function milestoneMonths(cash) {
    const wanted = new Set([1]);
    if (cash.maxExposureMonth > 0)
        wanted.add(cash.maxExposureMonth);
    if (cash.breakEvenMonth !== null && cash.breakEvenMonth > 0)
        wanted.add(cash.breakEvenMonth);
    for (let month = MONTHS_IN_YEAR; month <= cash.horizonMonths; month += MONTHS_IN_YEAR) {
        wanted.add(month);
    }
    if (cash.horizonMonths > 0)
        wanted.add(cash.horizonMonths);
    return [...wanted].sort((a, b) => a - b);
}
function renderMilestoneTable(facts, cash) {
    const currency = facts.company.currency;
    const wanted = new Set(milestoneMonths(cash));
    const chosen = cash.points.filter((point) => wanted.has(point.month));
    if (chosen.length === 0)
        return '';
    const rows = chosen.map((point) => (0, shared_1.joinParts)([
        '<tr>',
        `<td>Month ${(0, shared_1.escapeHtml)((0, format_1.count)(point.month))}</td>`,
        `<td>${point.milestone.length === 0 ? '—' : (0, shared_1.escapeHtml)(point.milestone)}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, shared_1.signedMoney)(point.monthlyNet, currency))}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, shared_1.signedMoney)(point.cumulative, currency))}</td>`,
        '</tr>',
    ]));
    return (0, shared_1.joinParts)([
        '<div class="tablewrap">',
        '<table>',
        '<thead>',
        '<tr><th>Milestone</th><th>What has happened by then</th><th class="num">Monthly net</th><th class="num">Cumulative</th></tr>',
        '</thead>',
        '<tbody>',
        ...rows,
        '</tbody>',
        '</table>',
        '</div>',
    ]);
}
function noCashReason(facts) {
    const rows = facts.stack.rows;
    if (rows.length > 0 && rows.every((row) => row.monthly === null)) {
        return ('No costs were supplied for this stack, so there is nothing to plot. ' +
            'Everything above still holds — what each tool is used for, what the platform covers ' +
            'and what has to be built — but the saving, the payback and the cash curve need invoices.');
    }
    if (facts.money.totalHoursAreFloor && facts.money.totalHours <= 0) {
        return ('Not one wave carries an effort estimate, so there is nothing to plot. ' +
            'A curve drawn from these figures would show a programme that costs nothing and pays ' +
            'back at once — everything above still holds, but the payback needs the hours first.');
    }
    return ('This run has no blended rate or no hosting cost, so there is nothing to plot. ' +
        'Everything above still holds, but a cash curve needs both to place the spending in time.');
}
function renderNoCashNote(facts) {
    return (0, shared_1.joinParts)([
        '<div class="callout callout--plain">',
        '<h4>No cash curve in this report</h4>',
        `<p>${(0, shared_1.escapeHtml)(noCashReason(facts))}</p>`,
        '</div>',
    ]);
}
function cashHits(facts) {
    const cash = facts.cash;
    if (cash === undefined)
        return [];
    const points = plottedPoints(cash);
    if (points.length < 2)
        return [];
    const scale = buildScale(points, points[points.length - 1].month);
    return points.map((point) => ({
        month: point.month,
        x: Math.round(scale.x(point.month) * 100) / 100,
        y: Math.round(scale.y(point.cumulative) * 100) / 100,
        label: (0, shared_1.signedMoney)(point.cumulative, facts.company.currency),
        note: point.milestone,
    }));
}
function cashHitWidth(facts) {
    var _a;
    const cash = facts.cash;
    if (cash === undefined)
        return 0;
    const months = (_a = cash.figureMonths) !== null && _a !== void 0 ? _a : cash.horizonMonths;
    if (months <= 0)
        return 0;
    return Math.round(((PLOT.x1 - PLOT.x0) / months) * 100) / 100;
}
exports.CASH_PLOT_BOX = Object.freeze({
    top: PLOT.yTop,
    height: PLOT.yBottom - PLOT.yTop,
});
function renderCashflow(facts, prose) {
    if (facts.cash === undefined)
        return renderNoCashNote(facts);
    return (0, shared_1.joinParts)([
        renderFigureTwo(facts, prose, facts.cash),
        renderMilestoneTable(facts, facts.cash),
    ]);
}
  });

  __define("report/templates/cover", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderToolbar = renderToolbar;
exports.renderCover = renderCover;
exports.renderDocFoot = renderDocFoot;
exports.renderPrintFooter = renderPrintFooter;
const shared_1 = require("./shared");
const format_1 = require("../format");
const HEADLINE = 'What you rent today, and what you could own instead.';
const BRAND = 'Mercatify';
const BRAND_MARK = 'M';
const BASIS_SEPARATOR = ' — ';
function partyEntry(label, party) {
    const who = party.person.length === 0 ? '' : `<span>${(0, shared_1.escapeHtml)(joinParty(party))}</span>`;
    return `<div><dt>${(0, shared_1.escapeHtml)(label)}</dt><dd>${(0, shared_1.escapeHtml)(party.organization)}${who}</dd></div>`;
}
function joinParty(party) {
    return party.role.length === 0 ? party.person : `${party.person}, ${party.role}`;
}
function caseNote(runMinutes, humanReviewed) {
    const review = humanReviewed ? 'human-reviewed' : 'not human-reviewed';
    if (runMinutes === undefined)
        return review;
    return `Analysis run ${runMinutes} min · ${review}`;
}
function basisEntry(basis) {
    const at = basis.indexOf(BASIS_SEPARATOR);
    if (at < 0)
        return `<div><dt>Basis</dt><dd>${(0, shared_1.escapeHtml)(basis)}</dd></div>`;
    const head = basis.slice(0, at);
    const tail = basis.slice(at + BASIS_SEPARATOR.length);
    const shown = tail.length === 0 ? tail : tail[0].toUpperCase() + tail.slice(1);
    return `<div><dt>Basis</dt><dd>${(0, shared_1.escapeHtml)(head)}<span>${(0, shared_1.escapeHtml)(shown)}</span></dd></div>`;
}
function renderToolbar(facts) {
    const { meta } = facts;
    const note = `${meta.caseId} · v${meta.version} · ${(0, shared_1.isoToShortDate)(meta.issued)}`;
    return (0, shared_1.joinParts)([
        '<div class="toolbar">',
        '<div class="toolbar__inner">',
        `<a class="brand" href="#top"><span class="brand__mark">${BRAND_MARK}</span>${BRAND}</a>`,
        `<span class="toolbar__note">${(0, shared_1.escapeHtml)(note)}</span>`,
        '<button class="btn btn--ghost" type="button" id="themeToggle">Toggle theme</button>',
        '<button class="btn btn--primary" type="button" id="printBtn">Print / Save as PDF</button>',
        '</div>',
        '</div>',
    ]);
}
function renderCover(facts, prose) {
    const { meta, company } = facts;
    const eyebrow = `Stack consolidation report · prepared for ${company.name}`;
    return (0, shared_1.joinParts)([
        '<header class="cover pad">',
        `<span class="eyebrow">${(0, shared_1.escapeHtml)(eyebrow)}</span>`,
        `<h1>${(0, shared_1.escapeHtml)(HEADLINE)}</h1>`,
        (0, shared_1.optionalParagraph)(prose.coverLede, 'lede'),
        '<dl class="meta">',
        partyEntry('Prepared for', meta.preparedFor),
        partyEntry('Prepared by', meta.preparedBy),
        `<div><dt>Case</dt><dd class="mono">${(0, shared_1.escapeHtml)(meta.caseId)}` +
            `<span>${(0, shared_1.escapeHtml)(caseNote(meta.runMinutes, meta.humanReviewed))}</span></dd></div>`,
        `<div><dt>Issued</dt><dd>${(0, shared_1.escapeHtml)((0, format_1.isoToLongDate)(meta.issued))}` +
            `<span>Version ${(0, shared_1.escapeHtml)(meta.version)}</span></dd></div>`,
        `<div><dt>Valid until</dt><dd>${(0, shared_1.escapeHtml)((0, format_1.isoToLongDate)(meta.validUntil))}` +
            '<span>Pricing and effort estimates</span></dd></div>',
        basisEntry(meta.basis),
        '</dl>',
        (0, shared_1.optionalParagraph)(meta.confidentialityNote, 'confidential'),
        '</header>',
    ]);
}
function renderDocFoot(facts) {
    const { meta } = facts;
    const left = `${BRAND} — SaaS-to-Open-Mercato consolidation · ${meta.caseId} ` +
        `· v${meta.version} · ${(0, shared_1.isoToShortDate)(meta.issued)}`;
    const right = `Confidential — prepared for ${meta.preparedFor.organization}`;
    return (0, shared_1.joinParts)([
        '<footer class="docfoot">',
        `<span>${(0, shared_1.escapeHtml)(left)}</span>`,
        `<span>${(0, shared_1.escapeHtml)(right)} · <a href="https://www.openmercato.com/">openmercato.com</a></span>`,
        '</footer>',
    ]);
}
function renderPrintFooter(facts) {
    const { meta } = facts;
    return (0, shared_1.joinParts)([
        '<div class="print-footer">',
        `<span>${(0, shared_1.escapeHtml)(`${BRAND} · ${meta.caseId} · ${meta.preparedFor.organization}`)}</span>`,
        `<span>${(0, shared_1.escapeHtml)(`Confidential · ${(0, format_1.isoToLongDate)(meta.issued)} · v${meta.version}`)}</span>`,
        '</div>',
    ]);
}
  });

  __define("report/templates/coverage", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCoverage = renderCoverage;
const format_1 = require("../format");
const shared_1 = require("./shared");
const BAR = Object.freeze({
    viewWidth: 720,
    viewHeight: 76,
    x0: 56,
    x1: 700,
    y: 10,
    height: 30,
    gap: 2,
    labelMinWidth: 100,
});
const SEGMENT_ORDER = Object.freeze([
    {
        key: 'native',
        label: 'Native',
        description: 'Native — already in the platform',
        fill: 'var(--cat-native)',
        swatch: 'background:var(--cat-native)',
    },
    {
        key: 'configure',
        label: 'Configure',
        description: 'Configure — settings and business rules',
        fill: 'var(--cat-configure)',
        swatch: 'background:var(--cat-configure)',
    },
    {
        key: 'build',
        label: 'Build',
        description: 'Build — new code required',
        fill: 'var(--cat-build)',
        swatch: 'background:var(--cat-build)',
    },
    {
        key: 'integrate',
        label: 'Integrate',
        description: 'Integrate — stays external, wired in',
        fill: 'var(--cat-integrate)',
        swatch: 'background:var(--cat-integrate)',
    },
    {
        key: 'keep',
        label: 'Keep',
        description: 'Keep — we recommend you do not move it',
        fill: 'var(--cat-unknown)',
        swatch: 'background:var(--cat-unknown)',
    },
    {
        key: 'drop',
        label: 'Drop',
        description: 'Drop — switched off and not replaced',
        fill: 'var(--cat-unknown)',
        swatch: 'background:var(--cat-unknown)',
    },
    {
        key: 'offCatalog',
        label: 'Off-catalog',
        description: 'Off-catalog — needs a follow-up conversation',
        fill: 'url(#hatch)',
        swatch: 'background:var(--surface-2); border:1px solid var(--cat-unknown)',
    },
]);
function presentSegments(byVerdict) {
    return SEGMENT_ORDER.filter((spec) => byVerdict[spec.key] > 0).map((spec) => ({
        ...spec,
        value: byVerdict[spec.key],
    }));
}
function capabilitiesWord(value) {
    return value === 1 ? '1 capability' : `${(0, format_1.count)(value)} capabilities`;
}
function mappedCapabilities(value) {
    return value === 1 ? '1 mapped capability' : `${(0, format_1.count)(value)} mapped capabilities`;
}
function coverageDesc(segments) {
    const parts = segments.map((segment, index) => {
        const label = index === 0 ? segment.label : segment.label.toLowerCase();
        return `${label} ${(0, format_1.count)(segment.value)}`;
    });
    return `${parts.join(', ')}.`;
}
function segmentGeometry(segments, total) {
    const usable = BAR.x1 - BAR.x0 - BAR.gap * Math.max(0, segments.length - 1);
    let cursor = BAR.x0;
    return segments.map((segment) => {
        const width = Math.round(((usable * segment.value) / total) * 100) / 100;
        const placed = { segment, x: cursor, width };
        cursor = Math.round((cursor + width + BAR.gap) * 100) / 100;
        return placed;
    });
}
function renderFigureOne(facts, prose) {
    const segments = presentSegments(facts.coverage.byVerdict);
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    if (total === 0)
        return '';
    const placed = segmentGeometry(segments, total);
    const rects = placed.map(({ segment, x, width }) => `<rect class="seg" x="${(0, shared_1.svgNum)(x)}" y="${BAR.y}" width="${(0, shared_1.svgNum)(width)}" height="${BAR.height}" ` +
        `fill="${segment.fill}" data-label="${(0, shared_1.escapeHtml)(segment.description)}" ` +
        `data-value="${(0, shared_1.escapeHtml)(capabilitiesWord(segment.value))}"></rect>`);
    const labels = placed
        .filter(({ width }) => width >= BAR.labelMinWidth)
        .map(({ segment, x }) => `<text class="g-seg-label" x="${(0, shared_1.svgNum)(x + 14)}" y="${BAR.y + 20}">${(0, shared_1.escapeHtml)((0, format_1.count)(segment.value))}</text>`);
    const legend = segments.map((segment) => `<span><i style="${segment.swatch}"></i>${(0, shared_1.escapeHtml)(segment.label)} ` +
        `<b class="num">${(0, shared_1.escapeHtml)((0, format_1.count)(segment.value))}</b></span>`);
    const title = `Coverage of ${mappedCapabilities(total)} by verdict`;
    return (0, shared_1.joinParts)([
        '<figure class="figure no-break" id="fig-coverage">',
        '<figcaption>',
        `<span class="figure__title">Figure 1 — Where your ${mappedCapabilities(total)} land</span>`,
        prose.figure1Sub === undefined
            ? ''
            : `<p class="figure__sub">${(0, shared_1.escapeHtml)(prose.figure1Sub)}</p>`,
        '</figcaption>',
        `<svg viewBox="0 0 ${BAR.viewWidth} ${BAR.viewHeight}" role="img" aria-labelledby="fig1title fig1desc">`,
        `<title id="fig1title">${(0, shared_1.escapeHtml)(title)}</title>`,
        `<desc id="fig1desc">${(0, shared_1.escapeHtml)(coverageDesc(segments))}</desc>`,
        '<defs>',
        `<clipPath id="barClip"><rect x="${BAR.x0}" y="${BAR.y}" width="${BAR.x1 - BAR.x0}" height="${BAR.height}" rx="4"></rect></clipPath>`,
        '<pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">',
        '<rect width="6" height="6" fill="var(--surface-2)"></rect>',
        '<line x1="0" y1="0" x2="0" y2="6" stroke="var(--cat-unknown)" stroke-width="2.4"></line>',
        '</pattern>',
        '</defs>',
        '<g clip-path="url(#barClip)">',
        ...rects,
        '</g>',
        ...labels,
        '<g class="g-axis">',
        `<text x="${BAR.x0}" y="60">0</text>`,
        `<text x="${BAR.x1}" y="60" text-anchor="end">${(0, shared_1.escapeHtml)(mappedCapabilities(total))}</text>`,
        '</g>',
        '</svg>',
        '<div class="legend">',
        ...legend,
        '</div>',
        '</figure>',
    ]);
}
function coverageMonthly(row, currency) {
    if (row.monthly === 'included')
        return 'incl.';
    return (0, format_1.money)(row.monthly, currency);
}
function evidenceSub(row) {
    if (row.evidenceNote.length === 0)
        return '';
    const kind = row.evidenceKind[0].toUpperCase() + row.evidenceKind.slice(1);
    return `<span class="sub">${(0, shared_1.escapeHtml)(`${kind}: ${row.evidenceNote}`)}</span>`;
}
function renderCoverageRow(row, currency) {
    const capability = row.capability.length === 0 ? '' : `<span class="sub">${(0, shared_1.escapeHtml)(row.capability)}</span>`;
    return (0, shared_1.joinParts)([
        '<tr>',
        `<td class="tool">${(0, shared_1.escapeHtml)(row.tool)}${capability}</td>`,
        `<td>${(0, shared_1.escapeHtml)(row.usage)}${evidenceSub(row)}</td>`,
        `<td>${(0, shared_1.escapeHtml)(row.omTarget)}</td>`,
        `<td>${(0, shared_1.verdictChip)(row.verdict)}</td>`,
        `<td>${(0, shared_1.confidenceBand)(row.confidence)}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)(coverageMonthly(row, currency))}</td>`,
        '</tr>',
    ]);
}
function renderPaidTwice(facts) {
    const rows = facts.coverage.paidTwice;
    if (rows.length === 0)
        return '';
    const items = rows.map((row) => {
        const spend = row.monthlyAcrossTools === null || row.monthlyAcrossTools <= 0
            ? ''
            : ` · ${(0, format_1.money)(row.monthlyAcrossTools, facts.company.currency)}/mo across them`;
        return `<li><span class="n">·</span><div><h3>${(0, shared_1.escapeHtml)(row.capability)}</h3><p>${(0, shared_1.escapeHtml)(row.tools.join(', ') + spend)}</p></div></li>`;
    });
    const capabilities = rows.length === 1 ? 'capability' : 'capabilities';
    return (0, shared_1.joinParts)([
        `<h3>Paid twice — ${(0, shared_1.escapeHtml)((0, shared_1.numeralWord)(rows.length))} ${capabilities} you buy in more than one place</h3>`,
        '<ul class="rule-list">',
        ...items,
        '</ul>',
    ]);
}
function renderCoverage(facts, prose) {
    const currency = facts.company.currency;
    const note = prose.coverageNote === undefined
        ? ''
        : `<p class="footnote">${(0, shared_1.escapeHtml)(prose.coverageNote)}</p>`;
    return (0, shared_1.joinParts)([
        '<section class="pad band pb">',
        (0, shared_1.sectionHead)('Section 04', 'Capability coverage', prose.coverageIntro),
        renderFigureOne(facts, prose),
        '<div class="tablewrap tablewrap--wide">',
        '<table>',
        '<thead>',
        '<tr>',
        '<th>Tool in use</th>',
        '<th>What it is actually used for</th>',
        '<th>Open Mercato</th>',
        '<th>Verdict</th>',
        '<th>Confidence</th>',
        '<th class="num">Monthly</th>',
        '</tr>',
        '</thead>',
        '<tbody>',
        ...facts.coverage.rows.map((row) => renderCoverageRow(row, currency)),
        '</tbody>',
        '</table>',
        '</div>',
        renderPaidTwice(facts),
        note,
        '</section>',
    ]);
}
  });

  __define("report/templates/execSummary", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderNumberedList = renderNumberedList;
exports.renderExecSummary = renderExecSummary;
const shared_1 = require("./shared");
function renderNumberedList(sectionNumber, items) {
    if (items.length === 0)
        return '';
    const rows = items.map((item, index) => (0, shared_1.joinParts)([
        '<li>',
        `<span class="n">${sectionNumber}.${index + 1}</span>`,
        '<div>',
        `<h3>${(0, shared_1.escapeHtml)(item.heading)}</h3>`,
        `<p>${(0, shared_1.escapeHtml)(item.body)}</p>`,
        '</div>',
        '</li>',
    ]));
    return (0, shared_1.joinParts)(['<ul class="rule-list">', ...rows, '</ul>']);
}
function renderExecSummary(prose) {
    var _a;
    const findings = (_a = prose.findings) !== null && _a !== void 0 ? _a : [];
    if (findings.length === 0 && prose.disclaimer === undefined)
        return '';
    const disclaimer = prose.disclaimer === undefined
        ? ''
        : (0, shared_1.joinParts)([
            '<div class="callout callout--plain">',
            '<h4>What this report is not</h4>',
            `<p>${(0, shared_1.escapeHtml)(prose.disclaimer)}</p>`,
            '</div>',
        ]);
    return (0, shared_1.joinParts)([
        '<section class="pad band pb">',
        (0, shared_1.sectionHead)('Section 01', 'Executive summary'),
        renderNumberedList(1, findings),
        disclaimer,
        '</section>',
    ]);
}
  });

  __define("report/templates/kpis", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderKpis = renderKpis;
const format_1 = require("../format");
const shared_1 = require("./shared");
function renderTile(tile) {
    const unit = tile.unit.length === 0 ? '' : `<small>${(0, shared_1.escapeHtml)(tile.unit)}</small>`;
    return (0, shared_1.joinParts)([
        `<div class="kpi${tile.lead ? ' kpi--lead' : ''}">`,
        `<span class="kpi__k">${(0, shared_1.escapeHtml)(tile.key)}</span>`,
        `<span class="kpi__v">${(0, shared_1.escapeHtml)(tile.value)}${unit}</span>`,
        `<span class="kpi__n">${(0, shared_1.escapeHtml)(tile.note)}</span>`,
        '</div>',
    ]);
}
function note(parts) {
    return parts.filter((part) => part.length > 0).join(' · ');
}
function stackShape(facts) {
    const tools = (0, shared_1.countedNoun)(facts.kpis.toolCount, 'tool');
    if (facts.kpis.seatCount === null)
        return tools;
    return note([tools, (0, shared_1.countedNoun)(facts.kpis.seatCount, 'seat')]);
}
function licencesTodayTile(facts) {
    const { kpis, company } = facts;
    if (kpis.licencesTodayMonthly === null) {
        return {
            key: 'Stack today',
            value: (0, format_1.count)(kpis.toolCount),
            unit: kpis.toolCount === 1 ? ' tool' : ' tools',
            note: note([stackShape(facts), 'no costs were supplied']),
            lead: false,
        };
    }
    return {
        key: 'Licences today',
        value: (0, format_1.money)(kpis.licencesTodayMonthly, company.currency),
        unit: '/mo',
        note: note([stackShape(facts), `${(0, format_1.money)(kpis.licencesTodayAnnual, company.currency)} a year`]),
        lead: false,
    };
}
function implementationTile(facts) {
    const { kpis, money: table, company } = facts;
    const hours = (0, shared_1.hoursWithUnit)(kpis.implementationHours, kpis.implementationHoursAreFloor);
    const weeks = kpis.programmeWeeks === null ? '' : (0, shared_1.countedNoun)(kpis.programmeWeeks, 'week');
    if (kpis.implementationCost === null) {
        return {
            key: 'Implementation effort',
            value: hours,
            unit: '',
            note: note([weeks, 'no rate was supplied']),
            lead: false,
        };
    }
    const rate = table.rate === null ? '' : ` at ${(0, format_1.money)(table.rate, company.currency)}/h`;
    return {
        key: 'One-off implementation',
        value: (0, shared_1.floorMoney)(kpis.implementationCost, kpis.implementationHoursAreFloor, company.currency),
        unit: '',
        note: note([`${hours}${rate}`, weeks]),
        lead: false,
    };
}
function breakEvenTile(facts) {
    const { kpis } = facts;
    if (kpis.breakEvenMonth === null) {
        return {
            key: 'Break-even',
            value: 'None',
            unit: '',
            note: `Not reached within ${(0, shared_1.countedNoun)(kpis.horizonMonths, 'month')}`,
            lead: false,
        };
    }
    return {
        key: 'Break-even',
        value: `Month ${(0, format_1.count)(kpis.breakEvenMonth)}`,
        unit: '',
        note: 'Cumulative position turns positive',
        lead: false,
    };
}
function tilesFor(facts) {
    const { kpis, company } = facts;
    const tiles = [licencesTodayTile(facts)];
    if (kpis.licencesAfterMonthly !== null) {
        tiles.push({
            key: 'Licences after',
            value: (0, format_1.money)(kpis.licencesAfterMonthly, company.currency),
            unit: '/mo',
            note: kpis.licencesAfterNote,
            lead: false,
        });
    }
    if (kpis.netRecurringAnnual !== null) {
        const hosting = kpis.hostingMonthly === null
            ? 'Recurring licences only'
            : `After ${(0, format_1.money)(kpis.hostingMonthly, company.currency)}/mo hosting and support`;
        tiles.push({
            key: 'Net recurring saving',
            value: (0, format_1.money)(kpis.netRecurringAnnual, company.currency),
            unit: '/yr',
            note: hosting,
            lead: true,
        });
    }
    tiles.push(implementationTile(facts));
    if (facts.cash !== undefined)
        tiles.push(breakEvenTile(facts));
    if (kpis.netAtHorizon !== null) {
        tiles.push({
            key: `${(0, format_1.count)(kpis.horizonMonths)}-month net`,
            value: (0, shared_1.signedMoney)(kpis.netAtHorizon, company.currency),
            unit: '',
            note: 'All one-off and recurring costs included',
            lead: false,
        });
    }
    return tiles;
}
function nothingGoesOff(facts) {
    return facts.waves.length > 0 && facts.waves.every((wave) => wave.toolsOff.length === 0);
}
function calloutBlock(heading, body) {
    return (0, shared_1.joinParts)([
        '<div class="callout callout--plain">',
        `<h4>${(0, shared_1.escapeHtml)(heading)}</h4>`,
        `<p>${(0, shared_1.escapeHtml)(body)}</p>`,
        '</div>',
    ]);
}
function renderKpis(facts, prose) {
    const tiles = tilesFor(facts);
    const everyToolStays = nothingGoesOff(facts)
        ? calloutBlock('Every tool in your stack earns its place', 'Nothing in this stack is switched off by this programme. What changes is how the ' +
            'tools are wired together, not what you pay for them.')
        : '';
    const callout = prose.recommendation === undefined
        ? ''
        : (0, shared_1.joinParts)([
            '<div class="callout">',
            '<h4>The recommendation in one sentence</h4>',
            `<p>${(0, shared_1.escapeHtml)(prose.recommendation)}</p>`,
            '</div>',
        ]);
    return (0, shared_1.joinParts)([
        '<section class="pad band no-break">',
        (0, shared_1.sectionHead)('At a glance', `The ${(0, shared_1.numeralWord)(tiles.length)} numbers this report is about`),
        '<div class="kpis">',
        ...tiles.map(renderTile),
        '</div>',
        everyToolStays,
        callout,
        '</section>',
    ]);
}
  });

  __define("report/templates/money", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderMoney = renderMoney;
exports.renderPaybackCallout = renderPaybackCallout;
const format_1 = require("../format");
const shared_1 = require("./shared");
const NO_COSTS_NOTE = 'No licence costs were supplied for this stack. This report can tell you what moves, ' +
    'not what it saves: every verdict, every wave and every hour above still holds, but the ' +
    'saving and the payback need invoices.';
const ALL_CONFIGURATION_NOTE = 'Nothing in this stack needs new code. Every hour above is configuration and migration ' +
    'of what you already have.';
function renderRecurringLine(line, currency) {
    return (0, shared_1.joinParts)([
        '<tr>',
        `<td>${(0, shared_1.escapeHtml)(line.label)}</td>`,
        `<td>${(0, shared_1.escapeHtml)(line.basis)}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, shared_1.lineMoney)(line.monthly, line.isDeduction, currency))}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, shared_1.lineMoney)(line.annual, line.isDeduction, currency))}</td>`,
        '</tr>',
    ]);
}
function renderImplementationLine(line, currency) {
    return (0, shared_1.joinParts)([
        '<tr>',
        `<td>${(0, shared_1.escapeHtml)(line.label)}</td>`,
        `<td>${(0, shared_1.escapeHtml)(line.scope)}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, shared_1.hoursCell)(line.hours, line.hoursAreFloor))}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, shared_1.floorMoney)(line.cost, line.hoursAreFloor, currency))}</td>`,
        '</tr>',
    ]);
}
function noCostsNote(facts) {
    const rows = facts.stack.rows;
    if (rows.length === 0 || rows.some((row) => row.monthly !== null))
        return '';
    return `<p class="footnote">${(0, shared_1.escapeHtml)(NO_COSTS_NOTE)}</p>`;
}
function renderRecurringTable(facts) {
    const currency = facts.company.currency;
    const total = facts.money.recurringTotal;
    const tfoot = total === undefined
        ? ''
        : (0, shared_1.joinParts)([
            '<tfoot>',
            '<tr>',
            `<td>${(0, shared_1.escapeHtml)(total.label)}</td>`,
            `<td>${(0, shared_1.escapeHtml)(total.basis)}</td>`,
            `<td class="num">${(0, shared_1.escapeHtml)((0, shared_1.lineMoney)(total.monthly, total.isDeduction, currency))}</td>`,
            `<td class="num">${(0, shared_1.escapeHtml)((0, shared_1.lineMoney)(total.annual, total.isDeduction, currency))}</td>`,
            '</tr>',
            '</tfoot>',
        ]);
    return (0, shared_1.joinParts)([
        '<div class="tablewrap">',
        '<table>',
        '<thead>',
        '<tr><th>Line</th><th>Basis</th><th class="num">Monthly</th><th class="num">Annual</th></tr>',
        '</thead>',
        '<tbody>',
        ...facts.money.recurring.map((line) => renderRecurringLine(line, currency)),
        '</tbody>',
        tfoot,
        '</table>',
        '</div>',
    ]);
}
function implementationBasis(facts) {
    const { rate } = facts.money;
    const rateText = rate === null
        ? 'No blended rate was supplied'
        : `Blended rate ${(0, format_1.money)(rate, facts.company.currency)}/h`;
    return facts.money.totalHoursAreFloor
        ? `${rateText} · a floor, not a quote`
        : rateText;
}
function everythingIsConfiguration(facts) {
    return (facts.waves.length > 0 &&
        facts.waves.every((wave) => wave.scope.every((item) => item.decision !== 'build')));
}
function renderImplementationTable(facts) {
    const currency = facts.company.currency;
    const { money: table } = facts;
    const allConfiguration = everythingIsConfiguration(facts)
        ? `<p class="footnote">${(0, shared_1.escapeHtml)(ALL_CONFIGURATION_NOTE)}</p>`
        : '';
    return (0, shared_1.joinParts)([
        '<div class="tablewrap">',
        '<table>',
        '<thead>',
        '<tr><th>One-off implementation</th><th>Scope</th><th class="num">Hours</th><th class="num">Cost</th></tr>',
        '</thead>',
        '<tbody>',
        ...table.implementation.map((line) => renderImplementationLine(line, currency)),
        '</tbody>',
        '<tfoot>',
        '<tr>',
        '<td>Total</td>',
        `<td>${(0, shared_1.escapeHtml)(implementationBasis(facts))}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, shared_1.hoursCell)(table.totalHours, table.totalHoursAreFloor))}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, shared_1.floorMoney)(table.totalImplementationCost, table.totalHoursAreFloor, currency))}</td>`,
        '</tr>',
        '</tfoot>',
        '</table>',
        '</div>',
        allConfiguration,
    ]);
}
function renderMoney(facts, prose) {
    return (0, shared_1.joinParts)([
        (0, shared_1.sectionHead)('Section 05', 'What it costs and what it returns', prose.moneyIntro),
        noCostsNote(facts),
        renderRecurringTable(facts),
        renderImplementationTable(facts),
    ]);
}
function renderPaybackCallout(facts, prose) {
    const { paybacks } = facts.money;
    if (paybacks.buildOnlyMonths === null || paybacks.programmeMonths === null)
        return '';
    if (prose.paybackNote === undefined)
        return '';
    const buildCost = paybacks.buildOnlyCost === null
        ? format_1.NOT_GIVEN
        : (0, format_1.money)(paybacks.buildOnlyCost, facts.company.currency);
    const buildOnlyUnit = paybacks.buildOnlyMonths === 1 ? 'month' : 'months';
    const figures = `The net-new build (${(0, shared_1.escapeHtml)(buildCost)}) is repaid by the total saving in ` +
        `<b>${(0, shared_1.escapeHtml)((0, shared_1.monthsValue)(paybacks.buildOnlyMonths))} ${buildOnlyUnit}</b>. ` +
        `The full programme breaks even in ` +
        `<b>month ${(0, shared_1.escapeHtml)((0, shared_1.monthsValue)(paybacks.programmeMonths))}</b>.`;
    return (0, shared_1.joinParts)([
        '<div class="callout callout--plain">',
        '<h4>Two payback numbers, and why they differ</h4>',
        `<p>${figures} ${(0, shared_1.escapeHtml)(prose.paybackNote)}</p>`,
        '</div>',
    ]);
}
  });

  __define("report/templates/nextSteps", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderNextSteps = renderNextSteps;
const shared_1 = require("./shared");
function signatory(party) {
    const role = party.role.length === 0 ? '' : ` — ${party.role}`;
    const who = party.person.length === 0 ? '' : `${party.person}${role}`;
    return [who, party.organization].filter((part) => part.length > 0).join(', ');
}
function renderNextSteps(facts, prose) {
    var _a;
    const steps = (_a = prose.nextSteps) !== null && _a !== void 0 ? _a : [];
    const list = steps.length === 0
        ? ''
        : (0, shared_1.joinParts)([
            '<ul class="checklist">',
            ...steps.map((step) => {
                const who = [step.owner, step.when].filter((part) => part.length > 0).join(' · ');
                const line = who.length === 0 ? '' : `<span class="who">${(0, shared_1.escapeHtml)(who)}</span>`;
                return `<li><span class="box"></span><div><b>${(0, shared_1.escapeHtml)(step.action)}</b>${line}</div></li>`;
            }),
            '</ul>',
        ]);
    return (0, shared_1.joinParts)([
        '<section class="pad band pb">',
        (0, shared_1.sectionHead)('Section 09', 'What happens next', prose.nextStepsIntro),
        list,
        '<div class="sign">',
        '<div>',
        '<div class="sign__line"></div>',
        `<p class="sign__who">${(0, shared_1.escapeHtml)(signatory(facts.meta.preparedFor))}</p>`,
        '</div>',
        '<div>',
        '<div class="sign__line"></div>',
        `<p class="sign__who">${(0, shared_1.escapeHtml)(signatory(facts.meta.preparedBy))}</p>`,
        '</div>',
        '</div>',
        '</section>',
    ]);
}
  });

  __define("report/templates/preview", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPreview = renderPreview;
const shared_1 = require("./shared");
const execSummary_1 = require("./execSummary");
function renderPreview(facts, prose) {
    var _a;
    const { preview } = facts;
    if (preview === undefined)
        return '';
    const blocked = preview.verdict === 'blocked'
        ? (0, shared_1.joinParts)([
            '<div class="callout callout--plain">',
            '<h4>Where the preview stops</h4>',
            `<p>${(0, shared_1.escapeHtml)(preview.blockedAtStep.length === 0
                ? 'QA could not walk the golden path end to end in this build.'
                : `QA could not get past this step: ${preview.blockedAtStep}`)}</p>`,
            '</div>',
        ])
        : '';
    const screens = preview.screens.length === 0
        ? ''
        : `<p class="footnote">${(0, shared_1.escapeHtml)(`Screens in the attached preview: ${preview.screens.map((screen) => screen.name).join(', ')}.`)}</p>`;
    return (0, shared_1.joinParts)([
        '<section class="pad band pb">',
        (0, shared_1.sectionHead)('Section 07', 'Your preview', prose.previewIntro),
        (0, execSummary_1.renderNumberedList)(7, (_a = prose.previewNotes) !== null && _a !== void 0 ? _a : []),
        blocked,
        screens,
        '</section>',
    ]);
}
  });

  __define("report/templates/risks", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderRisks = renderRisks;
const shared_1 = require("./shared");
function renderRisk(risk) {
    const basis = risk.basis.length === 0 ? '' : `<span class="sub">${(0, shared_1.escapeHtml)(risk.basis)}</span>`;
    return (0, shared_1.joinParts)([
        '<tr>',
        `<td class="num">${(0, shared_1.escapeHtml)(risk.id)}</td>`,
        `<td><b>${(0, shared_1.escapeHtml)(risk.risk)}</b>${basis}</td>`,
        `<td>${(0, shared_1.escapeHtml)(risk.effect)}</td>`,
        `<td>${(0, shared_1.escapeHtml)(risk.handling)}</td>`,
        '</tr>',
    ]);
}
function renderRisks(prose) {
    var _a;
    const risks = (_a = prose.risks) !== null && _a !== void 0 ? _a : [];
    if (risks.length === 0)
        return '';
    return (0, shared_1.joinParts)([
        '<section class="pad band pb">',
        (0, shared_1.sectionHead)('Section 08', 'Risks and assumptions', prose.risksIntro),
        '<div class="tablewrap tablewrap--wide">',
        '<table>',
        '<thead>',
        '<tr><th>#</th><th>Risk or assumption</th><th>Effect if it turns out otherwise</th><th>How we would handle it</th></tr>',
        '</thead>',
        '<tbody>',
        ...risks.map(renderRisk),
        '</tbody>',
        '</table>',
        '</div>',
        '</section>',
    ]);
}
  });

  __define("report/templates/sequence", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderSequence = renderSequence;
const format_1 = require("../format");
const shared_1 = require("./shared");
function drops(wave) {
    const chips = [
        ...wave.toolsOff.map((tool) => `${tool} off`),
        ...wave.toolsReduced.map((tool) => `${tool} reduced`),
    ];
    if (chips.length === 0)
        return '';
    const spans = chips.map((chip) => `<span>${(0, shared_1.escapeHtml)(chip)}</span>`).join('');
    return `<div class="drops">${spans}</div>`;
}
function waveBody(wave, prose) {
    var _a;
    const note = (_a = prose.waveNotes) === null || _a === void 0 ? void 0 : _a.find((candidate) => candidate.waveNumber === wave.n);
    if (note !== undefined)
        return `<p>${(0, shared_1.escapeHtml)(note.body)}</p>`;
    if (wave.scope.length === 0)
        return '';
    const items = wave.scope.map((item) => {
        const hours = item.estimatedHours === null
            ? item.decision === 'build'
                ? ` · ${(0, shared_1.hoursCell)(null, true)}`
                : ''
            : ` · ${(0, format_1.count)(item.estimatedHours)} h`;
        return `<span>${(0, shared_1.escapeHtml)(`${item.source} — ${item.capability} · ${item.decision}${hours}`)}</span>`;
    });
    return `<div class="drops">${items.join('')}</div>`;
}
function weekSpan(wave) {
    if (wave.weekFrom === wave.weekTo)
        return `Week ${(0, shared_1.escapeHtml)((0, format_1.count)(wave.weekFrom))}`;
    return `Weeks ${(0, shared_1.escapeHtml)((0, format_1.count)(wave.weekFrom))}–${(0, shared_1.escapeHtml)((0, format_1.count)(wave.weekTo))}`;
}
function bankedCell(wave, currency) {
    if (wave.monthlyBanked === null) {
        return ['<b>—</b>', `<span>banked from month ${(0, shared_1.escapeHtml)((0, format_1.count)(wave.bankedFromMonth))}</span>`];
    }
    if (wave.monthlyBanked === 0) {
        return [
            `<b>${(0, shared_1.escapeHtml)((0, format_1.money)(0, currency))}<span class="sub">/mo</span></b>`,
            '<span>no tool switches off in this wave</span>',
        ];
    }
    return [
        `<b>${(0, shared_1.escapeHtml)((0, shared_1.signedMoney)(wave.monthlyBanked, currency))}<span class="sub">/mo</span></b>`,
        `<span>banked from month ${(0, shared_1.escapeHtml)((0, format_1.count)(wave.bankedFromMonth))}</span>`,
    ];
}
function renderWave(wave, prose, currency) {
    const when = `<b>Wave ${(0, shared_1.escapeHtml)((0, format_1.count)(wave.n))}</b>${weekSpan(wave)}` +
        `<br>${(0, shared_1.escapeHtml)((0, shared_1.hoursWithUnit)(wave.hours, wave.hoursAreFloor))}`;
    return (0, shared_1.joinParts)([
        '<div class="wave">',
        `<div class="wave__when">${when}</div>`,
        '<div class="wave__body">',
        `<h3>${(0, shared_1.escapeHtml)(wave.title)}</h3>`,
        waveBody(wave, prose),
        drops(wave),
        '</div>',
        '<div class="wave__save">',
        ...bankedCell(wave, currency),
        '</div>',
        '</div>',
    ]);
}
function renderSequence(facts, prose) {
    if (facts.waves.length === 0)
        return '';
    const note = prose.sequenceNote === undefined
        ? ''
        : `<p class="footnote">${(0, shared_1.escapeHtml)(prose.sequenceNote)}</p>`;
    return (0, shared_1.joinParts)([
        '<section class="pad band pb">',
        (0, shared_1.sectionHead)('Section 06', 'Recommended sequence', prose.sequenceIntro),
        '<div class="waves">',
        ...facts.waves.map((wave) => renderWave(wave, prose, facts.company.currency)),
        '</div>',
        note,
        '</section>',
    ]);
}
  });

  __define("report/templates/shared", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TO_ESTIMATE = exports.MINUS = void 0;
exports.escapeHtml = escapeHtml;
exports.signedMoney = signedMoney;
exports.deductedMoney = deductedMoney;
exports.lineMoney = lineMoney;
exports.isoToShortDate = isoToShortDate;
exports.hoursCell = hoursCell;
exports.hoursWithUnit = hoursWithUnit;
exports.floorMoney = floorMoney;
exports.countedNoun = countedNoun;
exports.verdictChipClass = verdictChipClass;
exports.verdictChip = verdictChip;
exports.confidenceBand = confidenceBand;
exports.amountInWords = amountInWords;
exports.monthsValue = monthsValue;
exports.numeralWord = numeralWord;
exports.svgNum = svgNum;
exports.joinParts = joinParts;
exports.sectionHead = sectionHead;
exports.optionalParagraph = optionalParagraph;
const format_1 = require("../format");
const ESCAPES = Object.freeze({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
});
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}
exports.MINUS = '−';
function signedMoney(value, currency) {
    if (value === null || value === undefined || !Number.isFinite(value))
        return format_1.NOT_GIVEN;
    const digits = (0, format_1.money)(Math.abs(value), currency);
    return value < 0 ? `${exports.MINUS}${digits}` : `+${digits}`;
}
function deductedMoney(value, currency) {
    if (value === null || value === undefined || !Number.isFinite(value))
        return format_1.NOT_GIVEN;
    const digits = (0, format_1.money)(Math.abs(value), currency);
    return Math.round(value) === 0 ? digits : `${exports.MINUS}${digits}`;
}
function lineMoney(value, isDeduction, currency) {
    return isDeduction ? deductedMoney(value, currency) : (0, format_1.money)(value, currency);
}
const MONTH_ABBREV_LENGTH = 3;
function isoToShortDate(iso) {
    const long = (0, format_1.isoToLongDate)(iso);
    if (long === iso)
        return iso;
    const parts = long.split(' ');
    if (parts.length !== 3)
        return long;
    return `${parts[0]} ${parts[1].slice(0, MONTH_ABBREV_LENGTH)} ${parts[2]}`;
}
function hoursCell(hours, isFloor) {
    if (hours === null || hours === undefined || !Number.isFinite(hours)) {
        return isFloor ? exports.TO_ESTIMATE : format_1.NOT_GIVEN;
    }
    if (isFloor && hours <= 0)
        return exports.TO_ESTIMATE;
    return isFloor ? `${(0, format_1.count)(hours)}+` : (0, format_1.count)(hours);
}
exports.TO_ESTIMATE = 'to estimate';
function hoursWithUnit(hours, isFloor) {
    const cell = hoursCell(hours, isFloor);
    return cell === exports.TO_ESTIMATE || cell === format_1.NOT_GIVEN ? cell : `${cell} h`;
}
function floorMoney(value, isFloor, currency) {
    const rendered = (0, format_1.money)(value, currency);
    if (!isFloor)
        return rendered;
    if (value === null || value === undefined || !Number.isFinite(value))
        return exports.TO_ESTIMATE;
    return Math.round(value) === 0 ? exports.TO_ESTIMATE : `${rendered}+`;
}
function countedNoun(value, singular, plural) {
    const word = value === 1 ? singular : (plural !== null && plural !== void 0 ? plural : `${singular}s`);
    return `${(0, format_1.count)(value)} ${word}`;
}
function verdictChipClass(verdict) {
    switch (verdict) {
        case 'native':
            return 'chip--native';
        case 'configure':
            return 'chip--configure';
        case 'build':
            return 'chip--build';
        case 'integrate':
            return 'chip--integrate';
        case 'keep':
            return 'chip--keep';
        case 'drop':
            return 'chip--drop';
        case 'off-catalog':
            return 'chip--unknown';
        default: {
            const unknownVerdict = verdict;
            throw new Error(`[mercatify-labs] renderReport: unknown verdict: ${String(unknownVerdict)}`);
        }
    }
}
function verdictChip(verdict) {
    return `<span class="chip ${verdictChipClass(verdict)}">${escapeHtml(verdict)}</span>`;
}
function confidenceBand(confidence) {
    return (`<span class="conf conf--${escapeHtml(confidence)}">` +
        '<span class="conf__bars"><i></i><i></i><i></i></span>' +
        `${escapeHtml(confidence)}</span>`);
}
const CURRENCY_WORDS = Object.freeze({
    EUR: 'euro',
    USD: 'dollars',
    PLN: 'zloty',
    GBP: 'pounds',
});
function amountInWords(value, currency) {
    const digits = (0, format_1.count)(Math.abs(value));
    const unit = Object.hasOwn(CURRENCY_WORDS, currency) ? CURRENCY_WORDS[currency] : currency;
    return `${digits} ${unit}`;
}
function monthsValue(value) {
    if (value === null || value === undefined || !Number.isFinite(value))
        return format_1.NOT_GIVEN;
    if (Number.isInteger(value))
        return (0, format_1.count)(value);
    return (Math.round(value * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });
}
const NUMERAL_WORDS = Object.freeze([
    'zero', 'one', 'two', 'three', 'four', 'five', 'six',
    'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
]);
function numeralWord(value) {
    if (!Number.isInteger(value) || value < 0 || value >= NUMERAL_WORDS.length)
        return (0, format_1.count)(value);
    return NUMERAL_WORDS[value];
}
function svgNum(value) {
    return String(Math.round(value * 100) / 100);
}
function joinParts(parts) {
    return parts.filter((part) => part.length > 0).join('\n');
}
function sectionHead(label, title, intro) {
    return joinParts([
        '<div class="sec__head">',
        `<span class="sec__no">${escapeHtml(label)}</span>`,
        `<h2>${escapeHtml(title)}</h2>`,
        optionalParagraph(intro),
        '</div>',
    ]);
}
function optionalParagraph(text, className) {
    if (text === undefined || text.trim().length === 0)
        return '';
    const attr = className === undefined ? '' : ` class="${escapeHtml(className)}"`;
    return `<p${attr}>${escapeHtml(text)}</p>`;
}
  });

  __define("report/templates/stackTable", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderStackTable = renderStackTable;
const format_1 = require("../format");
const shared_1 = require("./shared");
function termCell(row) {
    if (row.termType === 'monthly')
        return '<td>Monthly</td>';
    if (row.termEnds.length === 0)
        return '<td>Annual<span class="sub">End date not given</span></td>';
    return `<td>${(0, shared_1.escapeHtml)((0, shared_1.isoToShortDate)(row.termEnds))}<span class="sub">Annual, locked</span></td>`;
}
function renderRow(row, currency) {
    const plan = row.plan.length === 0 ? '' : `<span class="sub">${(0, shared_1.escapeHtml)(row.plan)}</span>`;
    return (0, shared_1.joinParts)([
        '<tr>',
        `<td class="tool">${(0, shared_1.escapeHtml)(row.tool)}${plan}</td>`,
        `<td>${(0, shared_1.escapeHtml)(row.category)}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, format_1.count)(row.seats))}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, format_1.money)(row.unitPrice, currency))}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, format_1.money)(row.monthly, currency))}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, format_1.money)(row.annual, currency))}</td>`,
        termCell(row),
        '</tr>',
    ]);
}
function renderStackTable(facts, prose) {
    const { stack, company } = facts;
    const currency = company.currency;
    const total = (0, shared_1.joinParts)([
        '<tfoot>',
        '<tr>',
        `<td colspan="2">Total across ${(0, shared_1.escapeHtml)((0, shared_1.countedNoun)(stack.rows.length, 'tool'))}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, format_1.count)(stack.totalSeats))}</td>`,
        `<td class="num">${format_1.NOT_GIVEN}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, format_1.money)(stack.totalMonthly, currency))}</td>`,
        `<td class="num">${(0, shared_1.escapeHtml)((0, format_1.money)(stack.totalAnnual, currency))}</td>`,
        `<td>${format_1.NOT_GIVEN}</td>`,
        '</tr>',
        '</tfoot>',
    ]);
    const note = stack.seatDuplicationNote.length === 0
        ? ''
        : `<p class="footnote">${(0, shared_1.escapeHtml)(stack.seatDuplicationNote)}</p>`;
    return (0, shared_1.joinParts)([
        '<section class="pad band pb">',
        (0, shared_1.sectionHead)('Section 03', 'Your stack today', prose.stackIntro),
        '<div class="tablewrap tablewrap--wide">',
        '<table>',
        '<thead>',
        '<tr>',
        '<th>Tool</th>',
        '<th>Category</th>',
        '<th class="num">Seats</th>',
        '<th class="num">Unit</th>',
        '<th class="num">Monthly</th>',
        '<th class="num">Annual</th>',
        '<th>Term ends</th>',
        '</tr>',
        '</thead>',
        '<tbody>',
        ...stack.rows.map((row) => renderRow(row, currency)),
        '</tbody>',
        total,
        '</table>',
        '</div>',
        note,
        '</section>',
    ]);
}
  });

  var __entry = __load("report/renderReport");
  var __glossary = __load("report/glossary");
  globalScope.renderReport = __entry.renderReport;
  globalScope.REPORT_GLOSSARY = __glossary.REPORT_GLOSSARY;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      renderReport: __entry.renderReport,
      REPORT_GLOSSARY: __glossary.REPORT_GLOSSARY,
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
