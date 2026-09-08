import React, { useMemo, useState } from 'react'
import { useIsFetching } from '@tanstack/react-query'
import { Filter, Search, X } from 'lucide-react'
import MultiSelectOperatorDropdown from './MultiSelectOperatorDropdown'
import { useMarketplaceFilters } from '../context/MarketplaceFilterContext'
import {
  resolvePeriodRange,
  todayIso,
  addDaysIso,
  type PeriodPreset,
} from '../lib/periodPresets'
import { REDBUS_ROUTE_PAIRS, redbusRouteKey, redbusSrpRouteLabel } from '../lib/redbusRoutes'
import marketplaceRoutesJson from '../data/marketplace-routes.json'
import {
  BUS_TYPE_IDS,
  RATING_BUCKET_IDS,
  busTypeLabel,
  ratingBucketLabel,
  type BusTypeBucket,
  type RatingBucket,
} from '../lib/srpFilters'
import { cx } from '../lib/insights'
import { displayOperatorName } from '../lib/marketplaceConfig'

export const ALL_ROUTES_VALUE = '__all__'

export interface SrpAppliedFilters {
  busTypes: BusTypeBucket[]
  ratingFilters: RatingBucket[]
}

interface Props {
  onApplied?: (filters: SrpAppliedFilters) => void
}

type PeriodChoice = 'yesterday' | 'today' | 'tomorrow' | 'last7days' | 'mtd' | 'custom'

const PERIOD_OPTIONS: { id: PeriodChoice; label: string }[] = [
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'last7days', label: 'Weekly' },
  { id: 'mtd', label: 'Monthly' },
  { id: 'custom', label: 'Custom' },
]

function rangeForPeriod(period: PeriodChoice, start: string, end: string) {
  if (period === 'custom') {
    return { startDate: start, endDate: end }
  }
  const r = resolvePeriodRange(period as PeriodPreset, start, end)
  return { startDate: r.startDate, endDate: r.endDate }
}

export default function SrpScraperTestFilterBar({ onApplied }: Props) {
  const isFetching = useIsFetching({ queryKey: ['redbus-srp'] })
  const isLoading = isFetching > 0
  const {
    setPeriod,
    setCustomStart,
    setCustomEnd,
    setSelectedRouteKeys,
    setSelectedOperators,
    selectedRoutes,
    allRoutesSelected,
    routes,
  } = useMarketplaceFilters()

  const allRouteKeys = useMemo(() => routes.map(r => r.key), [routes])
  const initialRouteKey =
    allRoutesSelected || selectedRoutes.length !== 1
      ? ALL_ROUTES_VALUE
      : selectedRoutes[0]?.key ?? ALL_ROUTES_VALUE
  const initialRange = rangeForPeriod('tomorrow', addDaysIso(todayIso(), 1), addDaysIso(todayIso(), 1))

  const [localRouteKey, setLocalRouteKey] = useState(initialRouteKey)
  const [periodChoice, setPeriodChoice] = useState<PeriodChoice>('tomorrow')
  const [startDate, setStartDate] = useState(initialRange.startDate)
  const [endDate, setEndDate] = useState(initialRange.endDate)
  const [operators, setOperators] = useState<string[]>([])
  const [busTypes, setBusTypes] = useState<BusTypeBucket[]>([])
  const [ratingFilters, setRatingFilters] = useState<RatingBucket[]>([])

  const localAvailableOperators = useMemo(() => {
    const catalog = marketplaceRoutesJson as Record<string, string[]>
    if (localRouteKey === ALL_ROUTES_VALUE) {
      const set = new Set<string>()
      for (const ops of Object.values(catalog)) ops.forEach(o => set.add(o))
      return [...set].sort()
    }
    const ops = catalog[localRouteKey] || []
    return [...ops].sort()
  }, [localRouteKey])

  const routeLabel = useMemo(() => {
    if (localRouteKey === ALL_ROUTES_VALUE) return 'All routes'
    const pair = REDBUS_ROUTE_PAIRS.find(([o, d]) => redbusRouteKey(o, d) === localRouteKey)
    return pair ? redbusSrpRouteLabel(pair[0], pair[1]) : localRouteKey
  }, [localRouteKey])

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = []
    if (operators.length > 0 && operators.length < localAvailableOperators.length) {
      chips.push({
        key: 'ops',
        label:
          operators.length <= 2
            ? operators.map(displayOperatorName).join(', ')
            : `${operators.length} operators`,
        onClear: () => setOperators([]),
      })
    }
    if (busTypes.length > 0) {
      chips.push({
        key: 'bus',
        label: busTypes.map(busTypeLabel).join(', '),
        onClear: () => setBusTypes([]),
      })
    }
    if (ratingFilters.length > 0) {
      chips.push({
        key: 'rating',
        label: ratingFilters.map(ratingBucketLabel).join(', '),
        onClear: () => setRatingFilters([]),
      })
    }
    return chips
  }, [operators, busTypes, ratingFilters, localAvailableOperators.length])

  const applyPeriod = (next: PeriodChoice) => {
    setPeriodChoice(next)
    if (next === 'custom') return
    const r = rangeForPeriod(next, startDate, endDate)
    setStartDate(r.startDate)
    setEndDate(r.endDate)
  }

  const clearRefine = () => {
    setOperators([])
    setBusTypes([])
    setRatingFilters([])
  }

  const handleApply = () => {
    const range = rangeForPeriod(periodChoice, startDate, endDate)
    const start = range.startDate
    const end = range.endDate < range.startDate ? range.startDate : range.endDate
    setPeriod(periodChoice === 'custom' ? 'custom' : (periodChoice as PeriodPreset))
    setCustomStart(start)
    setCustomEnd(end)
    if (localRouteKey === ALL_ROUTES_VALUE) {
      setSelectedRouteKeys(allRouteKeys)
    } else {
      setSelectedRouteKeys([localRouteKey])
    }
    setSelectedOperators(operators)
    onApplied?.({
      busTypes,
      ratingFilters,
    })
  }

  return (
    <section className="srp-filter-shell">
      <div className="srp-filter-shell__glow" aria-hidden />
      <div className="srp-filter-shell__inner">
        <div className="srp-filter-toolbar">
          <div className="srp-filter-toolbar__title">
            <Filter size={15} strokeWidth={2.5} />
            <div>
              <p className="srp-filter-toolbar__heading">Query filters</p>
              <p className="srp-filter-toolbar__sub">{routeLabel}</p>
            </div>
          </div>
          {activeChips.length > 0 ? (
            <button type="button" className="srp-filter-clear" onClick={clearRefine}>
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="srp-filter-sections">
          <div className="srp-filter-section">
            <div className="srp-filter-grid srp-filter-grid--scope">
              <label className="srp-field">
                <span className="srp-field__label">Route</span>
                <div className="srp-field__control srp-field__control--select">
                  <select
                    value={localRouteKey}
                    onChange={e => {
                      setLocalRouteKey(e.target.value)
                      setOperators([])
                    }}
                  >
                    <option value={ALL_ROUTES_VALUE}>All</option>
                    {REDBUS_ROUTE_PAIRS.map(([o, d]) => (
                      <option key={redbusRouteKey(o, d)} value={redbusRouteKey(o, d)}>
                        {redbusSrpRouteLabel(o, d)}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <div className="srp-field">
                <span className="srp-field__label">Operator</span>
                <div className="srp-field__control srp-field__control--dropdown">
                  <div className="srp-field__dropdown-wrap">
                    <MultiSelectOperatorDropdown
                      label=""
                      options={localAvailableOperators}
                      selected={operators}
                      onChange={setOperators}
                      searchPlaceholder="Search operators…"
                      maxTriggerWidth={400}
                      panelWidth={400}
                      compact={false}
                      emptySummary="All"
                      className="srp-operator-dd"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="srp-filter-section">
            <div className="srp-filter-grid srp-filter-grid--refine">
              <div className="srp-field">
                <span className="srp-field__label">Bus type</span>
                <div className="srp-field__control srp-field__control--dropdown">
                  <div className="srp-field__dropdown-wrap">
                    <MultiSelectOperatorDropdown
                      label=""
                      options={BUS_TYPE_IDS}
                      selected={busTypes}
                      onChange={next => setBusTypes(next as BusTypeBucket[])}
                      formatOption={busTypeLabel}
                      maxTriggerWidth={400}
                      panelWidth={280}
                      compact={false}
                      showSearch={false}
                      emptySummary="All"
                      className="srp-bus-type-dd"
                    />
                  </div>
                </div>
              </div>

              <div className="srp-field">
                <span className="srp-field__label">Rating</span>
                <div className="srp-field__control srp-field__control--dropdown">
                  <div className="srp-field__dropdown-wrap">
                    <MultiSelectOperatorDropdown
                      label=""
                      options={RATING_BUCKET_IDS}
                      selected={ratingFilters}
                      onChange={next => setRatingFilters(next as RatingBucket[])}
                      formatOption={ratingBucketLabel}
                      maxTriggerWidth={400}
                      panelWidth={280}
                      compact={false}
                      showSearch={false}
                      emptySummary="All"
                      className="srp-rating-dd"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="srp-period-block">
          <span className="srp-field__label">Travel period</span>
          <div className="srp-period-pills" role="group" aria-label="Period">
            {PERIOD_OPTIONS.map(p => (
              <button
                key={p.id}
                type="button"
                className={cx('srp-period-pill', periodChoice === p.id && 'srp-period-pill--on')}
                onClick={() => applyPeriod(p.id)}
                aria-pressed={periodChoice === p.id}
              >
                {p.label}
              </button>
            ))}
          </div>

          {periodChoice === 'custom' ? (
            <div className="srp-filter-grid srp-filter-grid--dates">
              <label className="srp-field">
                <span className="srp-field__label">Start date</span>
                <div className="srp-field__control">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
              </label>
              <label className="srp-field">
                <span className="srp-field__label">End date</span>
                <div className="srp-field__control">
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </label>
            </div>
          ) : null}
        </div>

        {activeChips.length > 0 ? (
          <div className="srp-active-chips" aria-label="Active filters">
            {activeChips.map(chip => (
              <button key={chip.key} type="button" className="srp-active-chip" onClick={chip.onClear}>
                <span>{chip.label}</span>
                <X size={12} strokeWidth={2.5} />
              </button>
            ))}
          </div>
        ) : null}

        <div className="srp-filter-actions">
          <button type="button" onClick={handleApply} disabled={isLoading} className="srp-btn-primary">
            <Search size={15} strokeWidth={2.5} />
            {isLoading ? 'Loading…' : 'Apply filters'}
          </button>
        </div>
      </div>
    </section>
  )
}
