"use client"
import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { cn } from '@open-mercato/shared/lib/utils'
import { useT } from '@open-mercato/shared/lib/i18n/context'

/**
 * DESIGN-ONLY marker that a screen's mapping/report came out of the
 * Mercatify Lab analysis engine. Purely visual: it does not fetch, gate, or
 * know anything about the run itself — that wiring is a separate, later
 * change (see `LabAnalysisCard` for the actual trigger). Placed next to the
 * existing case/report/status badges wherever a screen already shows "whose
 * work is this", so the Lab's presence in the flow reads consistently across
 * the case detail, mapping and report screens without a new layout.
 */
export function LabBadge({ className }: { className?: string }) {
  const t = useT()
  return (
    <Badge variant="brand" className={cn('gap-1', className)}>
      <Sparkles aria-hidden="true" className="size-3" />
      {t('mercatify.lab.badge', 'Mercatify Lab')}
    </Badge>
  )
}

export default LabBadge
