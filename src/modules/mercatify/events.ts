import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * Mercatify module events.
 *
 * Declared before anything emits them so the IDs are stable and typed from the
 * first commit — these are frozen compatibility surfaces.
 */
const events = [
  { id: 'mercatify.case.created', label: 'Interview Case Created', entity: 'case', category: 'crud' },
  { id: 'mercatify.case.updated', label: 'Interview Case Updated', entity: 'case', category: 'crud' },
  { id: 'mercatify.case.deleted', label: 'Interview Case Deleted', entity: 'case', category: 'crud' },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'mercatify',
  events,
})

/** Type-safe event emitter for the mercatify module. */
export const emitMercatifyEvent = eventsConfig.emit

/** Event IDs that can be emitted by the mercatify module. */
export type MercatifyEventId = typeof events[number]['id']

export default eventsConfig
