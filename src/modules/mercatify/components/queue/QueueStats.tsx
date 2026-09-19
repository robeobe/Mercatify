"use client"

import * as React from 'react'

/**
 * The five figures above the queue. Declared spend, not a saving — the saving
 * only exists once a mapping says what actually moves, which is why the money
 * card reads "as declared".
 */
export type QueueStatCard = {
  key: string
  label: string
  value: string
  sub: string
}

export function QueueStats({ cards }: { cards: QueueStatCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.key} className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{card.label}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{card.value}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{card.sub}</div>
        </div>
      ))}
    </div>
  )
}
