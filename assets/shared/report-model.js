/* Mercatify — mapping → ReportModel, one copy for both apps.

   The document itself is rendered by window.renderReport(), which is the
   TypeScript renderer from mercatify-labs/src/report/ transpiled into
   report-renderer.generated.js. This file is the only thing between a request
   in the console store and that renderer: it turns the mapping a consultant
   confirmed into the model the renderer eats.

   Classic script. Load order on every page that shows a report:

     ../shared/catalog.generated.js        CAPS, capability labels
     ../shared/om-core.js                  the request store and buildOffer()
     ../shared/report-renderer.generated.js   renderReport + REPORT_GLOSSARY
     ../shared/report-model.js             this file

   ── What this adapter will not do ──────────────────────────────────────────

   It does not invent. A request in this mock carries tools, seats, monthly
   cost, capability slugs and the consultant's overrides — and that is all. It
   carries no waves, no cash series, no billing terms, no contact person, no
   description of what was read. The model has an optional half for exactly
   that reason, and the renderer drops what is missing rather than printing it
   as zero:

     facts.cash omitted     → section 05 says no costs were supplied instead of
                              plotting a curve through invented months
     facts.waves = []       → section 06 disappears; there is no sequence here
     facts.preview omitted  → section 07 disappears; nothing was prototyped
     empty basis strings    → section 02 prints "no billing period was stated"
                              rather than a blank card

   Anything written below therefore comes from the request, from the
   consultant's own fields on the report screen, or from a named constant of
   the method — never from a guess dressed as a figure. */

/* Constants of the method, not data about a client. They read the same in
   every report, which is why the renderer keeps HEADLINE the same way. */
var REPORT_BASIS = 'Open Mercato — self-hosted, source available';
var REPORT_VERSION = '1.0';

/* Weeks in a month, for turning the consultant's "implementation months" into
   the programme length the KPI tile prints. A unit conversion of a number
   somebody typed, not a new estimate. */
var WEEKS_PER_MONTH = 52 / 12;

/* How long the work takes, in months. The consultant says; three is what this
   mock has always assumed when nobody has (buildOffer does the same), and the
   number is on screen next to the report so it can be argued with. It is never
   zero: the KPI tile always prints the programme length, and "0 weeks" would
   be a claim rather than a gap. */
var DEFAULT_PROGRAMME_MONTHS = 3;
function programmeMonths(value) {
  return positiveOrNull(value) || DEFAULT_PROGRAMME_MONTHS;
}

function labelForCap(slug) {
  if (typeof capLabel === 'function') return capLabel(slug);
  return slug;
}

/* A slug the mock's capability map has never heard of. It still gets a row and
   a verdict (capTarget falls back to build), but it is also counted as
   off-catalog and carried into Appendix B — the same honesty the engine's
   findCatalogGaps gives the real pipeline. */
function isOffCatalog(slug) {
  return typeof CAP_MAP !== 'object' || CAP_MAP === null || !CAP_MAP[slug];
}

/* Own date helper: the stack tool loads this file without om-core, so nothing
   here may reach for the console's today(). */
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function positiveOrNull(value) {
  var n = Number(value);
  return isFinite(n) && n > 0 ? n : null;
}

/* One row per tool × capability, in the order the client listed them. This is
   the unit the report calls a "usage statement", so section 02's counters,
   Figure 1 and the coverage table are all built from this one list and cannot
   disagree about how many there are. */
function coverageStatements(req, offer) {
  var byCap = {};
  offer.caps.forEach(function (c) { byCap[c.cap] = c; });

  var out = [];
  (req.tools || []).forEach(function (tool) {
    var first = true;
    (tool.caps || []).forEach(function (slug) {
      var row = byCap[slug];
      if (!row) return;
      out.push({
        tool: tool.name,
        slug: slug,
        row: row,
        /* 'included' on the second and later rows of one tool. Not zero, which
           would sum wrongly, and not a dash, which would read as "unknown":
           the invoice is one invoice and it is already counted above. */
        monthly: first ? positiveOrNull(tool.monthly) : 'included',
        offCatalog: isOffCatalog(slug)
      });
      first = false;
    });
  });
  return out;
}

function coverageFacts(statements, offer, monthlyByTool) {
  var byVerdict = { native: 0, configure: 0, build: 0, integrate: 0, keep: 0, drop: 0, offCatalog: 0 };
  var rows = statements.map(function (s) {
    /* Counted once: an off-catalog statement lands in its own bucket rather
       than in the verdict it was given by the fallback. Figure 1's total then
       equals the number of statements in section 02, which is the whole point
       of both numbers. */
    if (s.offCatalog) byVerdict.offCatalog += 1;
    else byVerdict[s.row.status] = (byVerdict[s.row.status] || 0) + 1;

    return {
      tool: s.tool,
      capability: labelForCap(s.slug),
      /* What the client actually does with it. The mock never asked, so the
         only honest filler is what a consultant typed on the mapping row. */
      usage: s.row.note || '',
      /* Nobody watched anyone use this tool: the mapping is read off a form.
         'inferred' is the same default fromBrief.ts applies, for the same
         reason — 'observed' would claim somebody looked. */
      evidenceKind: 'inferred',
      evidenceNote: s.row.edited ? 'Verdict corrected by hand during the mapping' : '',
      omTarget: moduleById(s.row.module).label,
      verdict: s.row.status,
      confidence: s.row.conf,
      monthly: s.monthly
    };
  });

  /* Same job on more than one invoice. The amount is what the tools carrying
     it cost together, which is the number that makes the point. */
  var paidTwice = offer.duplicates.map(function (c) {
    var spend = 0;
    var known = false;
    c.tools.forEach(function (name) {
      var monthly = monthlyByTool[name];
      if (monthly) { spend += monthly; known = true; }
    });
    return {
      capability: c.label,
      tools: c.tools,
      monthlyAcrossTools: known ? spend : null
    };
  });

  return { rows: rows, byVerdict: byVerdict, paidTwice: paidTwice };
}

function stackFacts(req, offer, hasCosts) {
  var rows = (req.tools || []).map(function (tool) {
    var seats = positiveOrNull(tool.seats);
    var monthly = positiveOrNull(tool.monthly);
    return {
      tool: tool.name,
      /* The queue stores a tool as name + seats + monthly + caps. Plan,
         category and the billing term were in the brief and did not survive
         the flattening, so they are blank here rather than guessed. */
      plan: tool.plan || '',
      category: tool.category || '',
      seats: seats,
      unitPrice: seats !== null && monthly !== null ? Math.round((monthly / seats) * 100) / 100 : null,
      monthly: monthly,
      annual: monthly === null ? null : monthly * 12,
      termEnds: tool.termEnds || '',
      termType: tool.termType === 'annual' ? 'annual' : 'monthly'
    };
  });

  var seats = positiveOrNull(offer.seats);
  var people = positiveOrNull(req.people);
  return {
    rows: rows,
    totalSeats: seats,
    totalMonthly: hasCosts ? offer.monthlyNow : null,
    totalAnnual: hasCosts ? offer.monthlyNow * 12 : null,
    seatDuplicationNote: seats !== null && people !== null && seats > people
      ? seats + ' seats across ' + people + ' people — the same person is licensed more than once.'
      : ''
  };
}

/* The arithmetic of section 05, one line per step, each with the basis printed
   beside it. Same lines the console has always shown, in the shape the
   renderer's recurring table wants. */
function moneyFacts(offer, hasCosts) {
  var toolCount = offer.retire.length + offer.stays.length;
  var names = function (list) {
    return list.map(function (t) { return t.name; }).join(', ') || 'none';
  };
  var line = function (label, basis, monthly, isDeduction) {
    return {
      label: label,
      basis: basis,
      /* `monthly` bywa `null` ("nie podano"), a `null * 12` w JS daje 0 - czyli
         brak danych zamieniał się w twierdzenie "zero" w kolumnie rocznej.
         Sprawdzamy null JAWNIE, zamiast liczyć na arytmetykę. */
      monthly: hasCosts ? monthly : null,
      annual: hasCosts && monthly !== null && monthly !== undefined ? monthly * 12 : null,
      isDeduction: !!isDeduction
    };
  };

  var recurring = [
    line('Licences today', toolCount + ' tools as invoiced', offer.monthlyNow, false),
    line('Licences switched off', names(offer.retire), offer.monthlyRetire, true),
    line('Licences retained', names(offer.stays), offer.retained, false),
    line('Hosting and support', offer.hosting ? 'Consultant estimate' : 'Not entered', positiveOrNull(offer.hosting), false)
  ];

  /* One implementation line per thing that genuinely needs building. waveNumber
     is part of the type but nothing renders it, and this mapping has no waves
     to number — so it stays 0 rather than inventing a sequence. */
  var implementation = offer.buildRows.map(function (c) {
    var floor = c.hours === null;
    return {
      waveNumber: 0,
      label: labelForCap(c.cap),
      scope: c.tools.join(', '),
      hours: floor ? 0 : c.hours,
      cost: floor || !offer.rate ? null : c.hours * offer.rate,
      hoursAreFloor: floor
    };
  });

  return {
    recurring: recurring,
    implementation: implementation,
    totalHours: offer.hours,
    rate: offer.rate || null,
    totalImplementationCost: offer.rate ? offer.oneOff : null,
    totalHoursAreFloor: offer.unestimated > 0,
    paybacks: {
      buildOnlyMonths: offer.breakEven,
      buildOnlyCost: offer.rate ? offer.oneOff : null,
      /* The programme break-even comes out of the timed cash model, and there
         is no cash model here. Null keeps the two-payback callout off the page
         instead of printing one number twice. */
      programmeMonths: null
    },
    recurringTotal: hasCosts ? {
      label: 'Net recurring saving',
      basis: 'Steady state, once the last tool is off',
      monthly: offer.monthlySaving,
      annual: offer.annualSaving,
      isDeduction: false
    } : undefined
  };
}

function kpiFacts(req, offer, statements, hasCosts) {
  var toolCount = offer.retire.length + offer.stays.length;
  var estimated = offer.buildRows
    .map(function (c) { return c.hours; })
    .filter(function (h) { return h !== null; });

  return {
    licencesTodayMonthly: hasCosts ? offer.monthlyNow : null,
    licencesTodayAnnual: hasCosts ? offer.monthlyNow * 12 : null,
    toolCount: toolCount,
    seatCount: positiveOrNull(offer.seats),
    licencesAfterMonthly: hasCosts ? offer.monthlyAfter : null,
    licencesAfterNote: offer.stays.length
      ? offer.stays.map(function (t) { return t.name; }).join(' + ') + ' stay on purpose'
      : 'Nothing is retained on the current verdicts',
    netRecurringAnnual: hasCosts ? offer.annualSaving : null,
    hostingMonthly: offer.hosting || null,
    implementationCost: offer.rate ? offer.oneOff : null,
    implementationHours: offer.hours,
    implementationHoursAreFloor: offer.unestimated > 0,
    programmeWeeks: Math.round(programmeMonths(offer.months) * WEEKS_PER_MONTH),
    /* Both of these come from the timed cash model, which needs waves. Without
       one there is no break-even and no horizon figure, and null is how the
       model says so — the two tiles simply do not appear. */
    breakEvenMonth: null,
    netAtHorizon: null,
    horizonMonths: 0,
    licencesCancelledMonthly: hasCosts ? offer.monthlyRetire : null,
    largestBuildHours: estimated.length ? Math.max.apply(null, estimated) : null
  };
}

/* Everything a consultant typed on the report screen, and nothing else. Prose
   is optional in the model, so a report written without a word still renders —
   it just has no sentences in it. */
function reportProse(offer) {
  return composeProse({
    recommendation: offer.headline,
    pains: offer.pains,
    closing: offer.notes,
    openQuestions: offer.openQuestions
  });
}

/* The four free-text fields any of these flows can carry, placed where the
   renderer has a home for them. Every one is optional; a report written
   without a word still renders, it just has no sentences in it. */
function composeProse(input) {
  var prose = {};
  if (input.recommendation) prose.recommendation = input.recommendation;
  /* The client's own words about what hurts. Quoted, not paraphrased, and
     marked as a quote — the cover lede is the one paragraph where the reader
     expects to be told what this is about. */
  if (input.pains) prose.coverLede = 'In your own words: ' + input.pains;
  if (input.closing) prose.nextStepsIntro = input.closing;

  var questions = (input.openQuestions || '').split('\n')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
  if (questions.length) {
    prose.risksIntro = 'Written down by the consultant who read your stack, before anything moves.';
    prose.risks = questions.map(function (text, i) {
      /* The numbering is the author's in the engine because other sections
         cite it by text. Nothing cites it here, so position is the honest id. */
      return { id: '8.' + (i + 1), risk: text, basis: '', effect: '', handling: '' };
    });
  }
  return prose;
}

/* Off-catalog statements, carried openly into Appendix B instead of being
   quietly given a module. */
function gapFacts(statements) {
  var gaps = [];
  statements.forEach(function (s) {
    if (!s.offCatalog) return;
    gaps.push({
      id: 'B' + (gaps.length + 1),
      source: s.tool,
      capability: labelForCap(s.slug),
      described: s.row.note || labelForCap(s.slug)
    });
  });
  return gaps;
}

function reportFacts(req, offer) {
  /* No costs at all is a different answer from "it is free". Every money field
     goes null in that case and the renderer says so out loud. */
  var hasCosts = (req.tools || []).some(function (t) { return positiveOrNull(t.monthly) !== null; });
  var statements = coverageStatements(req, offer);
  var offCatalog = statements.filter(function (s) { return s.offCatalog; }).length;

  var monthlyByTool = {};
  (req.tools || []).forEach(function (t) { monthlyByTool[t.name] = positiveOrNull(t.monthly) || 0; });

  return {
    meta: {
      caseId: req.ref,
      version: REPORT_VERSION,
      issued: offer.generatedAt,
      /* No expiry was agreed anywhere in this flow. An empty string prints an
         empty date rather than a commercial deadline nobody set. */
      validUntil: '',
      preparedFor: { organization: req.company, person: '', role: '' },
      preparedBy: { organization: 'Mercatify', person: offer.analyst || '', role: offer.analyst ? 'consultant on record' : '' },
      /* Reaching this screen means somebody confirmed the mapping — that is
         what `mapped` is, and it is the only gate into the report. */
      humanReviewed: true,
      basis: REPORT_BASIS,
      confidentialityNote: 'Confidential — prepared for ' + req.company + '.'
    },
    company: {
      name: req.company,
      industry: req.industry || '',
      employees: Number(req.people) || 0,
      currency: req.currency || 'EUR'
    },
    basis: {
      /* The three scope notes live in the brief but not in the flattened
         request, so they are blank and the renderer prints its own honest
         sentence about each. */
      readWhat: req.readWhat || '',
      period: req.period || '',
      exclusions: req.mustKeep || '',
      counts: {
        statements: statements.length,
        matched: statements.length - offCatalog,
        offCatalog: offCatalog
      }
    },
    kpis: kpiFacts(req, offer, statements, hasCosts),
    stack: stackFacts(req, offer, hasCosts),
    coverage: coverageFacts(statements, offer, monthlyByTool),
    money: moneyFacts(offer, hasCosts),
    /* cash, waves and preview: see the note at the top of this file. */
    waves: [],
    glossary: REPORT_GLOSSARY,
    gaps: gapFacts(statements)
  };
}

/* Entry point for the console and the client portal. Both call this and then
   window.renderReport(), so what a consultant reads before sending and what
   the client opens are the same string. */
function reportModelFromRequest(req) {
  var offer = buildOffer(req);
  return { facts: reportFacts(req, offer), prose: reportProse(offer) };
}

/* ─────────────── the stack tool's own shape ───────────────

   stack-tool/mapping.html emits a different object: one row per tool × module
   rather than per capability, with the verdict, target, confidence and hours
   edited directly on the row. It is a richer mapping than the console's — it
   carries what each module is used for — so it gets its own reader rather
   than being squeezed through the console's.

   What it does NOT get is its own renderer. That was the whole problem: two
   documents built by two pieces of code from the same kind of data. Both
   readers end at the same ReportModel and the same window.renderReport(). */

/* A row nobody placed: no capability behind it, or no verdict on it. Both mean
   the same thing to the reader — we did not map this — so both are counted
   off-catalog and both are carried into Appendix B rather than folded into a
   verdict they never got. */
function mappingRowIsUnplaced(row) {
  return !row.caps || !row.caps.length || !row.verdict;
}

function mappingCoverage(data) {
  var byVerdict = { native: 0, configure: 0, build: 0, integrate: 0, keep: 0, drop: 0, offCatalog: 0 };
  var seenTool = {};
  var byCap = {};

  var rows = (data.rows || []).map(function (row) {
    var unplaced = mappingRowIsUnplaced(row);
    if (unplaced) byVerdict.offCatalog += 1;
    else byVerdict[row.verdict] = (byVerdict[row.verdict] || 0) + 1;

    var tool = (data.tools || []).filter(function (t) { return t.id === row.toolId; })[0];
    var first = !seenTool[row.toolId];
    seenTool[row.toolId] = true;

    (row.caps || []).forEach(function (slug) {
      if (!byCap[slug]) byCap[slug] = { tools: [], monthly: 0, known: false };
      if (byCap[slug].tools.indexOf(row.toolName) === -1) {
        byCap[slug].tools.push(row.toolName);
        var monthly = tool ? positiveOrNull(tool.monthly) : null;
        if (monthly) { byCap[slug].monthly += monthly; byCap[slug].known = true; }
      }
    });

    return {
      tool: row.toolName,
      /* The module's own capability labels, not its marketing name: the
         column heading says what the platform has to cover. */
      capability: (row.caps || []).map(labelForCap).join(', ') || row.modName,
      usage: row.usage || '',
      /* The brief asks how we know; the mapping row does not carry it back, so
         'inferred' — the same default the intake applies when nobody ticked. */
      evidenceKind: 'inferred',
      evidenceNote: row.note || '',
      omTarget: row.om || '',
      verdict: unplaced ? 'keep' : row.verdict,
      confidence: row.conf || 'low',
      monthly: first ? (tool ? positiveOrNull(tool.monthly) : null) : 'included'
    };
  });

  /* An unplaced row still needs a verdict cell, and 'keep' is the least
     wrong of the six — but it must not also be counted, or Figure 1 would
     claim we decided something we did not. Hence the split above. */
  var paidTwice = Object.keys(byCap)
    .filter(function (slug) { return byCap[slug].tools.length > 1; })
    .map(function (slug) {
      return {
        capability: labelForCap(slug),
        tools: byCap[slug].tools,
        monthlyAcrossTools: byCap[slug].known ? byCap[slug].monthly : null
      };
    })
    .sort(function (a, b) { return b.tools.length - a.tools.length; });

  return { rows: rows, byVerdict: byVerdict, paidTwice: paidTwice };
}

function reportModelFromMapping(data) {
  var totals = computeTotals(data);
  var company = data.company || {};
  var assumptions = data.assumptions || {};
  var currency = data.currency || 'EUR';
  var tools = data.tools || [];
  var rows = data.rows || [];
  var hasCosts = tools.some(function (t) { return positiveOrNull(t.monthly) !== null; });
  var unplaced = rows.filter(mappingRowIsUnplaced);
  var buildRows = rows.filter(function (r) { return r.verdict === 'build'; });
  var unestimated = buildRows.filter(function (r) { return !positiveOrNull(r.hours); }).length;
  var retained = tools.filter(function (t) { return positiveOrNull(t.after) !== null; });
  var switchedOff = tools.filter(function (t) { return positiveOrNull(t.after) === null; });
  var names = function (list) {
    return list.map(function (t) { return t.name; }).join(', ') || 'none';
  };
  var line = function (label, basis, monthly, isDeduction) {
    return {
      label: label,
      basis: basis,
      /* `monthly` bywa `null` ("nie podano"), a `null * 12` w JS daje 0 - czyli
         brak danych zamieniał się w twierdzenie "zero" w kolumnie rocznej.
         Sprawdzamy null JAWNIE, zamiast liczyć na arytmetykę. */
      monthly: hasCosts ? monthly : null,
      annual: hasCosts && monthly !== null && monthly !== undefined ? monthly * 12 : null,
      isDeduction: !!isDeduction
    };
  };
  var switchedOffMonthly = switchedOff.reduce(function (s, t) { return s + (positiveOrNull(t.monthly) || 0); }, 0);

  var facts = {
    meta: {
      caseId: (company.name || 'Unnamed case').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, ''),
      version: REPORT_VERSION,
      issued: data.created || todayIso(),
      validUntil: '',
      preparedFor: { organization: company.name || 'Unnamed company', person: '', role: '' },
      preparedBy: {
        organization: 'Mercatify',
        person: assumptions.analyst || '',
        role: assumptions.analyst ? 'consultant on record' : ''
      },
      /* The stack tool is the consultant's own workbench: every row on the
         mapping screen was gone through by hand before this page opens. */
      humanReviewed: true,
      basis: REPORT_BASIS,
      confidentialityNote: 'Confidential — prepared for ' + (company.name || 'the client') + '.'
    },
    company: {
      name: company.name || 'Unnamed company',
      industry: company.industry || '',
      employees: Number(company.people) || 0,
      currency: currency
    },
    basis: {
      readWhat: data.readWhat || '',
      period: data.period || '',
      exclusions: data.mustKeep || data.exclusions || '',
      counts: {
        statements: rows.length,
        matched: rows.length - unplaced.length,
        offCatalog: unplaced.length
      }
    },
    kpis: {
      licencesTodayMonthly: hasCosts ? totals.monthlyNow : null,
      licencesTodayAnnual: hasCosts ? totals.monthlyNow * 12 : null,
      toolCount: tools.length,
      seatCount: positiveOrNull(totals.seats),
      licencesAfterMonthly: hasCosts ? totals.monthlyAfter : null,
      licencesAfterNote: retained.length ? names(retained) + ' stay on purpose' : 'Nothing is retained on the current verdicts',
      netRecurringAnnual: hasCosts ? totals.annualSaving : null,
      hostingMonthly: totals.hosting || null,
      implementationCost: totals.rate ? totals.oneOff : null,
      implementationHours: totals.hours,
      implementationHoursAreFloor: unestimated > 0,
      programmeWeeks: Math.round(programmeMonths(assumptions.months) * WEEKS_PER_MONTH),
      breakEvenMonth: null,
      netAtHorizon: null,
      horizonMonths: 0,
      licencesCancelledMonthly: hasCosts ? switchedOffMonthly : null,
      largestBuildHours: buildRows.length
        ? Math.max.apply(null, buildRows.map(function (r) { return Number(r.hours) || 0; })) || null
        : null
    },
    stack: {
      rows: tools.map(function (t) {
        var seats = positiveOrNull(t.seats);
        var monthly = positiveOrNull(t.monthly);
        return {
          tool: t.name,
          plan: t.plan || '',
          category: t.category || t.kind || '',
          seats: seats,
          unitPrice: seats !== null && monthly !== null ? Math.round((monthly / seats) * 100) / 100 : null,
          monthly: monthly,
          annual: monthly === null ? null : monthly * 12,
          termEnds: t.termEnds || '',
          termType: t.termType === 'annual' ? 'annual' : 'monthly'
        };
      }),
      totalSeats: positiveOrNull(totals.seats),
      totalMonthly: hasCosts ? totals.monthlyNow : null,
      totalAnnual: hasCosts ? totals.monthlyNow * 12 : null,
      seatDuplicationNote: totals.seats && company.people && totals.seats > company.people
        ? totals.seats + ' seats across ' + company.people + ' people — the same person is licensed more than once.'
        : ''
    },
    coverage: mappingCoverage(data),
    money: {
      recurring: [
        line('Licences today', tools.length + ' tools as invoiced', totals.monthlyNow, false),
        line('Licences switched off', names(switchedOff), switchedOffMonthly, true),
        line('Licences retained', names(retained), totals.retained, false),
        line('Hosting and support', totals.hosting ? 'Consultant estimate' : 'Not entered', positiveOrNull(totals.hosting), false)
      ],
      implementation: buildRows.map(function (r) {
        var hours = positiveOrNull(r.hours);
        return {
          waveNumber: 0,
          label: r.om || r.modName,
          scope: r.toolName + ' · ' + r.modName,
          hours: hours || 0,
          cost: hours && totals.rate ? hours * totals.rate : null,
          hoursAreFloor: hours === null
        };
      }),
      totalHours: totals.hours,
      rate: totals.rate || null,
      totalImplementationCost: totals.rate ? totals.oneOff : null,
      totalHoursAreFloor: unestimated > 0,
      paybacks: {
        buildOnlyMonths: totals.breakEven,
        buildOnlyCost: totals.rate ? totals.oneOff : null,
        programmeMonths: null
      },
      recurringTotal: hasCosts ? {
        label: 'Net recurring saving',
        basis: 'Steady state, once the last tool is off',
        monthly: totals.monthlySaving,
        annual: totals.annualSaving,
        isDeduction: false
      } : undefined
    },
    waves: [],
    glossary: REPORT_GLOSSARY,
    gaps: unplaced.map(function (r, i) {
      return {
        id: 'B' + (i + 1),
        source: r.toolName + ' · ' + r.modName,
        capability: (r.caps || []).map(labelForCap).join(', ') || r.modName,
        described: r.usage || r.note || r.modName
      };
    })
  };

  return {
    facts: facts,
    prose: composeProse({
      pains: data.pains,
      openQuestions: assumptions.notes
    })
  };
}

/* Renders the document, or — if a slot in the consultant's own text names a
   field that does not exist — an error the consultant can act on. The renderer
   throws on purpose there; swallowing it would ship a report with a hole in a
   sentence about money. */
/* ─────────────── putting the document on a page ─────────────── */

/* Drops a rendered report into `host` and returns the frame, or null if the
   render refused.

   An iframe, because what comes back is a whole document: <html>, its own
   <style> and its own script. Dropping that into the page's DOM would put two
   stylesheets in one document and let the report restyle the console around
   it — and the point of the exercise is that what the consultant reads is the
   file the client gets, byte for byte, not a version of it adapted to fit.

   The frame grows to its content: a scrollbar inside a preview hides the
   bottom of the document, which is where the money is. */
function renderModelInto(host, buildModel, opts) {
  host.innerHTML = '';
  var title = (opts && opts.title) || 'Your consolidation report';
  var frame;
  var html;
  try {
    html = renderReport(buildModel());
  } catch (e) {
    /* The renderer throws on a slot naming a field that does not exist. That
       is deliberate and the message names the field, so it goes on screen —
       swallowing it would ship a report with a hole in a sentence about
       money. Building the model is inside the same try for the same reason:
       a mapping this adapter cannot read is a message, not a blank page. */
    var box = document.createElement('div');
    box.className = 'alert alert--warning';
    var head = document.createElement('strong');
    head.textContent = 'The report could not be built.';
    var why = document.createElement('span');
    why.style.display = 'block';
    why.textContent = String((e && e.message) || e);
    box.appendChild(head);
    box.appendChild(why);
    host.appendChild(box);
    return null;
  }

  frame = document.createElement('iframe');
  frame.className = 'reportframe';
  frame.setAttribute('title', title);
  frame.style.display = 'block';
  frame.style.width = '100%';
  frame.style.border = '0';
  frame.style.height = '600px';
  frame.addEventListener('load', function () {
    fitReportFrame(frame);
    /* Re-fit after the report's own script has laid out both figures, and
       again when the window changes width — the document reflows at the same
       breakpoints the host page does. */
    window.setTimeout(function () { fitReportFrame(frame); }, 60);
  });
  host.appendChild(frame);
  frame.srcdoc = html;

  if (!renderModelInto.watching) {
    renderModelInto.watching = true;
    window.addEventListener('resize', function () {
      Array.prototype.forEach.call(document.querySelectorAll('iframe.reportframe'), fitReportFrame);
    });
  }
  return frame;
}

/* Console and portal: one request in, one document on the page. */
function renderReportInto(host, req, opts) {
  return renderModelInto(host, function () { return reportModelFromRequest(req); }, opts);
}

function fitReportFrame(frame) {
  try {
    var doc = frame.contentDocument;
    if (!doc || !doc.documentElement) return;
    frame.style.height = '0px';
    frame.style.height = doc.documentElement.scrollHeight + 'px';
  } catch (e) { /* cross-origin can't happen with srcdoc, but never break the page over layout */ }
}

/* Print the document, not the page around it. The host page's own Print button
   would print the console shell with the report cropped to one frame. */
function printReportFrame(frame) {
  if (frame && frame.contentWindow) {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    return true;
  }
  window.print();
  return false;
}
