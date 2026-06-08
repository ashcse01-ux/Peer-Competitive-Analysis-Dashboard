import React from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { cx, deltaTone, formatDelta } from '../lib/insights'
import MetricTip from './MetricTip'

interface Props {
  label: string
  value: number | string | null | undefined
  delta?: number | null
  unit?: string
  caption?: string
  tip?: string
  captionTip?: string
  icon?: React.ReactNode
  accent?: string
  isStale?: boolean
  className?: string
}

export default function KPICard({
  label,
  value,
  delta,
  unit = '',
  caption,
  tip,
  captionTip,
  icon,
  accent = '#0077b6',
  isStale,
  className,
}: Props) {
  const displayValue = value != null && value !== '' ? `${value}${unit}` : 'No data'
  const tone = deltaTone(delta)
  const DeltaIcon = tone === 'positive' ? ArrowUpRight : tone === 'negative' ? ArrowDownRight : ArrowRight

  return (
    <article className={cx('metric-card p-4 sm:p-5', className)} style={{ ['--accent' as string]: accent }}>
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, ${accent}, rgba(255,255,255,0))` }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <MetricTip tip={tip ?? ''} as="p" className="eyebrow truncate">{label}</MetricTip>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-theme-primary sm:text-2xl">
            {displayValue}
          </p>
        </div>
        {icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-theme-primary shadow-sm ring-1 ring-[var(--border-subtle)]">
            {icon}
          </span>
        )}
      </div>

      <div className="relative mt-4 flex min-h-6 items-center justify-between gap-3">
        {delta != null ? (
          <span
            className={cx(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black',
              tone === 'positive' && 'bg-emerald-50 text-emerald-700',
              tone === 'negative' && 'bg-rose-50 text-rose-700',
              tone === 'neutral' && 'bg-slate-100 text-slate-600',
            )}
          >
            <DeltaIcon size={14} />
            {formatDelta(delta)}
          </span>
        ) : (
          <MetricTip tip={captionTip ?? ''} className="text-xs font-semibold text-slate-400">
            {caption ?? 'Snapshot'}
          </MetricTip>
        )}

        {isStale ? (
          <span className="rounded-full bg-amber-50 px-2 py-1 text-[0.68rem] font-black uppercase tracking-wide text-amber-700">
            stale
          </span>
        ) : caption && delta != null ? (
          <span className="truncate text-right text-xs font-semibold text-slate-500">{caption}</span>
        ) : null}
      </div>
    </article>
  )
}
