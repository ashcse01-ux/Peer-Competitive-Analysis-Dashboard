import React from 'react'
import { Calendar } from 'lucide-react'
import { cx } from '../lib/insights'
import { MARKETPLACE_DATA_START } from '../lib/marketplaceConstants'
import { formatPeriodDisplay, latestAvailableDate, periodPresetLabel, type PeriodPreset } from '../lib/periodPresets'

interface Props {
  period: PeriodPreset
  customStart: string
  customEnd: string
  onPeriodChange: (p: PeriodPreset) => void
  onCustomStartChange: (d: string) => void
  onCustomEndChange: (d: string) => void
  inline?: boolean
}

const PRESETS: PeriodPreset[] = ['today', 'yesterday', 'last7days', 'mtd', 'custom']

export default function PeriodButtonGroup({
  period,
  customStart,
  customEnd,
  onPeriodChange,
  onCustomStartChange,
  onCustomEndChange,
  inline = false,
}: Props) {
  return (
    <div className={cx('period-filter', inline && 'period-filter--inline')}>
      <span className="filter-field-label">Period</span>
      <div className="period-filter-buttons">
        {PRESETS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onPeriodChange(p)}
            className={cx('period-pill', period === p && 'period-pill--active')}
          >
            {periodPresetLabel(p)}
          </button>
        ))}
      </div>
      {period === 'custom' ? (
        <div className="period-custom-row">
          <label className="period-date-field">
            <span className="period-date-label">Start</span>
            <div className="relative">
              <Calendar size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-theme-muted" />
              <input
                type="date"
                value={customStart}
                min={MARKETPLACE_DATA_START}
                max={latestAvailableDate()}
                onChange={e => onCustomStartChange(e.target.value)}
                className="period-date-input"
              />
            </div>
          </label>
          <label className="period-date-field">
            <span className="period-date-label">End</span>
            <div className="relative">
              <Calendar size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-theme-muted" />
              <input
                type="date"
                value={customEnd}
                min={MARKETPLACE_DATA_START}
                max={latestAvailableDate()}
                onChange={e => onCustomEndChange(e.target.value)}
                className="period-date-input"
              />
            </div>
          </label>
          <span className="period-date-hint hidden lg:inline">
            {formatPeriodDisplay(customStart)} – {formatPeriodDisplay(customEnd)}
          </span>
        </div>
      ) : null}
    </div>
  )
}
