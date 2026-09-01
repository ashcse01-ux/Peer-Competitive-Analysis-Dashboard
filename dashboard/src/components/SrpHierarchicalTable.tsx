import React, { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Minimize2, Maximize2 } from 'lucide-react'
import type { SrpRouteTree, SrpServiceRecord } from '../lib/marketplaceMockData'
import {
  SRP_SLOT_KEYS,
  dayAvg,
  dayAvgMany,
  formatDateDayOfWeek,
  formatDateHeaderShort,
  formatSnapshotSlotShort,
  monthAvg,
  monthAvgMany,
  srpAt,
  weekAvg,
  weekAvgMany,
  type SrpSlotKey,
  type WeekBucket,
} from '../lib/srpAnalytics'
import { isFreshBus, operatorColor } from '../lib/marketplaceConfig'
import { cx } from '../lib/insights'
import SrpRankBadge from './SrpRankBadge'

export type TimeDepth = 'month' | 'weeks' | 'dates'

interface Props {
  trees: SrpRouteTree[]
  dates: string[]
  accent?: string
  slotAvailability?: (date: string) => SrpSlotKey[]
}

type RowKind = 'route' | 'operator' | 'service'

interface DisplayRow {
  kind: RowKind
  rowKey: string
  routeKey: string
  routeLabel: string
  operatorId?: string
  operatorName?: string
  freshbus: boolean
  service?: SrpServiceRecord
  pool: SrpServiceRecord[]
  showRouteCell: boolean
  routeRowSpan: number
  showOperatorCell: boolean
  operatorRowSpan: number
}

function opKey(routeKey: string, operatorId: string) {
  return `${routeKey}::${operatorId}`
}

function effectiveSrp(
  service: SrpServiceRecord,
  date: string,
  slot: SrpSlotKey,
  slotAvailability?: (date: string) => SrpSlotKey[],
): number | null {
  if (slotAvailability && !slotAvailability(date).includes(slot)) return null
  return srpAt(service.snapshotsByDate, date, slot)
}

function dayAvgEffective(
  service: SrpServiceRecord,
  date: string,
  slotAvailability?: (date: string) => SrpSlotKey[],
): number | null {
  if (!slotAvailability) return dayAvg(service, date)
  const vals = SRP_SLOT_KEYS.map(s => effectiveSrp(service, date, s, slotAvailability)).filter(
    (v): v is number => v != null,
  )
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function dayAvgPool(
  pool: SrpServiceRecord[],
  date: string,
  slotAvailability?: (date: string) => SrpSlotKey[],
): number | null {
  if (slotAvailability) {
    const vals = pool.map(s => dayAvgEffective(s, date, slotAvailability)).filter((v): v is number => v != null)
    if (!vals.length) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }
  return dayAvgMany(pool, date)
}

function slotAvgPool(
  pool: SrpServiceRecord[],
  date: string,
  slot: SrpSlotKey,
  slotAvailability?: (date: string) => SrpSlotKey[],
): number | null {
  const vals = pool
    .map(s => effectiveSrp(s, date, slot, slotAvailability))
    .filter((v): v is number => v != null)
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function rankForPool(
  pool: SrpServiceRecord[],
  service: SrpServiceRecord | undefined,
  dates: string[],
  timeDepth: TimeDepth,
  week: WeekBucket | null,
  date: string | null,
  slot: SrpSlotKey | null,
  slotAvailability?: (date: string) => SrpSlotKey[],
): number | null {
  if (timeDepth === 'month') {
    return service ? monthAvg(service, dates) : monthAvgMany(pool, dates)
  }
  if (timeDepth === 'weeks' && week != null) {
    return service ? weekAvg(service, dates, week) : weekAvgMany(pool, dates, week)
  }
  if (date == null) return null
  if (slot != null) {
    return service ? effectiveSrp(service, date, slot, slotAvailability) : slotAvgPool(pool, date, slot, slotAvailability)
  }
  return service ? dayAvgEffective(service, date, slotAvailability) : dayAvgPool(pool, date, slotAvailability)
}

function buildDisplayRows(
  trees: SrpRouteTree[],
  expandedRoutes: Set<string>,
  expandedOperators: Set<string>,
): DisplayRow[] {
  const rows: DisplayRow[] = []

  for (const tree of trees) {
    const allServices = tree.operators.flatMap(o => o.services)
    const routeExpanded = expandedRoutes.has(tree.routeKey)

    if (!routeExpanded) {
      rows.push({
        kind: 'route',
        rowKey: `route-${tree.routeKey}`,
        routeKey: tree.routeKey,
        routeLabel: tree.routeLabel,
        freshbus: allServices.some(s => isFreshBus(s.scrapedOperatorName)),
        pool: allServices,
        showRouteCell: true,
        routeRowSpan: 1,
        showOperatorCell: false,
        operatorRowSpan: 0,
      })
      continue
    }

    let routeVisibleCount = 0
    for (const op of tree.operators) {
      const key = opKey(tree.routeKey, op.canonicalId)
      routeVisibleCount += expandedOperators.has(key) ? op.services.length : 1
    }

    let routeFirst = true
    for (const op of tree.operators) {
      const key = opKey(tree.routeKey, op.canonicalId)
      const opExpanded = expandedOperators.has(key)
      const freshbus = op.services.some(s => isFreshBus(s.scrapedOperatorName))

      if (!opExpanded) {
        rows.push({
          kind: 'operator',
          rowKey: key,
          routeKey: tree.routeKey,
          routeLabel: tree.routeLabel,
          operatorId: op.canonicalId,
          operatorName: op.displayName,
          freshbus,
          pool: op.services,
          showRouteCell: routeFirst,
          routeRowSpan: routeVisibleCount,
          showOperatorCell: true,
          operatorRowSpan: 1,
        })
        routeFirst = false
        continue
      }

      let opFirst = true
      for (const service of op.services) {
        rows.push({
          kind: 'service',
          rowKey: service.serviceId,
          routeKey: tree.routeKey,
          routeLabel: tree.routeLabel,
          operatorId: op.canonicalId,
          operatorName: op.displayName,
          freshbus,
          service,
          pool: [service],
          showRouteCell: routeFirst,
          routeRowSpan: routeVisibleCount,
          showOperatorCell: opFirst,
          operatorRowSpan: op.services.length,
        })
        routeFirst = false
        opFirst = false
      }
    }
  }

  return rows
}

function ColToggle({
  open,
  label,
  sublabel,
  onClick,
  tone = 'month',
  compact,
}: {
  open: boolean
  label: string
  sublabel?: string
  onClick: () => void
  tone?: 'month' | 'week' | 'date'
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('srp-col-toggle', `srp-col-toggle--${tone}`, compact && 'srp-col-toggle--compact')}
    >
      <span className="srp-col-toggle-main">
        {open ? <ChevronDown size={compact ? 11 : 13} strokeWidth={2.5} /> : <ChevronRight size={compact ? 11 : 13} strokeWidth={2.5} />}
        {label}
      </span>
      {sublabel ? <span className="srp-col-toggle-sub">{sublabel}</span> : null}
    </button>
  )
}

function DataCell({ children, zone }: { children: React.ReactNode; zone: 'month' | 'week' | 'date' }) {
  return (
    <td className={cx('srp-data-cell', `srp-data-cell--${zone}`)}>
      <div className="srp-data-cell-inner">{children}</div>
    </td>
  )
}

function TemporalCells({
  pool,
  service,
  dates,
  timeDepth,
  expandedDates,
  slotAvailability,
}: {
  pool: SrpServiceRecord[]
  service?: SrpServiceRecord
  dates: string[]
  timeDepth: TimeDepth
  expandedDates: Set<string>
  slotAvailability?: (date: string) => SrpSlotKey[]
}) {
  if (timeDepth === 'month') {
    return (
      <DataCell zone="month">
        <SrpRankBadge value={rankForPool(pool, service, dates, 'month', null, null, null, slotAvailability)} />
      </DataCell>
    )
  }

  if (timeDepth === 'weeks') {
    return (
      <>
        {([1, 2, 3, 4] as WeekBucket[]).map(w => (
          <DataCell key={w} zone="week">
            <SrpRankBadge compact value={rankForPool(pool, service, dates, 'weeks', w, null, null, slotAvailability)} />
          </DataCell>
        ))}
      </>
    )
  }

  return (
    <>
      {dates.map(date => {
        const open = expandedDates.has(date)
        if (!open) {
          return (
            <DataCell key={date} zone="date">
              <SrpRankBadge value={rankForPool(pool, service, dates, 'dates', null, date, null, slotAvailability)} />
            </DataCell>
          )
        }
        return (
          <React.Fragment key={date}>
            {SRP_SLOT_KEYS.map(slot => (
              <DataCell key={`${date}-${slot}`} zone="date">
                <SrpRankBadge compact value={rankForPool(pool, service, dates, 'dates', null, date, slot, slotAvailability)} />
              </DataCell>
            ))}
          </React.Fragment>
        )
      })}
    </>
  )
}

function temporalColCount(timeDepth: TimeDepth, dates: string[], expandedDates: Set<string>): number {
  if (timeDepth === 'month') return 1
  if (timeDepth === 'weeks') return 4
  return dates.reduce((n, d) => n + (expandedDates.has(d) ? 4 : 1), 0)
}

export default function SrpHierarchicalTable({ trees, dates, accent = 'var(--fb-blue)', slotAvailability }: Props) {
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(() => new Set(trees.map(t => t.routeKey)))
  const [expandedOperators, setExpandedOperators] = useState<Set<string>>(new Set())
  const [timeDepth, setTimeDepth] = useState<TimeDepth>('month')
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())

  useEffect(() => {
    setExpandedRoutes(prev => {
      const next = new Set(prev)
      for (const t of trees) next.add(t.routeKey)
      return next
    })
  }, [trees])

  const displayRows = useMemo(
    () => buildDisplayRows(trees, expandedRoutes, expandedOperators),
    [trees, expandedRoutes, expandedOperators],
  )

  const totalServices = trees.reduce((n, t) => n + t.operators.reduce((s, o) => s + o.services.length, 0), 0)
  const anyDatesExpanded = dates.some(d => expandedDates.has(d))
  const timeColCount = temporalColCount(timeDepth, dates, expandedDates)

  const headerRowSpan = useMemo(() => {
    if (timeDepth === 'month') return 2
    if (timeDepth === 'weeks') return 2
    return anyDatesExpanded ? 3 : 2
  }, [timeDepth, anyDatesExpanded])

  const temporalColDefs = useMemo(() => {
    if (timeDepth === 'month') return [{ key: 'mtd', kind: 'avg' as const }]
    if (timeDepth === 'weeks') {
      return ([1, 2, 3, 4] as WeekBucket[]).map(w => ({ key: `w${w}`, kind: 'avg' as const }))
    }
    return dates.flatMap(date =>
      expandedDates.has(date)
        ? SRP_SLOT_KEYS.map(slot => ({ key: `${date}-${slot}`, kind: 'slot' as const }))
        : [{ key: `${date}-avg`, kind: 'avg' as const }],
    )
  }, [timeDepth, dates, expandedDates])

  const toggleRoute = (routeKey: string) => {
    setExpandedRoutes(prev => {
      const next = new Set(prev)
      if (next.has(routeKey)) next.delete(routeKey)
      else next.add(routeKey)
      return next
    })
  }

  const toggleOperator = (key: string) => {
    setExpandedOperators(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleDate = (date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  const expandAllRoutes = () => setExpandedRoutes(new Set(trees.map(t => t.routeKey)))
  const collapseAllRoutes = () => setExpandedRoutes(new Set())
  const expandAllOperators = () => {
    const keys = trees.flatMap(t => t.operators.map(o => opKey(t.routeKey, o.canonicalId)))
    setExpandedOperators(new Set(keys))
  }
  const collapseAllOperators = () => setExpandedOperators(new Set())

  const shortRoute = (label: string) => label.replace(/\s*→\s*/g, ' – ')

  return (
    <article className="srp-workbook">
      <header className="srp-workbook-header">
        <div className="min-w-0 flex-1">
          <h3 className="srp-workbook-title">SRP workbook</h3>
          <p className="srp-workbook-sub">
            {trees.length} route{trees.length === 1 ? '' : 's'} · {totalServices} services · Month → Weeks → Dates drill-down
          </p>
        </div>
        <div className="srp-toolbar">
          <button type="button" className="srp-toolbar-btn" onClick={expandAllRoutes}>
            <Maximize2 size={13} /> Routes
          </button>
          <button type="button" className="srp-toolbar-btn" onClick={collapseAllRoutes}>
            <Minimize2 size={13} /> Routes
          </button>
          <button type="button" className="srp-toolbar-btn" onClick={expandAllOperators}>
            <Maximize2 size={13} /> Operators
          </button>
          <button type="button" className="srp-toolbar-btn" onClick={collapseAllOperators}>
            <Minimize2 size={13} /> Operators
          </button>
        </div>
      </header>

      <div className="srp-grid-scroll">
        <table className="srp-table srp-table--workbook">
          <colgroup>
            <col className="srp-col-route" />
            <col className="srp-col-operator" />
            <col className="srp-col-service" />
            {temporalColDefs.map(col => (
              <col key={col.key} className={col.kind === 'slot' ? 'srp-col-slot' : 'srp-col-data'} />
            ))}
          </colgroup>
          <thead>
            <tr className="srp-thead-band">
              <th className="srp-sticky-route srp-th-dim" rowSpan={headerRowSpan}>Route</th>
              <th className="srp-sticky-operator srp-th-dim" rowSpan={headerRowSpan}>Op</th>
              <th className="srp-sticky-service srp-th-dim" rowSpan={headerRowSpan}>Svc</th>
              <th colSpan={timeColCount} className={cx('srp-th-band', `srp-th-band--${timeDepth}`)}>
                <span className="srp-th-band-inner">
                  {timeDepth === 'month' && 'Month MTD'}
                  {timeDepth === 'weeks' && 'Weeks'}
                  {timeDepth === 'dates' && 'Daily'}
                  {timeDepth === 'weeks' ? (
                    <span className="srp-th-band-nav">
                      <button type="button" className="srp-th-nav-btn" onClick={() => setTimeDepth('month')}>‹ MTD</button>
                      <button type="button" className="srp-th-nav-btn" onClick={() => setTimeDepth('dates')}>Dates ›</button>
                    </span>
                  ) : null}
                  {timeDepth === 'dates' ? (
                    <button
                      type="button"
                      className="srp-th-nav-btn"
                      onClick={() => {
                        setTimeDepth('weeks')
                        setExpandedDates(new Set())
                      }}
                    >
                      ‹ Weeks
                    </button>
                  ) : null}
                </span>
              </th>
            </tr>

            <tr className="srp-thead-cols">
              {timeDepth === 'month' && (
                <th className="srp-th-col srp-th-col--month">
                  <ColToggle open={false} tone="month" label="Avg" onClick={() => setTimeDepth('weeks')} />
                </th>
              )}

              {timeDepth === 'weeks' &&
                ([1, 2, 3, 4] as WeekBucket[]).map(w => (
                  <th key={w} className="srp-th-col srp-th-col--week">
                    <span className="srp-week-chip">W{w}</span>
                  </th>
                ))}

              {timeDepth === 'dates' &&
                dates.map(date => {
                  const open = expandedDates.has(date)
                  const dow = formatDateDayOfWeek(date)
                  if (!open) {
                    return (
                      <th key={date} className="srp-th-col srp-th-col--date">
                        <ColToggle
                          open={false}
                          tone="date"
                          label={formatDateHeaderShort(date)}
                          compact
                          onClick={() => toggleDate(date)}
                        />
                        <span className="srp-date-dow">{dow}</span>
                      </th>
                    )
                  }
                  return (
                    <th key={date} colSpan={4} className="srp-th-col srp-th-col--date srp-th-col--expanded">
                      <ColToggle open tone="date" label={formatDateHeaderShort(date)} compact onClick={() => toggleDate(date)} />
                      <span className="srp-date-dow">{dow}</span>
                    </th>
                  )
                })}
            </tr>

            {timeDepth === 'dates' && anyDatesExpanded ? (
              <tr className="srp-thead-slots">
                {dates.map(date => {
                  if (!expandedDates.has(date)) {
                    return <th key={`slot-${date}`} className="srp-th-slot-spacer" />
                  }
                  return (
                    <React.Fragment key={`slot-${date}`}>
                      {SRP_SLOT_KEYS.map(slot => (
                        <th key={slot} className="srp-th-slot">{formatSnapshotSlotShort(slot)}</th>
                      ))}
                    </React.Fragment>
                  )
                })}
              </tr>
            ) : null}
          </thead>

          <tbody>
            {displayRows.map((row, idx) => {
              const isSummary = row.kind !== 'service'
              const pool = row.pool
              const service = row.service

              return (
                <tr
                  key={row.rowKey}
                  className={cx(
                    'srp-row',
                    `srp-row--${row.kind}`,
                    idx % 2 === 1 && 'srp-row--zebra',
                    row.freshbus && 'srp-row--freshbus',
                    isSummary && 'srp-row--summary',
                  )}
                >
                  {row.showRouteCell ? (
                    <td className="srp-sticky-route srp-dim-cell srp-dim-cell--route" rowSpan={row.routeRowSpan} style={{ borderLeftColor: accent }}>
                      <button type="button" className="srp-row-toggle" onClick={() => toggleRoute(row.routeKey)}>
                        {expandedRoutes.has(row.routeKey) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        <span className="srp-route-code" title={row.routeLabel}>{shortRoute(row.routeLabel)}</span>
                      </button>
                    </td>
                  ) : null}

                  {row.kind === 'route' ? (
                    <td className="srp-sticky-operator srp-dim-cell srp-dim-cell--muted" colSpan={2}>
                      <span className="srp-summary-label">All operators · {pool.length} services</span>
                    </td>
                  ) : null}

                  {row.kind !== 'route' && row.showOperatorCell ? (
                    <td
                      className={cx('srp-sticky-operator srp-dim-cell srp-dim-cell--operator', row.freshbus && 'srp-dim-cell--freshbus')}
                      rowSpan={row.operatorRowSpan}
                    >
                      <button type="button" className="srp-row-toggle" onClick={() => toggleOperator(opKey(row.routeKey, row.operatorId!))}>
                        {expandedOperators.has(opKey(row.routeKey, row.operatorId!)) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="srp-operator-dot" style={{ background: operatorColor(row.operatorName!) }} />
                        <span className="srp-operator-name" title={row.operatorName}>{row.operatorName}</span>
                      </button>
                    </td>
                  ) : null}

                  {row.kind === 'service' ? (
                    <td className="srp-sticky-service srp-dim-cell srp-dim-cell--service">
                      <span className="srp-service-name" title={service!.serviceLabel}>{service!.serviceLabel}</span>
                      <span className="srp-service-depart">{service!.departureTime}</span>
                    </td>
                  ) : row.kind === 'operator' ? (
                    <td className="srp-sticky-service srp-dim-cell srp-dim-cell--muted">
                      <span className="srp-summary-label">{pool.length} services · expand for detail</span>
                    </td>
                  ) : null}

                  <TemporalCells
                    pool={pool}
                    service={service}
                    dates={dates}
                    timeDepth={timeDepth}
                    expandedDates={expandedDates}
                    slotAvailability={slotAvailability}
                  />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </article>
  )
}
