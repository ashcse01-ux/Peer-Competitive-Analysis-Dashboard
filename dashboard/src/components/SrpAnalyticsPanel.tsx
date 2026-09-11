import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { RedbusSrpEntry } from '../api'
import {
  buildOperatorRankHeatmap,
  buildOperatorVisibilityRanking,
  expandObservations,
  SRP_RANK_BANDS,
} from '../lib/srpVizAnalytics'
import { type BusTypeBucket, type RatingBucket } from '../lib/srpFilters'
import { cx } from '../lib/insights'
import { FB_BLUE } from '../lib/playTopics'
import OperatorViewToggle, {
  resolveOperatorLimit,
  type OperatorViewLimit,
} from './OperatorViewToggle'

interface Props {
  rows: RedbusSrpEntry[]
  routeLabel: string
  startDate: string
  endDate: string
  selectedOperators: string[]
  busTypes: BusTypeBucket[]
  ratingFilters: RatingBucket[]
}

function ChartCard({
  title,
  description,
  className,
  children,
  empty,
  action,
}: {
  title: string
  description: string
  className?: string
  children: React.ReactNode
  empty?: string | null
  action?: React.ReactNode
}) {
  return (
    <section className={cx('srp-viz-card', className)}>
      <header className="srp-viz-card__head">
        <div className="srp-viz-card__head-main">
          <h3 className="srp-viz-card__title">{title}</h3>
          <p className="srp-viz-card__desc">{description}</p>
        </div>
        {action ? <div className="srp-viz-card__action">{action}</div> : null}
      </header>
      <div className="srp-viz-card__body">
        {empty ? <div className="srp-viz-empty">{empty}</div> : children}
      </div>
    </section>
  )
}

function heatBg(pct: number | null, max = 100): React.CSSProperties {
  if (pct == null) return { background: 'transparent', color: 'var(--text-muted)' }
  const t = Math.min(1, Math.max(0, pct / max))
  const alpha = 0.08 + t * 0.55
  return {
    background: `rgba(12, 77, 195, ${alpha})`,
    color: t > 0.55 ? '#fff' : 'var(--text-primary)',
    fontWeight: 750,
  }
}

export default function SrpAnalyticsPanel({
  rows,
  startDate,
  endDate,
}: Props) {
  type ChartKey = 'avgSrp' | 'serviceCount' | 'rankHeat'

  const [limits, setLimits] = useState<Record<ChartKey, OperatorViewLimit>>({
    avgSrp: 10,
    serviceCount: 10,
    rankHeat: 10,
  })

  const [flippedHeatCell, setFlippedHeatCell] = useState<string | null>(null)
  const heatFlipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (heatFlipTimer.current) clearTimeout(heatFlipTimer.current)
    }
  }, [])

  const flipHeatCell = (id: string) => {
    if (heatFlipTimer.current) clearTimeout(heatFlipTimer.current)
    setFlippedHeatCell(id)
    heatFlipTimer.current = setTimeout(() => setFlippedHeatCell(null), 2500)
  }

  const obs = useMemo(() => expandObservations(rows, startDate, endDate), [rows, startDate, endDate])

  const rankingAll = useMemo(
    () => buildOperatorVisibilityRanking(obs, rows, Number.POSITIVE_INFINITY),
    [obs, rows],
  )
  const byServices = useMemo(
    () => [...rankingAll].sort((a, b) => b.serviceCount - a.serviceCount || a.operatorDisplay.localeCompare(b.operatorDisplay)),
    [rankingAll],
  )

  const rankHeatAll = useMemo(() => {
    const heat = buildOperatorRankHeatmap(obs, rows)
    const count = new Map(rankingAll.map(r => [r.operator, r.serviceCount]))
    return [...heat].sort(
      (a, b) => (count.get(b.operator) ?? 0) - (count.get(a.operator) ?? 0) || a.operatorDisplay.localeCompare(b.operatorDisplay),
    )
  }, [obs, rows, rankingAll])

  const operatorTotal = rankingAll.length
  const takeFor = <T,>(key: ChartKey, list: T[]) =>
    list.slice(0, resolveOperatorLimit(limits[key], list.length))

  const setChartLimit = (key: ChartKey) => (next: OperatorViewLimit) => {
    setLimits(prev => ({ ...prev, [key]: next }))
  }

  const scopeMeta = (key: ChartKey) => {
    const lim = limits[key]
    return {
      open: lim === 'all' || (typeof lim === 'number' && lim > 10),
      label: lim === 'all' ? 'all operators' : `Top ${lim}`,
      toggle: <OperatorViewToggle value={lim} total={operatorTotal} onChange={setChartLimit(key)} />,
    }
  }

  const avgSrpChart = takeFor('avgSrp', byServices.filter(r => r.medianSrp != null))
  const serviceCountChart = takeFor('serviceCount', byServices)
  const rankHeat = takeFor('rankHeat', rankHeatAll)

  const avgSrpScope = scopeMeta('avgSrp')
  const serviceCountScope = scopeMeta('serviceCount')
  const rankHeatScope = scopeMeta('rankHeat')
  /** Dense/flat cells only for View All — Top 25 keeps Top 10 typography + flip. */
  const rankHeatAllMode = limits.rankHeat === 'all'

  /** Full content height so View All can scroll; never crush hundreds of Y ticks into ~720px. */
  const chartHeight = (count: number) => {
    const row = count > 25 ? 22 : 30
    return Math.max(280, count * row + 24)
  }

  if (!startDate || !endDate) {
    return <div className="srp-viz-empty-block">Apply filters to load SRP analytics.</div>
  }

  return (
    <div className="srp-viz">
      <div className="srp-viz-grid">
        <ChartCard
          className="srp-viz-span-6"
          title="Avg SRP Position"
          description={`Median SRP by operator — ${avgSrpScope.label} by service count (lower SRP is better).`}
          empty={!avgSrpChart.length ? 'No SRP rank data for operators.' : null}
          action={avgSrpScope.toggle}
        >
          <div className={cx('srp-viz-chart-scroll', avgSrpScope.open && 'srp-viz-chart-scroll--open')}>
            <div className="srp-viz-chart srp-viz-chart--ops" style={{ height: chartHeight(avgSrpChart.length) }}>
              <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
                <BarChart data={avgSrpChart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="operatorDisplay" width={128} tick={{ fontSize: 11 }} interval={0} />
                  <Tooltip
                    formatter={(v: number | null, _n, p) => {
                      const row = p?.payload
                      if (v == null || !Number.isFinite(Number(v))) {
                        return ['No SRP', `${row?.serviceCount ?? 0} services`]
                      }
                      return [
                        `#${Number(v).toFixed(1)}`,
                        `Median SRP · ${row?.serviceCount ?? 0} services · Top-10 ${row?.top10?.toFixed?.(1) ?? '—'}%`,
                      ]
                    }}
                  />
                  <Bar dataKey="medianSrp" name="Median SRP" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                    {avgSrpChart.map((r, i) => (
                      <Cell key={r.operator} fill={i === 0 ? '#D4AF37' : FB_BLUE} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-6"
          title="Service Count"
          description={`Services listed per operator — ${serviceCountScope.label} by volume.`}
          empty={!serviceCountChart.length ? 'No operator service counts available.' : null}
          action={serviceCountScope.toggle}
        >
          <div className={cx('srp-viz-chart-scroll', serviceCountScope.open && 'srp-viz-chart-scroll--open')}>
            <div className="srp-viz-chart srp-viz-chart--ops" style={{ height: chartHeight(serviceCountChart.length) }}>
              <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
                <BarChart data={serviceCountChart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="operatorDisplay" width={128} tick={{ fontSize: 11 }} interval={0} />
                  <Tooltip
                    formatter={(v: number, _n, p) => {
                      const row = p?.payload
                      return [
                        Number(v).toLocaleString('en-IN'),
                        `Services · Median SRP ${row?.medianSrp != null ? `#${row.medianSrp.toFixed(1)}` : '—'}`,
                      ]
                    }}
                  />
                  <Bar dataKey="serviceCount" name="Services" fill={FB_BLUE} radius={[0, 6, 6, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-12"
          title="Operator SRP Position"
          description={`SRP rank-band mix — ${rankHeatScope.label} by service count. Click a cell to see the count.`}
          empty={!rankHeat.length ? 'No operator SRP distribution available.' : null}
          action={rankHeatScope.toggle}
        >
          <div
            className={cx(
              'srp-viz-heat-scroll',
              rankHeatScope.open && 'srp-viz-heat-scroll--open',
            )}
          >
            <table
              className={cx('srp-viz-heat', rankHeatAllMode && 'srp-viz-heat--dense')}
            >
              <thead>
                <tr>
                  <th>Operator</th>
                  {SRP_RANK_BANDS.map(b => (
                    <th key={b.id}>{b.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankHeat.map(row => (
                  <tr key={row.operator}>
                    <td className="srp-viz-heat__op" title={row.operatorDisplay}>
                      {row.operatorDisplay}
                    </td>
                    {SRP_RANK_BANDS.map(b => {
                      const pct = row.bands[b.id]
                      const count = row.bandCounts[b.id] ?? 0
                      const cellId = `${row.operator}::${b.id}`
                      const flipped = flippedHeatCell === cellId
                      /* View All only: skip 3D flips — they rupture overflow with hundreds of rows. */
                      if (rankHeatAllMode) {
                        return (
                          <td key={b.id}>
                            <button
                              type="button"
                              className={cx('srp-viz-heat__cell', flipped && 'srp-viz-heat__cell--on')}
                              style={heatBg(pct)}
                              title={flipped ? `${count} listings` : `${pct.toFixed(1)}% · click for count`}
                              aria-pressed={flipped}
                              onClick={() => flipHeatCell(cellId)}
                            >
                              {flipped ? count : pct >= 0.5 ? `${pct.toFixed(0)}%` : '·'}
                            </button>
                          </td>
                        )
                      }
                      return (
                        <td key={b.id}>
                          <button
                            type="button"
                            className={cx('srp-viz-heat__flip', flipped && 'srp-viz-heat__flip--on')}
                            style={heatBg(pct)}
                            title={flipped ? `${count} listings` : `${pct.toFixed(1)}% · click for count`}
                            aria-pressed={flipped}
                            onClick={() => flipHeatCell(cellId)}
                          >
                            <span className="srp-viz-heat__flip-inner">
                              <span className="srp-viz-heat__flip-face srp-viz-heat__flip-face--front">
                                {pct >= 0.5 ? `${pct.toFixed(0)}%` : '·'}
                              </span>
                              <span className="srp-viz-heat__flip-face srp-viz-heat__flip-face--back">
                                {count}
                              </span>
                            </span>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
