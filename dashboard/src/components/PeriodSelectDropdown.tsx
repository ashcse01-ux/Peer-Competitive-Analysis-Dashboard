import React, { useEffect, useRef, useState } from 'react'
import { Calendar, Check, ChevronDown } from 'lucide-react'
import { cx } from '../lib/insights'
import { formatPeriodDisplay, periodPresetLabel, type PeriodPreset } from '../lib/periodPresets'

interface Props {
  period: PeriodPreset
  customStart: string
  customEnd: string
  onPeriodChange: (p: PeriodPreset) => void
  onCustomStartChange: (d: string) => void
  onCustomEndChange: (d: string) => void
  className?: string
}

const PRESETS: PeriodPreset[] = ['today', 'yesterday', 'weekly', 'monthly', 'custom']

export default function PeriodSelectDropdown({
  period,
  customStart,
  customEnd,
  onPeriodChange,
  onCustomStartChange,
  onCustomEndChange,
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const summary =
    period === 'custom'
      ? `${formatPeriodDisplay(customStart)} – ${formatPeriodDisplay(customEnd)}`
      : periodPresetLabel(period)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={rootRef} className={cx('filter-field', className)} style={{ '--filter-trigger-max': '10rem', '--filter-panel-w': '12rem' } as React.CSSProperties}>
      <span className="filter-field-label">Period</span>
      <button type="button" onClick={() => setOpen(v => !v)} className="filter-chip-trigger">
        <span className="filter-chip-value">{summary}</span>
        <ChevronDown size={14} className={cx('filter-chip-chevron', open && 'filter-chip-chevron--open')} />
      </button>

      {open ? (
        <div className="filter-chip-panel">
          <ul className="filter-chip-list" role="listbox">
            {PRESETS.map(p => (
              <li key={p}>
                <button
                  type="button"
                  role="option"
                  aria-selected={period === p}
                  onClick={() => {
                    onPeriodChange(p)
                    if (p !== 'custom') setOpen(false)
                  }}
                  className={cx('filter-chip-option', period === p && 'filter-chip-option--checked')}
                >
                  <span className={cx('filter-chip-check', period === p && 'filter-chip-check--on')}>
                    {period === p ? <Check size={9} strokeWidth={3} /> : null}
                  </span>
                  {periodPresetLabel(p)}
                </button>
              </li>
            ))}
          </ul>
          {period === 'custom' ? (
            <div className="border-t border-[var(--border-subtle)] p-2 space-y-2">
              <label className="period-date-field">
                <span className="period-date-label">Start</span>
                <div className="relative">
                  <Calendar size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-theme-muted" />
                  <input type="date" value={customStart} onChange={e => onCustomStartChange(e.target.value)} className="period-date-input" />
                </div>
              </label>
              <label className="period-date-field">
                <span className="period-date-label">End</span>
                <div className="relative">
                  <Calendar size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-theme-muted" />
                  <input type="date" value={customEnd} onChange={e => onCustomEndChange(e.target.value)} className="period-date-input" />
                </div>
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
