import React, { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Star } from 'lucide-react'
import SrpScraperTestFilterBar, { type SrpAppliedFilters } from '../components/SrpScraperTestFilterBar'
import SrpAnalyticsPanel from '../components/SrpAnalyticsPanel'
import SrpOperatorAnalysisTable from '../components/SrpOperatorAnalysisTable'
import FreshbusRouteLeadershipMatrix from '../components/FreshbusRouteLeadershipMatrix'
import PlayRatingMedal, { podiumRowClass, type PodiumRank } from '../components/PlayRatingMedal'
import { ServiceViewToggle, type ServiceViewLimit, resolveOperatorLimit } from '../components/OperatorViewToggle'
import { useMarketplaceFilters } from '../context/MarketplaceFilterContext'
import { useRedbusSrp, type RedbusSrpEntry } from '../api'
import { redbusSrpRouteLabel } from '../lib/redbusRoutes'
import { matchesBusTypeFilter, matchesRatingFilter, type BusTypeBucket, type RatingBucket } from '../lib/srpFilters'
import { cx } from '../lib/insights'

function isFreshBus(name: string) {
  return /fresh\s*bus/i.test(name)
}

function formatOccupancyPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return ''
  const pct = Number(value)
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`
}

function formatRating(raw: string | null | undefined): string {
  if (!raw || raw === '0') return ''
  const n = parseFloat(String(raw))
  if (!Number.isFinite(n)) return ''
  return (Math.round(n * 100) / 100).toFixed(2)
}

type SortKey = 'route' | 'operator' | 'timing' | 'duration' | 'busType' | 'price' | 'occupancy' | 'rating' | 'reviews' | 'srpRank'
type SortDir = 'asc' | 'desc'

function rowSrpRank(row: { snapshots?: Record<string, number> }): number | null {
  const slots = Object.values(row.snapshots || {})
  if (!slots.length) return null
  return Math.round(slots.reduce((a, b) => a + Number(b), 0) / slots.length)
}

/** Sort by departure time (first half of "HH:MM - HH:MM"). */
function timingMinutes(raw: string | null | undefined): number {
  if (!raw) return Number.POSITIVE_INFINITY
  const first = String(raw).split('-')[0]?.trim() ?? ''
  const m = first.match(/(\d{1,2}):(\d{2})/)
  if (!m) return Number.POSITIVE_INFINITY
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min)) return Number.POSITIVE_INFINITY
  return h * 60 + min
}

function durationMinutes(raw: string | null | undefined): number {
  if (!raw) return Number.NEGATIVE_INFINITY
  const h = raw.match(/(\d+)\s*h/i)
  const m = raw.match(/(\d+)\s*m/i)
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0)
}

function priceNumber(raw: string | null | undefined): number {
  if (!raw) return Number.NEGATIVE_INFINITY
  const n = Number(String(raw).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY
}

function ratingNumber(raw: string | null | undefined): number {
  const n = parseFloat(String(raw ?? ''))
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY
}

function reviewsNumber(raw: string | null | undefined): number {
  const n = Number(String(raw ?? '').replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY
}

function sortValue(row: RedbusSrpEntry, key: SortKey): number | string {
  switch (key) {
    case 'route':
      return (row.route || '').toLowerCase()
    case 'operator':
      return (row.operator || '').toLowerCase()
    case 'timing':
      return timingMinutes(row.timing)
    case 'duration':
      return durationMinutes(row.duration)
    case 'busType':
      return (row.bus_type || '').toLowerCase()
    case 'price':
      return priceNumber(row.price)
    case 'occupancy':
      return row.occupancy_pct == null ? Number.NEGATIVE_INFINITY : Number(row.occupancy_pct)
    case 'rating':
      return ratingNumber(row.rating)
    case 'reviews':
      return reviewsNumber(row.reviews)
    case 'srpRank': {
      const rank = rowSrpRank(row)
      return rank == null ? Number.POSITIVE_INFINITY : rank
    }
  }
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string
  sortKey: SortKey
  activeKey: SortKey | null
  dir: SortDir
  onSort: (key: SortKey) => void
}) {
  const active = activeKey === sortKey
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th className="srp-th-center">
      <button type="button" className={cx('srp-sort-th', active && 'srp-sort-th--active')} onClick={() => onSort(sortKey)}>
        <span className="srp-sort-th__label">{label}</span>
        <Icon size={14} strokeWidth={2.5} className={cx('srp-sort-th__icon', !active && 'srp-sort-th__idle')} aria-hidden />
      </button>
    </th>
  )
}

export default function RedbusSrpPage() {
  const filters = useMarketplaceFilters()
  const [busTypes, setBusTypes] = useState<BusTypeBucket[]>([])
  const [ratingFilters, setRatingFilters] = useState<RatingBucket[]>([])
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [servicesLimit, setServicesLimit] = useState<ServiceViewLimit>(10)

  const routeObj = filters.selectedRoutes[0]
  const routeString =
    filters.allRoutesSelected || filters.selectedRoutes.length !== 1
      ? undefined
      : routeObj
        ? redbusSrpRouteLabel(...(routeObj.key.split('|') as [string, string]))
        : undefined
  const routeLabel = routeString ?? 'All routes'

  const { data, isLoading, error, isFetching } = useRedbusSrp(
    undefined,
    routeString,
    filters.customStart,
    filters.customEnd,
  )

  const handleApplied = (next: SrpAppliedFilters) => {
    setBusTypes(next.busTypes)
    setRatingFilters(next.ratingFilters)
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filteredBase = useMemo(() => {
    if (!data?.data) return []
    let rows = data.data
    const restrictOperators =
      filters.selectedOperators.length > 0 && !filters.allOperatorsSelected
    if (restrictOperators) {
      rows = rows.filter(row => filters.selectedOperators.includes(row.operator))
    }
    return rows.filter(
      row =>
        matchesBusTypeFilter(row.bus_type, busTypes) && matchesRatingFilter(row.rating, ratingFilters),
    )
  }, [data, filters.selectedOperators, filters.allOperatorsSelected, busTypes, ratingFilters])

  const filteredData = useMemo(() => {
    const sorted = [...filteredBase]
    if (sortKey) {
      sorted.sort((a, b) => {
        const av = sortValue(a, sortKey)
        const bv = sortValue(b, sortKey)
        if (typeof av === 'string' && typeof bv === 'string') {
          const cmp = av.localeCompare(bv)
          return sortDir === 'asc' ? cmp : -cmp
        }
        if (av === bv) return 0
        const cmp = (av as number) < (bv as number) ? -1 : 1
        return sortDir === 'asc' ? cmp : -cmp
      })
    } else {
      sorted.sort((a, b) => {
        const ra = rowSrpRank(a)
        const rb = rowSrpRank(b)
        if (ra == null && rb == null) return 0
        if (ra == null) return 1
        if (rb == null) return -1
        return ra - rb
      })
    }
    return sorted
  }, [filteredBase, sortKey, sortDir])

  const topServiceKeys = useMemo(() => {
    const ranked = [...filteredBase].sort((a, b) => {
      const ra = rowSrpRank(a)
      const rb = rowSrpRank(b)
      if (ra == null && rb == null) return 0
      if (ra == null) return 1
      if (rb == null) return -1
      if (ra !== rb) return ra - rb
      return String(a.operator).localeCompare(String(b.operator))
    })
    const n = resolveOperatorLimit(servicesLimit, ranked.length)
    return new Set(ranked.slice(0, n).map(r => r.service_key))
  }, [filteredBase, servicesLimit])

  const visibleListings = useMemo(() => {
    if (servicesLimit === 'all' || filteredData.length <= 10) return filteredData
    return filteredData.filter(row => topServiceKeys.has(row.service_key))
  }, [filteredData, servicesLimit, topServiceKeys])

  const servicesScopeLabel =
    servicesLimit === 'all' ? 'all services' : `Top ${servicesLimit} services by SRP`

  return (
    <div className="analytics-page flex flex-col gap-5">
      <SrpScraperTestFilterBar onApplied={handleApplied} />

      {!isLoading && !error ? (
        <SrpAnalyticsPanel
          rows={filteredBase}
          routeLabel={routeLabel}
          startDate={filters.customStart}
          endDate={filters.customEnd}
          selectedOperators={
            filters.allOperatorsSelected || filters.selectedOperators.length === 0
              ? []
              : filters.selectedOperators
          }
          busTypes={busTypes}
          ratingFilters={ratingFilters}
        />
      ) : null}

      <FreshbusRouteLeadershipMatrix rows={filteredBase} />

      {!isLoading && !error ? (
        <SrpOperatorAnalysisTable
          rows={filteredBase}
          startDate={filters.customStart}
          endDate={filters.customEnd}
          routeLabel={routeLabel}
        />
      ) : null}

      <section className="srp-listings-panel">
        <div className="srp-listings-panel__head">
          <div>
            <h3 className="srp-listings-panel__title">Service listings</h3>
            <p className="srp-listings-panel__sub">
              Sorted by SRP rank unless you pick another column
              {filteredData.length > 10 ? ` · ${servicesScopeLabel}` : ''}
            </p>
          </div>
          <div className="srp-listings-panel__meta">
            {isFetching && !isLoading ? <span className="srp-listings-live">Refreshing…</span> : null}
            <ServiceViewToggle
              value={servicesLimit}
              total={filteredData.length}
              onChange={setServicesLimit}
            />
            <span className="srp-listings-count">
              <strong>{visibleListings.length}</strong>
              {filteredData.length > visibleListings.length ? ` of ${filteredData.length}` : ''} service
              {visibleListings.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {isLoading && <div className="p-8 text-center text-theme-muted">Loading stored snapshots…</div>}
        {error && (
          <div className="p-8 text-center text-red-500">Unable to load SRP data. Try Sync, then Apply again.</div>
        )}

        {!isLoading && !error && (
          <div className="srp-listings-scroll">
            <table className="data-table srp-listings-table min-w-[1100px]">
              <thead>
                <tr>
                  <SortableTh label="Route" sortKey="route" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableTh label="Operator" sortKey="operator" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableTh label="Timing" sortKey="timing" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableTh label="Duration" sortKey="duration" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableTh label="Bus Type" sortKey="busType" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableTh label="SRP Rank" sortKey="srpRank" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableTh label="Rating" sortKey="rating" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortableTh
                    label="Total No. of Ratings"
                    sortKey="reviews"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label={'Occupancy\u00A0%'}
                    sortKey="occupancy"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh label="Price" sortKey="price" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {visibleListings.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-theme-muted">
                      No data found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  visibleListings.map((row, idx) => {
                    const srpRank = rowSrpRank(row)
                    const podium = (srpRank === 1 || srpRank === 2 || srpRank === 3
                      ? srpRank
                      : undefined) as PodiumRank | undefined
                    const fresh = isFreshBus(row.operator)
                    const ratingText = formatRating(row.rating)
                    const ratingsCount = row.reviews ? String(row.reviews).replace(/[^\d]/g, '') : ''

                    return (
                      <tr key={`${row.service_key}-${idx}`} className={podiumRowClass(podium)}>
                        <td className="srp-cell-route">{row.route}</td>
                        <td className="srp-col-operator">
                          <div className="srp-operator-cell">
                            {podium ? <PlayRatingMedal rank={podium} /> : <span className="srp-operator-medal-spacer" />}
                            <span className={cx('srp-operator-name', fresh && 'srp-operator-name--fresh')}>
                              {row.operator}
                            </span>
                          </div>
                        </td>
                        <td className="tabular-nums srp-cell-timing">{row.timing}</td>
                        <td className="tabular-nums">{row.duration || ''}</td>
                        <td className="srp-cell-bus-type">
                          {row.bus_type || ''}
                        </td>
                        <td>
                          {srpRank != null ? (
                            <span
                              className={cx(
                                'srp-rank-pill',
                                podium === 1 && 'srp-rank-pill--gold',
                                podium === 2 && 'srp-rank-pill--silver',
                                podium === 3 && 'srp-rank-pill--bronze',
                              )}
                            >
                              #{srpRank}
                            </span>
                          ) : (
                            ''
                          )}
                        </td>
                        <td className="tabular-nums">
                          {ratingText ? (
                            <span className="srp-rating-cell">
                              <Star size={12} className="srp-rating-cell__star" fill="currentColor" />
                              {ratingText}
                            </span>
                          ) : (
                            ''
                          )}
                        </td>
                        <td className="tabular-nums font-medium">{ratingsCount}</td>
                        <td className="tabular-nums font-bold">{formatOccupancyPct(row.occupancy_pct)}</td>
                        <td className="font-semibold tabular-nums">{row.price || ''}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
