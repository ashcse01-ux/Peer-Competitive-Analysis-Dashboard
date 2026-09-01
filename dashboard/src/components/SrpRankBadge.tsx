import React from 'react'
import { cx, formatMetric } from '../lib/insights'
import { formatRankCell } from '../lib/srpAnalytics'

export type SrpRankTier = 'elite' | 'strong' | 'mid' | 'weak'

export function srpRankTier(value: number): SrpRankTier {
  if (value <= 10) return 'elite'
  if (value <= 30) return 'strong'
  if (value <= 100) return 'mid'
  return 'weak'
}

interface Props {
  value: number | null
  compact?: boolean
  className?: string
}

export default function SrpRankBadge({ value, compact, className }: Props) {
  if (value == null) {
    return (
      <span
        className={cx('srp-rank-badge srp-rank-badge--empty', compact && 'srp-rank-badge--compact', className)}
        title="No SRP observation"
      >
        —
      </span>
    )
  }

  const tier = srpRankTier(value)
  return (
    <span
      className={cx(
        'srp-rank-badge',
        `srp-rank-badge--${tier}`,
        compact && 'srp-rank-badge--compact',
        className,
      )}
      title={`SRP rank #${formatMetric(value, 0)}`}
    >
      {formatRankCell(value)}
    </span>
  )
}
