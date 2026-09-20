import { REPORT_STYLE } from './reportStyle'
import { resolveProseSlots } from './slots'
import type { ReportFacts, ReportModel, ReportProse } from './model'
import { renderCover, renderDocFoot, renderPrintFooter, renderToolbar } from './templates/cover'
import { renderKpis } from './templates/kpis'
import { renderExecSummary } from './templates/execSummary'
import { renderBasis } from './templates/basis'
import { renderStackTable } from './templates/stackTable'
import { renderCoverage } from './templates/coverage'
import { renderMoney, renderPaybackCallout } from './templates/money'
import { CASH_PLOT_BOX, cashHits, cashHitWidth, renderCashflow } from './templates/cashflow'
import { renderSequence } from './templates/sequence'
import { renderPreview } from './templates/preview'
import { renderRisks } from './templates/risks'
import { renderNextSteps } from './templates/nextSteps'
import { renderAppendixA } from './templates/appendixA'
import { renderAppendixB } from './templates/appendixB'
import { escapeHtml, joinParts } from './templates/shared'

/**
 * `renderReport` - czysta funkcja `ReportModel -> HTML`.
 *
 * Dokument jest JEDNOPLIKOWY i samowystarczalny: styl w `<style>`, obie
 * figury jako inline SVG, ani jednego `<link>`, `<img>` ani `<iframe>`. To nie
 * jest preferencja - raport jedzie mailem, a klient pocztowy nie pobierze
 * zasobu zewnętrznego (a gdyby pobrał, powiedziałby nadawcy, kto i kiedy
 * otworzył dokument z cennikiem).
 *
 * Kolejność operacji jest ta sama, co w `writePreview`
 * (`src/preview/renderPreview.ts`): najpierw wszystko, co może rzucić
 * (`resolveProseSlots` na nieznanym slocie), potem składanie. Dzięki temu zły
 * slot w jednym zdaniu nie zostawia w pamięci pół dokumentu.
 *
 * Proza jest w CAŁOŚCI opcjonalna (SPEC.md §8). Brak prozy nie jest błędem i
 * nie daje pustych bloków - sekcje, które bez zdań nie niosą nic, po prostu
 * nie powstają. Tak samo `facts.cash`, `facts.preview` i `facts.waves`: każde
 * z nich rządzi swoim kawałkiem dokumentu i każdy brak ma własną, nazwaną
 * odpowiedź, a nie wyjątek.
 */

/**
 * Znaczniki sekcji. Są w wyjściu z tego samego powodu, co w goldenie: ktoś
 * czyta ten HTML w edytorze, kiedy klient pyta "skąd ta liczba". Test
 * porównuje raport z golden masterem SEKCJA PO SEKCJI właśnie po nich.
 */
function marker(name: string): string {
  return `<!-- ============ ${name} ============ -->`
}

function documentTitle(facts: ReportFacts): string {
  return `Stack Consolidation Report — ${facts.meta.preparedFor.organization}`
}

function documentDescription(facts: ReportFacts): string {
  return (
    `Mercatify stack consolidation report for ${facts.meta.preparedFor.organization} ` +
    `(${facts.meta.caseId}): capability coverage, computed savings and a phased migration ` +
    'onto Open Mercato.'
  )
}

/**
 * Dane do skryptu. `<` uciekamy w JSON-ie, bo `"</script>"` w podpisie kamienia
 * milowego zamknąłby blok skryptu i reszta dokumentu wjechałaby do strony jako
 * kod. To jedyne miejsce, w którym wartość modelu trafia poza HTML, więc
 * `escapeHtml` tu nie pomaga - encje w JavaScripcie nie są dekodowane.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003C')
}

/**
 * Skrypt jest DODATKIEM, nie warunkiem czytelności: dodaje dymki, przełącznik
 * motywu i przycisk druku. Klient pocztowy go wytnie i dokument nadal niesie
 * każdą liczbę - dymki powtarzają tabelę kamieni milowych, a motyw ma wersję
 * z `prefers-color-scheme`.
 */
function renderScript(facts: ReportFacts): string {
  const hits = cashHits(facts)
  return joinParts([
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
    `  var hitWidth = ${jsonForScript(cashHitWidth(facts))};`,
    `  var plotTop = ${CASH_PLOT_BOX.top};`,
    `  var plotHeight = ${CASH_PLOT_BOX.height};`,
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
  ])
}

/**
 * Sekcja 05 jest składana z DWÓCH szablonów (`money` + `cashflow`) w jednym
 * `<section>`, bo w dokumencie to jedna sekcja, a w kodzie - dwie niezależne
 * odpowiedzialności: tabele stoją na `facts.money`, wykres na `facts.cash`, i
 * tylko ten drugi znika, kiedy klient nie podał kosztów.
 */
function renderMoneySection(facts: ReportFacts, prose: ReportProse): string {
  return joinParts([
    '<section class="pad band pb">',
    renderMoney(facts, prose),
    renderCashflow(facts, prose),
    renderPaybackCallout(facts, prose),
    '</section>',
  ])
}

export function renderReport(model: ReportModel): string {
  const { facts } = model
  // Sloty rozwiązujemy PRZED złożeniem czegokolwiek: nieznany slot ma wywalić
  // cały render, a nie zostawić w zdaniu o pieniądzach dziurę albo klamry.
  const prose: ReportProse =
    model.prose === undefined ? {} : resolveProseSlots(model.prose, facts)

  const body = joinParts([
    renderToolbar(facts),
    '<div class="doc" id="top">',
    marker('COVER'),
    renderCover(facts, prose),
    marker('AT A GLANCE'),
    renderKpis(facts, prose),
    marker('1. EXECUTIVE SUMMARY'),
    renderExecSummary(prose),
    marker('2. SCOPE'),
    renderBasis(facts, prose),
    marker('3. STACK TODAY'),
    renderStackTable(facts, prose),
    marker('4. COVERAGE'),
    renderCoverage(facts, prose),
    marker('5. MONEY'),
    renderMoneySection(facts, prose),
    marker('6. SEQUENCE'),
    renderSequence(facts, prose),
    marker('7. PREVIEW'),
    renderPreview(facts, prose),
    marker('8. RISKS'),
    renderRisks(prose),
    marker('9. NEXT STEPS'),
    renderNextSteps(facts, prose),
    marker('APPENDIX A'),
    renderAppendixA(facts, prose),
    marker('APPENDIX B'),
    renderAppendixB(facts, prose),
    renderDocFoot(facts),
    '</div>',
    renderPrintFooter(facts),
    '<div class="tip" id="tip" role="status" aria-live="polite"></div>',
    renderScript(facts),
  ])

  return joinParts([
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(documentTitle(facts))}</title>`,
    `<meta name="description" content="${escapeHtml(documentDescription(facts))}">`,
    `<style>${REPORT_STYLE}</style>`,
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
  ])
}
