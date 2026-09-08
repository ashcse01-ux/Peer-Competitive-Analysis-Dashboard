import React, { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Crown } from 'lucide-react'
import type { RedbusSrpEntry } from '../api'
import { weekBucketLabel, weekBucketRangeLabel, type WeekBucket } from '../lib/srpAnalytics'
import {
  analysisExpandMode,
  avgSrpForDates,
  buildOperatorAnalysisRows,
  collectAnalysisDates,
  datesInMonth,
  datesInWeekBucket,
  formatDayLabel,
  formatMonthLabel,
  formatPeriodRangeLabel,
  formatSrp,
  monthKeysFromDates,
  weekBucketsPresent,
  type OperatorAnalysisRow,
} from '../lib/srpOperatorAnalysis'
import OperatorViewToggle, {
  resolveOperatorLimit,
  type OperatorViewLimit,
} from './OperatorViewToggle'
import { cx } from '../lib/insights'

interface Props {
  rows: RedbusSrpEntry[]
  startDate?: string
  endDate?: string
  routeLabel?: string
}

type SortKey =
  | 'operator'
  | 'totalServices'
  | 'marketScore'
  | 'marketLeader'
  | 'bestSrp'
  | 'worstSrp'
  | 'top5'
  | 'top10'
  | 'avgRating'
  | 'avgReviews'
  | 'avgOccupancy'
  | 'avgPrice'
  | 'avgSrp'
  | 'leaderScore'
  | `day:${string}`
  | `month:${string}`
  | `week:${string}:${WeekBucket}`

type SortDir = 'asc' | 'desc'

function formatMoney(value: number | null): string {
  if (value == null) return '—'
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

function formatPct(value: number | null): string {
  if (value == null) return '—'
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`
}

function formatRating(value: number | null): string {
  if (value == null) return '—'
  return value.toFixed(2)
}

function formatReviews(value: number | null): string {
  if (value == null) return '—'
  return Math.round(value).toLocaleString('en-IN')
}

function SrpCell({ value }: { value: number | null }) {
  return <span className="srp-op-srp tabular-nums">{formatSrp(value)}</span>
}

function MarketPositionBadge({ rank, score }: { rank: number; score: number }) {
  if (!rank) return <span className="text-theme-muted">—</span>

  if (rank === 1) {
    return (
      <span
        className="srp-op-pos"
        title={`Market score ${score.toFixed(1)} / 100`}
        style={{
          background: 'linear-gradient(135deg, #F5D76E, #D4AF37)',
          color: '#5C4310',
          border: '1px solid #B8860B',
        }}
      >
        <Crown size={11} strokeWidth={2.5} />
        Leader
      </span>
    )
  }

  if (rank === 2) {
    return (
      <span
        className="srp-op-pos"
        title={`Market score ${score.toFixed(1)} / 100`}
        style={{
          background: 'linear-gradient(135deg, #E8ECF0, #C0C7CE)',
          color: '#1E293B',
          border: '1px solid #8E99A4',
        }}
      >
        Challenger
      </span>
    )
  }

  if (rank === 3) {
    return (
      <span
        className="srp-op-pos"
        title={`Market score ${score.toFixed(1)} / 100`}
        style={{
          background: 'linear-gradient(135deg, #E0A06A, #CD7F32)',
          color: '#3E2410',
          border: '1px solid #A05A2C',
        }}
      >
        Contender
      </span>
    )
  }

  return (
    <span
      className="srp-op-pos"
      title={`Market score ${score.toFixed(1)} / 100`}
      style={{
        background: 'rgba(15, 29, 53, 0.06)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      #{rank}
    </span>
  )
}

function ExpandBtn({
  open,
  onClick,
  label,
}: {
  open: boolean
  onClick: () => void
  label: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={cx('srp-op-expand', open && 'srp-op-expand--on')}
      onClick={e => {
        e.stopPropagation()
        onClick()
      }}
    >
      {open ? <ChevronDown size={13} strokeWidth={2.6} /> : <ChevronRight size={13} strokeWidth={2.6} />}
      <span>{label}</span>
    </button>
  )
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
  sticky,
}: {
  label: React.ReactNode
  sortKey: SortKey
  activeKey: SortKey | null
  dir: SortDir
  onSort: (key: SortKey) => void
  className?: string
  sticky?: boolean
}) {
  const active = activeKey === sortKey
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th className={cx(sticky && 'srp-op-sticky', className)}>
      <button type="button" className={cx('srp-sort-th', active && 'srp-sort-th--active')} onClick={() => onSort(sortKey)}>
        <span className="srp-sort-th__label">{label}</span>
        <Icon size={14} strokeWidth={2.5} className={cx('srp-sort-th__icon', !active && 'srp-sort-th__idle')} aria-hidden />
      </button>
    </th>
  )
}

function sortNumber(value: number | null | undefined, missing: 'low' | 'high'): number {
  if (value == null || Number.isNaN(value)) {
    return missing === 'low' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
  }
  return value
}

export default function SrpOperatorAnalysisTable({ rows, startDate, endDate, routeLabel }: Props) {
  const dates = useMemo(
    () => collectAnalysisDates(rows, startDate, endDate),
    [rows, startDate, endDate],
  )
  const mode = useMemo(() => analysisExpandMode(dates), [dates])
  const operators = useMemo(() => buildOperatorAnalysisRows(rows, dates), [rows, dates])

  const [daysOpen, setDaysOpen] = useState(false)
  const [openMonths, setOpenMonths] = useState<Set<string>>(() => new Set())
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(() => new Set())
  const [sortKey, setSortKey] = useState<SortKey | null>('leaderScore')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [opsLimit, setOpsLimit] = useState<OperatorViewLimit>(10)

  const monthKeys = useMemo(() => monthKeysFromDates(dates), [dates])

  const toggleMonth = (mk: string) => {
    setOpenMonths(prev => {
      const next = new Set(prev)
      if (next.has(mk)) {
        next.delete(mk)
        setOpenWeeks(w => {
          const nw = new Set(w)
          for (const key of nw) if (key.startsWith(`${mk}::`)) nw.delete(key)
          return nw
        })
      } else next.add(mk)
      return next
    })
  }

  const toggleWeek = (mk: string, bucket: WeekBucket) => {
    const key = `${mk}::${bucket}`
    setOpenWeeks(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      const defaultDesc =
        key === 'totalServices' ||
        key === 'marketScore' ||
        key === 'top5' ||
        key === 'top10' ||
        key === 'avgRating' ||
        key === 'avgReviews' ||
        key === 'avgOccupancy' ||
        key === 'avgPrice' ||
        key === 'leaderScore'
      setSortDir(defaultDesc ? 'desc' : 'asc')
    }
  }

  type DynCol =
    | { kind: 'period-avg'; sortKey: SortKey }
    | { kind: 'day'; date: string; sortKey: SortKey }
    | { kind: 'month'; monthKey: string; sortKey: SortKey }
    | { kind: 'week'; monthKey: string; bucket: WeekBucket; sortKey: SortKey }
    | { kind: 'month-day'; date: string; sortKey: SortKey }

  const dynCols: DynCol[] = useMemo(() => {
    if (!dates.length) return []
    if (mode === 'days') {
      const cols: DynCol[] = [{ kind: 'period-avg', sortKey: 'avgSrp' }]
      if (daysOpen) {
        for (const d of dates) cols.push({ kind: 'day', date: d, sortKey: `day:${d}` })
      }
      return cols
    }
    const cols: DynCol[] = []
    for (const mk of monthKeys) {
      cols.push({ kind: 'month', monthKey: mk, sortKey: `month:${mk}` })
      if (!openMonths.has(mk)) continue
      const monthDates = datesInMonth(dates, mk)
      for (const bucket of weekBucketsPresent(monthDates)) {
        cols.push({ kind: 'week', monthKey: mk, bucket, sortKey: `week:${mk}:${bucket}` })
        if (!openWeeks.has(`${mk}::${bucket}`)) continue
        for (const d of datesInWeekBucket(monthDates, bucket)) {
          cols.push({ kind: 'month-day', date: d, sortKey: `day:${d}` })
        }
      }
    }
    return cols
  }, [dates, mode, daysOpen, monthKeys, openMonths, openWeeks])

  const cellValue = (row: OperatorAnalysisRow, col: DynCol): number | null => {
    if (col.kind === 'period-avg') return row.avgSrp
    if (col.kind === 'day' || col.kind === 'month-day') return row.dailySrp[col.date] ?? null
    if (col.kind === 'month') return avgSrpForDates(row, datesInMonth(dates, col.monthKey))
    if (col.kind === 'week') {
      return avgSrpForDates(row, datesInWeekBucket(datesInMonth(dates, col.monthKey), col.bucket))
    }
    return null
  }

  const sortedOperators = useMemo(() => {
    if (!sortKey) return operators
    const ranked = [...operators]
    ranked.sort((a, b) => {
      let av: number | string = 0
      let bv: number | string = 0

      switch (sortKey) {
        case 'operator':
          av = a.displayName.toLowerCase()
          bv = b.displayName.toLowerCase()
          break
        case 'totalServices':
          av = a.totalServices
          bv = b.totalServices
          break
        case 'marketScore':
        case 'leaderScore':
          av = a.leaderScore
          bv = b.leaderScore
          break
        case 'marketLeader':
          av = a.marketRank
          bv = b.marketRank
          break
        case 'bestSrp':
          av = sortNumber(a.bestSrp, 'high')
          bv = sortNumber(b.bestSrp, 'high')
          break
        case 'worstSrp':
          av = sortNumber(a.worstSrp, 'high')
          bv = sortNumber(b.worstSrp, 'high')
          break
        case 'top5':
          av = a.top5Services
          bv = b.top5Services
          break
        case 'top10':
          av = a.top10Services
          bv = b.top10Services
          break
        case 'avgRating':
          av = sortNumber(a.avgRating, 'low')
          bv = sortNumber(b.avgRating, 'low')
          break
        case 'avgReviews':
          av = sortNumber(a.avgReviews, 'low')
          bv = sortNumber(b.avgReviews, 'low')
          break
        case 'avgOccupancy':
          av = sortNumber(a.avgOccupancy, 'low')
          bv = sortNumber(b.avgOccupancy, 'low')
          break
        case 'avgPrice':
          av = sortNumber(a.avgPrice, 'low')
          bv = sortNumber(b.avgPrice, 'low')
          break
        case 'avgSrp':
          av = sortNumber(a.avgSrp, 'high')
          bv = sortNumber(b.avgSrp, 'high')
          break
        default: {
          if (sortKey.startsWith('day:')) {
            const d = sortKey.slice(4)
            av = sortNumber(a.dailySrp[d], 'high')
            bv = sortNumber(b.dailySrp[d], 'high')
          } else if (sortKey.startsWith('month:')) {
            const mk = sortKey.slice(6)
            av = sortNumber(avgSrpForDates(a, datesInMonth(dates, mk)), 'high')
            bv = sortNumber(avgSrpForDates(b, datesInMonth(dates, mk)), 'high')
          } else if (sortKey.startsWith('week:')) {
            const [, mk, bucketRaw] = sortKey.split(':')
            const bucket = Number(bucketRaw) as WeekBucket
            av = sortNumber(avgSrpForDates(a, datesInWeekBucket(datesInMonth(dates, mk), bucket)), 'high')
            bv = sortNumber(avgSrpForDates(b, datesInWeekBucket(datesInMonth(dates, mk), bucket)), 'high')
          }
          break
        }
      }

      if (typeof av === 'string' && typeof bv === 'string') {
        const cmp = av.localeCompare(bv)
        return sortDir === 'asc' ? cmp : -cmp
      }
      if (av === bv) return a.displayName.localeCompare(b.displayName)
      const cmp = (av as number) < (bv as number) ? -1 : 1
      return sortDir === 'asc' ? cmp : -cmp
    })
    return ranked
  }, [operators, sortKey, sortDir, dates])

  const visibleOperators = useMemo(() => {
    const n = resolveOperatorLimit(opsLimit, sortedOperators.length)
    return sortedOperators.slice(0, n)
  }, [opsLimit, sortedOperators])

  const limitLabel =
    opsLimit === 'all' ? `${operators.length} operators` : `Top ${opsLimit} of ${operators.length} operators`

  return (
    <section className="srp-listings-panel srp-op-panel">
      <div className="srp-listings-panel__head">
        <div>
          <h3 className="srp-listings-panel__title">SRP Analysis By Operators</h3>
          <p className="srp-listings-panel__sub">
            {routeLabel ? `${routeLabel} · ` : ''}
            {dates.length
              ? `${formatPeriodRangeLabel(dates)} · ${limitLabel} · Market Score = 50% volume + 25% SRP (sample-shrunk) + 15% top-5 volume + 10% rating`
              : 'Apply filters to load operator SRP analysis'}
          </p>
        </div>
        <div className="srp-listings-panel__actions">
          <OperatorViewToggle value={opsLimit} total={operators.length} onChange={setOpsLimit} />
          <span className="srp-listings-count">
            <strong>{visibleOperators.length}</strong>
            {operators.length > visibleOperators.length ? ` of ${operators.length}` : ''} operator
            {visibleOperators.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {!rows.length || !dates.length ? (
        <div className="p-8 text-center text-theme-muted">No operator data for the selected filters.</div>
      ) : (
        <div className="srp-listings-scroll">
          <table className="data-table srp-listings-table srp-op-table">
            <thead>
              <tr>
                <SortableTh label="Operator" sortKey="operator" activeKey={sortKey} dir={sortDir} onSort={handleSort} sticky />
                <SortableTh label="Total Services" sortKey="totalServices" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Market Score" sortKey="marketScore" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Market Position" sortKey="marketLeader" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Best SRP" sortKey="bestSrp" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Worst SRP" sortKey="worstSrp" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Services in Top 5" sortKey="top5" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Services in Top 10" sortKey="top10" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Avg Rating" sortKey="avgRating" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Avg Total No. of Ratings" sortKey="avgReviews" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label={'Avg Occupancy\u00A0%'} sortKey="avgOccupancy" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Avg Price" sortKey="avgPrice" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                {dynCols.map(col => {
                  if (col.kind === 'period-avg') {
                    return (
                      <th key="period-avg" className="srp-op-dyn">
                        <div className="srp-op-dyn-head">
                          <ExpandBtn
                            open={daysOpen}
                            onClick={() => setDaysOpen(v => !v)}
                            label={`AVG SRP (${formatPeriodRangeLabel(dates)})`}
                          />
                          <button
                            type="button"
                            className={cx('srp-sort-th srp-op-dyn-sort', sortKey === 'avgSrp' && 'srp-sort-th--active')}
                            onClick={() => handleSort('avgSrp')}
                            aria-label="Sort by average SRP"
                          >
                            {sortKey === 'avgSrp' ? (
                              sortDir === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} /> : <ArrowDown size={13} strokeWidth={2.5} />
                            ) : (
                              <ArrowUpDown size={13} strokeWidth={2.2} className="srp-sort-th__idle" />
                            )}
                          </button>
                        </div>
                      </th>
                    )
                  }
                  if (col.kind === 'day' || col.kind === 'month-day') {
                    return (
                      <SortableTh
                        key={`d-${col.date}`}
                        className="srp-op-dyn srp-op-dyn--day"
                        label={formatDayLabel(col.date)}
                        sortKey={col.sortKey}
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                    )
                  }
                  if (col.kind === 'month') {
                    const open = openMonths.has(col.monthKey)
                    return (
                      <th key={`m-${col.monthKey}`} className="srp-op-dyn">
                        <div className="srp-op-dyn-head">
                          <ExpandBtn
                            open={open}
                            onClick={() => toggleMonth(col.monthKey)}
                            label={`${formatMonthLabel(col.monthKey)} MTD`}
                          />
                          <button
                            type="button"
                            className={cx('srp-sort-th srp-op-dyn-sort', sortKey === col.sortKey && 'srp-sort-th--active')}
                            onClick={() => handleSort(col.sortKey)}
                            aria-label={`Sort by ${formatMonthLabel(col.monthKey)}`}
                          >
                            {sortKey === col.sortKey ? (
                              sortDir === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} /> : <ArrowDown size={13} strokeWidth={2.5} />
                            ) : (
                              <ArrowUpDown size={13} strokeWidth={2.2} className="srp-sort-th__idle" />
                            )}
                          </button>
                        </div>
                      </th>
                    )
                  }
                  const open = openWeeks.has(`${col.monthKey}::${col.bucket}`)
                  return (
                    <th key={`w-${col.monthKey}-${col.bucket}`} className="srp-op-dyn srp-op-dyn--week">
                      <div className="srp-op-dyn-head">
                        <ExpandBtn
                          open={open}
                          onClick={() => toggleWeek(col.monthKey, col.bucket)}
                          label={`${weekBucketLabel(col.bucket)} (${weekBucketRangeLabel(col.bucket)})`}
                        />
                        <button
                          type="button"
                          className={cx('srp-sort-th srp-op-dyn-sort', sortKey === col.sortKey && 'srp-sort-th--active')}
                          onClick={() => handleSort(col.sortKey)}
                          aria-label={`Sort by week ${col.bucket}`}
                        >
                          {sortKey === col.sortKey ? (
                            sortDir === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} /> : <ArrowDown size={13} strokeWidth={2.5} />
                          ) : (
                            <ArrowUpDown size={13} strokeWidth={2.2} className="srp-sort-th__idle" />
                          )}
                        </button>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {visibleOperators.map(row => (
                <tr
                  key={row.operator}
                  className={cx(
                    row.freshbus && 'srp-op-row--fresh',
                    row.marketRank === 1 && 'srp-op-row--gold',
                    row.marketRank === 2 && 'srp-op-row--silver',
                    row.marketRank === 3 && 'srp-op-row--bronze',
                  )}
                >                  <td className="srp-op-sticky srp-op-name-cell">
                    <span className={cx('srp-operator-name', row.freshbus && 'srp-operator-name--fresh')}>
                      {row.displayName}
                    </span>
                  </td>
                  <td className="tabular-nums font-semibold">{row.totalServices}</td>
                  <td>
                    <span className="srp-op-score tabular-nums" title="Market score / 100">
                      {row.leaderScore.toFixed(1)}
                    </span>
                  </td>
                  <td>
                    <MarketPositionBadge rank={row.marketRank || 0} score={row.leaderScore} />
                  </td>
                  <td className="tabular-nums font-bold">{row.bestSrp != null ? `#${row.bestSrp}` : '—'}</td>
                  <td className="tabular-nums font-bold">{row.worstSrp != null ? `#${row.worstSrp}` : '—'}</td>
                  <td className="tabular-nums font-semibold">{row.top5Services}</td>
                  <td className="tabular-nums font-semibold">{row.top10Services}</td>
                  <td className="tabular-nums">{formatRating(row.avgRating)}</td>
                  <td className="tabular-nums">{formatReviews(row.avgReviews)}</td>
                  <td className="tabular-nums font-semibold">{formatPct(row.avgOccupancy)}</td>
                  <td className="tabular-nums font-semibold">{formatMoney(row.avgPrice)}</td>
                  {dynCols.map(col => (
                    <td key={String(col.sortKey)} className="srp-op-dyn">
                      <SrpCell value={cellValue(row, col)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
