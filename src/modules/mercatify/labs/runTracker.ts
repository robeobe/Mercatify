import type { LabsTraceStep } from './tracing'

type TrackedRunStatus = 'running' | 'done' | 'error'

type TrackedRun = {
  mode: 'deterministic' | 'ai'
  status: TrackedRunStatus
  steps: Map<number, LabsTraceStep>
  cleanupTimer: ReturnType<typeof setTimeout>
}

/**
 * In-process, single-instance run registry so the console can poll live
 * progress of a Mercatify Labs run while its POST request is still in
 * flight. Deliberately in-memory, not persisted: this app runs as one
 * standalone Node process (see `scripts/dev-runtime.mjs` / `mercato server
 * dev`), never serverless-per-request, so a module-level Map is visible to
 * every request handler in the same process. If this ever needs to survive
 * a multi-instance deployment, swap this for the existing SQLite/Redis
 * cache — the final, persisted trace (`labsResult.trace`) already does not
 * depend on this at all; it is built independently and is what a page
 * reload or a different instance would show.
 */
const runs = new Map<string, TrackedRun>()

const RUN_TTL_MS = 10 * 60 * 1000

export function startTrackedRun(runId: string, mode: 'deterministic' | 'ai'): void {
  const existing = runs.get(runId)
  if (existing) clearTimeout(existing.cleanupTimer)
  const cleanupTimer = setTimeout(() => runs.delete(runId), RUN_TTL_MS)
  cleanupTimer.unref?.()
  runs.set(runId, { mode, status: 'running', steps: new Map(), cleanupTimer })
}

export function recordTrackedStep(runId: string, step: LabsTraceStep): void {
  const run = runs.get(runId)
  if (!run) return
  run.steps.set(step.seq, step)
}

export function finishTrackedRun(runId: string, status: 'done' | 'error'): void {
  const run = runs.get(runId)
  if (run) run.status = status
}

export function getTrackedRun(runId: string): { mode: 'deterministic' | 'ai'; status: TrackedRunStatus; steps: LabsTraceStep[] } | null {
  const run = runs.get(runId)
  if (!run) return null
  return {
    mode: run.mode,
    status: run.status,
    steps: [...run.steps.values()].sort((a, b) => a.seq - b.seq),
  }
}
