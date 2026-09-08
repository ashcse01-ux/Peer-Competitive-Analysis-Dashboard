import React from 'react'
import { cx } from '../lib/insights'

export type OperatorViewLimit = 10 | 25 | 'all'
export type ServiceViewLimit = 10 | 25 | 50 | 'all'

export const OPERATOR_VIEW_OPTIONS: { id: OperatorViewLimit; label: string }[] = [
  { id: 10, label: 'Top 10' },
  { id: 25, label: 'Top 25' },
  { id: 'all', label: 'View All' },
]

export const SERVICE_VIEW_OPTIONS: { id: ServiceViewLimit; label: string }[] = [
  { id: 10, label: 'Top 10' },
  { id: 25, label: 'Top 25' },
  { id: 50, label: 'Top 50' },
  { id: 'all', label: 'View All' },
]

/** Default collapsed view size (also used in copy). */
export const TOP_OPERATORS = 10

export function resolveOperatorLimit(limit: OperatorViewLimit | ServiceViewLimit, total: number): number {
  if (limit === 'all') return total
  return Math.min(limit, total)
}

interface Props {
  value: OperatorViewLimit
  total: number
  onChange: (next: OperatorViewLimit) => void
  className?: string
}

export default function OperatorViewToggle({ value, total, onChange, className }: Props) {
  if (total <= 10) return null

  return (
    <div className={cx('srp-ops-scope', className)} role="group" aria-label="Operator list size">
      {OPERATOR_VIEW_OPTIONS.map(opt => {
        if (opt.id === 25 && total <= 10) return null
        const active = value === opt.id
        return (
          <button
            key={String(opt.id)}
            type="button"
            className={cx('srp-ops-scope__btn', active && 'srp-ops-scope__btn--on')}
            aria-pressed={active}
            onClick={() => onChange(opt.id)}
            title={opt.id === 'all' ? `Show all ${total} operators` : `Show top ${opt.id} operators`}
          >
            <span>{opt.label}</span>
            {opt.id === 'all' ? <span className="srp-ops-scope__count">{total}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

interface ServiceProps {
  value: ServiceViewLimit
  total: number
  onChange: (next: ServiceViewLimit) => void
  className?: string
}

export function ServiceViewToggle({ value, total, onChange, className }: ServiceProps) {
  if (total <= 10) return null

  return (
    <div className={cx('srp-ops-scope', className)} role="group" aria-label="Service list size">
      {SERVICE_VIEW_OPTIONS.map(opt => {
        if (opt.id === 25 && total <= 10) return null
        if (opt.id === 50 && total <= 25) return null
        const active = value === opt.id
        return (
          <button
            key={String(opt.id)}
            type="button"
            className={cx('srp-ops-scope__btn', active && 'srp-ops-scope__btn--on')}
            aria-pressed={active}
            onClick={() => onChange(opt.id)}
            title={opt.id === 'all' ? `Show all ${total} services` : `Show top ${opt.id} services by SRP`}
          >
            <span>{opt.label}</span>
            {opt.id === 'all' ? <span className="srp-ops-scope__count">{total}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
