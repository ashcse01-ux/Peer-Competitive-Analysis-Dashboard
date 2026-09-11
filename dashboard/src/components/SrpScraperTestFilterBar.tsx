import React, { useEffect, useMemo, useState } from 'react'
import { useIsFetching } from '@tanstack/react-query'
import { ArrowRight, X } from 'lucide-react'
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
  operatorOptions?: string[]
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

export default function SrpScraperTestFilterBar({ onApplied, operatorOptions }: Props) {
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

  const catalogOperators = useMemo(() => {
    const catalog = marketplaceRoutesJson as Record<string, string[]>
    if (localRouteKey === ALL_ROUTES_VALUE) {
      const set = new Set<string>()
      for (const ops of Object.values(catalog)) ops.forEach(o => set.add(o))
      return [...set].sort((a, b) => a.localeCompare(b))
    }
    const ops = catalog[localRouteKey] || []
    return [...ops].sort((a, b) => a.localeCompare(b))
  }, [localRouteKey])

  const localAvailableOperators = useMemo(() => {
    if (operatorOptions && operatorOptions.length > 0) {
      return [...operatorOptions].sort((a, b) => a.localeCompare(b))
    }
    return catalogOperators
  }, [operatorOptions, catalogOperators])

  useEffect(() => {
    if (!localAvailableOperators.length) return
    setOperators(prev => {
      if (!prev.length) return prev
      const next = prev.filter(o => localAvailableOperators.includes(o))
      return next.length === prev.length ? prev : next
    })
  }, [localAvailableOperators])

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
    onApplied?.({ busTypes, ratingFilters })
  }

  return (
    <section className="rb-stage rb-stage--filters" aria-label="Query filters">
      <div className="rb-stage-filters__intro">
        <h2 className="rb-stage-filters__title">Query filters</h2>
        {activeChips.length > 0 ? (
          <button type="button" className="rb-stage-filters__reset" onClick={clearRefine}>
            Clear
          </button>
        ) : null}
      </div>

      <div className="rb-stage-scope">
        <label className="rb-stage-field">
          <span className="rb-stage-field__label">Route</span>
          <div className="rb-stage-field__control rb-stage-field__control--select">
            <select
              value={localRouteKey}
              onChange={e => {
                setLocalRouteKey(e.target.value)
                setOperators([])
              }}
            >
              <option value={ALL_ROUTES_VALUE}>All routes</option>
              {REDBUS_ROUTE_PAIRS.map(([o, d]) => (
                <option key={redbusRouteKey(o, d)} value={redbusRouteKey(o, d)}>
                  {redbusSrpRouteLabel(o, d)}
                </option>
              ))}
            </select>
          </div>
        </label>

        <div className="rb-stage-field">
          <span className="rb-stage-field__label">Operator</span>
          <div className="rb-stage-field__control rb-stage-field__control--dropdown">
            <div className="rb-stage-field__dropdown">
              <MultiSelectOperatorDropdown
                label=""
                options={localAvailableOperators}
                selected={operators}
                onChange={setOperators}
                searchPlaceholder="Search operators…"
                maxTriggerWidth={420}
                panelWidth={420}
                compact={false}
                emptySummary="All operators"
                className="srp-operator-dd"
              />
            </div>
          </div>
        </div>

        <div className="rb-stage-field">
          <span className="rb-stage-field__label">Bus type</span>
          <div className="rb-stage-field__control rb-stage-field__control--dropdown">
            <div className="rb-stage-field__dropdown">
              <MultiSelectOperatorDropdown
                label=""
                options={BUS_TYPE_IDS}
                selected={busTypes}
                onChange={next => setBusTypes(next as BusTypeBucket[])}
                formatOption={busTypeLabel}
                maxTriggerWidth={280}
                panelWidth={280}
                compact={false}
                showSearch={false}
                emptySummary="All types"
                className="srp-bus-type-dd"
              />
            </div>
          </div>
        </div>

        <div className="rb-stage-field">
          <span className="rb-stage-field__label">Rating</span>
          <div className="rb-stage-field__control rb-stage-field__control--dropdown">
            <div className="rb-stage-field__dropdown">
              <MultiSelectOperatorDropdown
                label=""
                options={RATING_BUCKET_IDS}
                selected={ratingFilters}
                onChange={next => setRatingFilters(next as RatingBucket[])}
                formatOption={ratingBucketLabel}
                maxTriggerWidth={280}
                panelWidth={280}
                compact={false}
                showSearch={false}
                emptySummary="All ratings"
                className="srp-rating-dd"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rb-stage-period-row">
        <div className="rb-stage-period-block">
          <span className="rb-stage-field__label">Travel period</span>
          <div className="rb-stage-period" role="group" aria-label="Travel period">
            {PERIOD_OPTIONS.map(p => (
              <button
                key={p.id}
                type="button"
                className={cx('rb-stage-period__pill', periodChoice === p.id && 'rb-stage-period__pill--on')}
                onClick={() => applyPeriod(p.id)}
                aria-pressed={periodChoice === p.id}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button type="button" onClick={handleApply} disabled={isLoading} className="rb-stage-apply">
          <span>{isLoading ? 'Loading…' : 'Apply filters'}</span>
          <ArrowRight size={16} strokeWidth={2.5} />
        </button>
      </div>

      {periodChoice === 'custom' ? (
        <div className="rb-stage-custom">
          <label className="rb-stage-field">
            <span className="rb-stage-field__label">Start date</span>
            <div className="rb-stage-field__control">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
          </label>
          <label className="rb-stage-field">
            <span className="rb-stage-field__label">End date</span>
            <div className="rb-stage-field__control">
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </label>
        </div>
      ) : null}

      {activeChips.length > 0 ? (
        <div className="rb-stage-chips" aria-label="Active filters">
          {activeChips.map(chip => (
            <button key={chip.key} type="button" className="rb-stage-chip" onClick={chip.onClear}>
              <span>{chip.label}</span>
              <X size={12} strokeWidth={2.5} />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
