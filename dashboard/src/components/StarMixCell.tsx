import React from 'react'
import { percentShares } from '../lib/insights'
import { FB_BLUE, FB_YELLOW } from '../lib/playTopics'

const STAR_COLORS = ['#94a3b8', '#dc2626', '#f97316', FB_YELLOW, '#4da3ff', FB_BLUE]

interface Props {
  stars: [number, number, number, number, number] // 1..5
  compact?: boolean
}

/** Compact stacked star-mix bar for table cells (1★–5★ share). */
export default function StarMixCell({ stars, compact }: Props) {
  const total = stars.reduce((a, b) => a + b, 0)
  const pcts = percentShares([...stars])
  const parts = stars.map((count, i) => ({
    star: i + 1,
    count,
    pct: pcts[i],
    color: STAR_COLORS[i + 1],
  }))

  if (!total) {
    return (
      <div className={compact ? 'min-w-[140px]' : 'min-w-[180px]'}>
        <div className="h-2.5 rounded-full bg-black/5 dark:bg-white/10" />
        <p className="mt-1.5 text-[0.62rem] font-semibold text-theme-muted">No rating mix</p>
      </div>
    )
  }

  return (
    <div className={compact ? 'min-w-[140px]' : 'min-w-[180px]'}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
        {parts.map(p => (
          <div
            key={p.star}
            title={`${p.star}★ ${p.count.toLocaleString()} (${p.pct}%)`}
            style={{ width: `${p.pct > 0 ? p.pct : 0}%`, background: p.color }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between gap-1 text-[0.62rem] font-bold text-theme-muted">
        {parts.map(p => (
          <span key={p.star} className="tabular-nums" style={{ color: p.color }}>
            {p.star}★ {p.pct > 0 ? `${p.pct}%` : '·'}
          </span>
        ))}
      </div>
    </div>
  )
}
