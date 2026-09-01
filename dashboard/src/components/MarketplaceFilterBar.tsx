import React, { useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { RotateCcw } from 'lucide-react'
import MultiSelectOperatorDropdown from './MultiSelectOperatorDropdown'
import PeriodButtonGroup from './PeriodButtonGroup'
import { COMPARE_LABELS, useMarketplaceFilters } from '../context/MarketplaceFilterContext'
import { SNAPSHOT_SLOT_LABELS, type ComparePreset, type SnapshotSlotFilter } from '../lib/marketplaceConstants'
import { cx } from '../lib/insights'

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <label className="filter-chip-field">
      <span className="filter-field-label">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value as T)}
          className="filter-chip-trigger filter-chip-trigger--select pr-7"
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-theme-muted" />
      </div>
    </label>
  )
}

export default function MarketplaceFilterBar() {
  const {
    routes,
    selectedRouteKeys,
    setSelectedRouteKeys,
    availableOperators,
    selectedOperators,
    setSelectedOperators,
    period,
    setPeriod,
    customStart,
    customEnd,
    setCustomStart,
    setCustomEnd,
    periodRange,
    compare,
    setCompare,
    snapshot,
    setSnapshot,
    clearAll,
  } = useMarketplaceFilters()

  const routeOptions = routes.map(r => r.key)
  const routeLabel = (key: string) => routes.find(r => r.key === key)?.label ?? key

  const snapshotOptions = useMemo(
    () => [
      { value: 'all' as SnapshotSlotFilter, label: 'All' },
      ...SNAPSHOT_SLOT_LABELS.map(s => ({ value: s as SnapshotSlotFilter, label: s })),
    ],
    [],
  )

  const compareOptions = useMemo(
    () =>
      (Object.keys(COMPARE_LABELS) as ComparePreset[]).map(k => ({
        value: k,
        label: COMPARE_LABELS[k],
      })),
    [],
  )

  return (
    <section className="filter-bar-compact">
      <div className="filter-bar-row">
        <MultiSelectOperatorDropdown
          label="Route"
          options={routeOptions}
          selected={selectedRouteKeys}
          onChange={setSelectedRouteKeys}
          formatOption={routeLabel}
          searchPlaceholder="Search routes…"
          maxTriggerWidth={148}
          panelWidth={240}
        />
        <MultiSelectOperatorDropdown
          label="Operator"
          options={availableOperators}
          selected={selectedOperators}
          onChange={setSelectedOperators}
          searchPlaceholder="Search operators…"
          maxTriggerWidth={132}
          panelWidth={220}
        />
        <span className="filter-bar-divider hidden lg:block" aria-hidden />
        <PeriodButtonGroup
          inline
          period={period}
          customStart={customStart}
          customEnd={customEnd}
          onPeriodChange={setPeriod}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
        />
        <FilterSelect label="Compare" value={compare} options={compareOptions} onChange={setCompare} />
        <FilterSelect label="Snapshot" value={snapshot} options={snapshotOptions} onChange={setSnapshot} />
        <button type="button" onClick={clearAll} className={cx('filter-bar-clear', 'ml-auto')}>
          <RotateCcw size={14} />
          <span className="hidden sm:inline">Clear filters</span>
        </button>
      </div>

      {periodRange.emptyReason ? (
        <p className="filter-bar-meta filter-bar-meta--warn">{periodRange.emptyReason}</p>
      ) : periodRange.partialData ? (
        <p className="filter-bar-meta filter-bar-meta--warn">Partial data available for the selected period.</p>
      ) : (
        <p className="filter-bar-meta">
          {periodRange.label}
          {period === 'today' && periodRange.completedSlotsToday.length < 4
            ? ` · Snapshots: ${periodRange.completedSlotsToday.join(', ') || 'none yet'}`
            : null}
          {snapshot !== 'all' ? ` · ${snapshot} IST only` : null}
        </p>
      )}
    </section>
  )
}
