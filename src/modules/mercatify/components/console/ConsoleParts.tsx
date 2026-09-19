"use client"
import * as React from 'react'
import { Tag } from '@open-mercato/ui/primitives/tag'
import { formatCurrency } from '@open-mercato/ui/utils/format'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  STAFF_STATUS_LABELS,
  STAFF_STATUS_TAGS,
  caseRef,
  sumMonthlyCost,
  toStaffStatus,
  type ConsoleCaseDto,
} from './case'

/**
 * The chrome the three admin console screens share, ported from
 * `assets/console/*.html` (`.pagehead`, `.card__head`, `.stat`, `.actionbar`)
 * onto Tailwind utilities and `@open-mercato/ui` primitives. No new CSS file:
 * every value below is a utility or a design token the host already ships.
 */

export function ConsolePageHead({
  title,
  lead,
  actions,
}: {
  title: string
  lead?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-tight sm:text-2xl">{title}</h1>
        {lead ? <p className="mt-1 max-w-[76ch] text-sm text-muted-foreground">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** `REQ-XXXX` in the mockup's outline mono badge. */
export function CaseRefBadge({ caseId }: { caseId: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-mono text-xs">
      {caseRef(caseId)}
    </span>
  )
}

export function StaffStatusBadge({ status }: { status: string | null | undefined }) {
  const resolved = toStaffStatus(status)
  const t = useT()
  return (
    <Tag variant={STAFF_STATUS_TAGS[resolved]} dot>
      {t(`mercatify.console.status.${resolved}`, STAFF_STATUS_LABELS[resolved])}
    </Tag>
  )
}

/**
 * The context card at the top of the mapping screen: who this is, where it is,
 * and the two things they told us in their own words.
 */
export function CaseContextCard({ mercatifyCase }: { mercatifyCase: ConsoleCaseDto }) {
  const t = useT()
  const monthly = formatCurrency(sumMonthlyCost(mercatifyCase.tools), mercatifyCase.currency)
  const meta = [
    mercatifyCase.industry,
    mercatifyCase.peopleCount != null
      ? t('mercatify.console.meta.people', '{count} people', { count: mercatifyCase.peopleCount })
      : null,
    monthly ? t('mercatify.console.meta.licences', '{amount}/mo on licences', { amount: monthly }) : null,
  ].filter((entry): entry is string => Boolean(entry))

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-baseline gap-2.5">
        <h2 className="text-base font-semibold">
          {mercatifyCase.companyName ?? mercatifyCase.title}
        </h2>
        <CaseRefBadge caseId={mercatifyCase.id} />
        <StaffStatusBadge status={mercatifyCase.status} />
        {meta.length > 0 ? (
          <p className="ml-auto text-sm text-muted-foreground">{meta.join(' · ')}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs text-muted-foreground">
            {t('mercatify.console.context.pains', 'What hurts today')}
          </div>
          <p className="text-xs">
            {mercatifyCase.pains?.trim() || t('mercatify.console.context.notStated', 'Not stated.')}
          </p>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">
            {t('mercatify.console.context.mustKeep', 'Must not be touched')}
          </div>
          <p className="text-xs">
            {mercatifyCase.mustKeep?.trim() || t('mercatify.console.context.notStated', 'Not stated.')}
          </p>
        </div>
      </div>
    </div>
  )
}

/** `.stat` from `om.css`: tracked uppercase key, 24px value, muted sub-line. */
export function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-xs uppercase tracking-[0.05em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
}

/** `.actionbar`: sticks to the bottom of the viewport, text on the left. */
export function StickyActionBar({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-[5] mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur">
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">{text}</p>
      {children}
    </div>
  )
}
