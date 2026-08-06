import React, { useState } from 'react'
import { Calendar } from 'lucide-react'
import { cx } from '../lib/insights'
import { FB_YELLOW } from '../lib/playTopics'

export type DatePreset = 'today' | 'yesterday' | 'weekly' | 'monthly' | 'custom'

export interface DateFilterValue {
  preset: DatePreset
  from: string
  to: string
}

function isoLocal(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayIso() {
  return isoLocal(new Date())
}

/** Until daily scrapes accumulate, every preset resolves to today. */
export function resolvePreset(preset: DatePreset, _anchor = new Date()): { from: string; to: string } {
  const t = todayIso()
  // Future: when history exists, expand weekly/monthly from scraped days.
  void preset
  return { from: t, to: t }
}

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
]

interface Props {
  value: DateFilterValue
  onChange: (next: DateFilterValue) => void
  /** ISO dates that already have a scrape — past before earliest stay disabled */
  availableDates?: string[]
  className?: string
}

export default function DateRangeBar({ value, onChange, availableDates = [], className }: Props) {
  const today = todayIso()
  const minAllowed = availableDates.length
    ? [...availableDates].sort()[0]
    : today
  // Past days with no scrape stay locked; never before first scrape / today
  const minDate = minAllowed > today ? today : minAllowed
  const maxDate = today

  const [draftFrom, setDraftFrom] = useState(value.from || today)
  const [draftTo, setDraftTo] = useState(value.to || today)

  const applyPreset = (preset: DatePreset) => {
    const range = resolvePreset(preset)
    setDraftFrom(range.from)
    setDraftTo(range.to)
    onChange({ preset, ...range })
  }

  const clamp = (d: string) => {
    if (d < minDate) return minDate
    if (d > maxDate) return maxDate
    return d
  }

  const applyCustom = () => {
    let from = clamp(draftFrom)
    let to = clamp(draftTo)
    if (from > to) [from, to] = [to, from]
    // Until multi-day scrapes exist, force today
    if (availableDates.length <= 1) {
      from = today
      to = today
    }
    setDraftFrom(from)
    setDraftTo(to)
    onChange({ preset: 'custom', from, to })
  }

  const historyLocked = availableDates.length <= 1

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="liquid-chip inline-flex h-10 items-center gap-2 px-3 text-sm font-semibold text-theme-secondary">
          <Calendar size={14} className="text-[var(--fb-blue)]" />
          <input
            type="date"
            value={draftFrom}
            min={minDate}
            max={maxDate}
            onChange={e => setDraftFrom(clamp(e.target.value))}
            className="bg-transparent text-sm font-semibold text-theme-primary outline-none disabled:opacity-40"
            aria-label="Start date"
          />
          <span className="text-theme-muted">→</span>
          <input
            type="date"
            value={draftTo}
            min={minDate}
            max={maxDate}
            onChange={e => setDraftTo(clamp(e.target.value))}
            className="bg-transparent text-sm font-semibold text-theme-primary outline-none disabled:opacity-40"
            aria-label="End date"
          />
        </div>

        <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-white/60 bg-white/40 p-1 backdrop-blur-md dark:border-white/10 dark:bg-white/5">
          {PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={cx(
                'rounded-full px-3 py-1.5 text-xs font-bold transition',
                value.preset === p.id
                  ? 'bg-white text-[var(--fb-blue)] shadow-sm'
                  : 'text-theme-secondary hover:bg-white/50 hover:text-theme-primary',
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={applyCustom}
            className="ml-1 rounded-full px-4 py-1.5 text-xs font-extrabold text-[#0c4dc3] shadow-sm"
            style={{ background: `linear-gradient(135deg, ${FB_YELLOW}, #ffc800)` }}
          >
            Go
          </button>
        </div>
      </div>
      {historyLocked && (
        <p className="text-xs font-semibold text-theme-muted">
          Showing today’s scrape only — past dates are locked until daily sync builds history.
        </p>
      )}
    </div>
  )
}
