export * from './types'
export * from './catalog'
export {
  CAPABILITY_ALIASES,
  UNMAPPED_LEGACY_KEYS,
  aliasesFor,
  resolveCapabilityAlias,
} from './catalogAliases'
export * from './contract'
export { mapCapabilities } from './mapCapabilities'
export { computeScenario } from './computeScenario'
export { Orchestrator, type OrchestratorOptions } from './orchestrator'
export { OpenAiCompatibleLlmClient, type LlmClient, type ToolExecutor } from './llmClient'
export { localToolExecutor, createToolExecutor, type ToolExecutorOptions } from './toolExecutor'
export { loadAgents, loadTools, getAgent, getTool, getAgentTools, type AgentDefinition, type ToolDefinition } from './agentLoader'
export { proposeCatalogEntry, type CatalogCuratorInput, type CatalogCuratorResult } from './catalogCurator'
export { firecrawlSearch, type WebSearchResult, type WebSearchOptions } from './webSearch'

/*
 * WARSTWA RAPORTU (SPEC.md §12) - brief klienta w jednoplikowy dokument HTML.
 *
 * Do tej chwili nic z `src/report/**`, `src/intake/**` ani `src/reportProse.ts`
 * nie było stąd eksportowane i to była decyzja, nie zaniedbanie (SPEC.md
 * §11.4): eksport jest zmianą kontraktu publicznego, a ścieżka od briefu do
 * dokumentu miała trzy niezależnie budowane warstwy. Robimy to RAZ, teraz, gdy
 * `buildReport` faktycznie spina je w jedno wywołanie - zamiast symbol po
 * symbolu, co zamroziłoby kształty, które jeszcze się przesuwały.
 *
 * Kolejność jest kolejnością przebiegu: brief -> fakty -> proza -> dokument.
 */
export {
  briefToRequest,
  normalizeBrief,
  BRIEF_KIND,
  DEFAULT_EVIDENCE_KIND,
  SUPPORTED_BRIEF_VERSIONS,
  type BriefEvidenceKind,
  type NormalizedBrief,
  type NormalizedBriefModule,
  type NormalizedBriefTool,
} from './intake/fromBrief'
export * from './report/model'
export {
  buildReport,
  type BuildReportOptions,
  type BuildReportPreviewOptions,
  type BuiltReport,
  type ConsultantInputs,
  type ConsultantToolTerm,
} from './report/buildReport'
export {
  groupIntoWaves,
  canonicalToolLabel,
  familyForTarget,
  DEFAULT_WEEKLY_HOURS,
  TARGET_FAMILIES,
  type TargetFamily,
  type WaveInput,
  type WaveStackRow,
} from './report/waves'
export {
  computeCashSeries,
  planWaveSpendWindows,
  DEFAULT_HORIZON_MONTHS,
  type CashInput,
  type WaveSpendWindow,
} from './report/cash'
export {
  deriveStatementCounts,
  resolveStatementCounts,
  type ProvidedStatementCounts,
} from './report/counts'
export { assertNoFigures } from './report/assertNoFigures'
export { resolveProseSlots, resolveSlots, slotsIn } from './report/slots'
export { REPORT_GLOSSARY } from './report/glossary'
export { count, isoToLongDate, money, NOT_GIVEN } from './report/format'
export { renderReport } from './report/renderReport'
export { writeReport, type WrittenReport } from './report/writeReport'
export {
  validateEditorResult,
  validateGapReaderResult,
  validateRiskAnalystResult,
  writeExecutiveProse,
  writeGapProse,
  writeRiskProse,
  type ReportEditorInput,
  type ReportEditorResult,
  type ReportEvidenceNote,
  type ReportGapReaderInput,
  type ReportGapReaderResult,
  type ReportRiskAnalystInput,
  type ReportRiskAnalystResult,
  type SlotScope,
} from './reportProse'
