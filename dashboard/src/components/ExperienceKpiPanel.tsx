import React, { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { RedbusSrpEntry } from '../api'
import OperatorViewToggle, {
  resolveOperatorLimit,
  type OperatorViewLimit,
} from './OperatorViewToggle'
import { FB_BLUE } from '../lib/playTopics'
import { cx } from '../lib/insights'
import {
  EXPERIENCE_KPIS,
  comboObservations,
  findKpi,
  formatRate,
  kpiCorrelation,
  mentionRate,
  operatorColorMap,
  poolByOperator,
  poolByRoute,
  trendByPeriod,
  type ExperienceKpiId,
} from '../lib/experienceKpiAnalytics'

interface Props {
  rows: RedbusSrpEntry[]
  startDate: string
  endDate: string
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
      <div className="srp-viz-card__body">{empty ? <div className="srp-viz-empty">{empty}</div> : children}</div>
    </section>
  )
}

function KpiPills({
  value,
  onChange,
}: {
  value: ExperienceKpiId
  onChange: (id: ExperienceKpiId) => void
}) {
  return (
    <div className="exp-kpi-pills" role="tablist" aria-label="Experience KPI">
      {EXPERIENCE_KPIS.map(k => (
        <button
          key={k.id}
          type="button"
          role="tab"
          aria-selected={value === k.id}
          className={cx('exp-kpi-pill', value === k.id && 'exp-kpi-pill--on')}
          style={value === k.id ? { borderColor: k.color, color: k.color } : undefined}
          onClick={() => onChange(k.id)}
        >
          {k.label}
        </button>
      ))}
    </div>
  )
}

function heatCell(pct: number | null): React.CSSProperties {
  if (pct == null) return { background: 'transparent', color: 'var(--text-muted)' }
  const t = Math.min(1, Math.max(0, pct / 40))
  return {
    background: `rgba(12, 77, 195, ${0.08 + t * 0.62})`,
    color: t > 0.55 ? '#fff' : 'var(--text-primary)',
    fontWeight: 750,
  }
}

function corrCell(r: number | null): React.CSSProperties {
  if (r == null) return { background: 'transparent', color: 'var(--text-muted)' }
  if (r >= 0) {
    return {
      background: `rgba(12, 77, 195, ${0.08 + r * 0.62})`,
      color: r > 0.45 ? '#fff' : 'var(--text-primary)',
      fontWeight: 750,
    }
  }
  const t = Math.min(1, Math.abs(r))
  return {
    background: `rgba(217, 119, 6, ${0.1 + t * 0.55})`,
    color: t > 0.5 ? '#fff' : 'var(--text-primary)',
    fontWeight: 750,
  }
}

function Tip({ rows }: { rows: { k: string; v: string }[] }) {
  return (
    <div className="srp-viz-tip">
      {rows.map(r => (
        <p key={r.k}>
          <span className="srp-viz-tip__title">{r.k}</span> {r.v}
        </p>
      ))}
    </div>
  )
}

export default function ExperienceKpiPanel({ rows, startDate, endDate }: Props) {
  const [cmpLimit, setCmpLimit] = useState<OperatorViewLimit>(10)
  const [opLimit, setOpLimit] = useState<OperatorViewLimit>(10)
  const [routeLimit, setRouteLimit] = useState<OperatorViewLimit>(10)
  const [heatLimit, setHeatLimit] = useState<OperatorViewLimit>(10)
  const [scatterLimit, setScatterLimit] = useState<OperatorViewLimit>(25)
  const [trendOpLimit, setTrendOpLimit] = useState<OperatorViewLimit>(10)

  const [kpiOcc, setKpiOcc] = useState<ExperienceKpiId>('punctuality')
  const [kpiRating, setKpiRating] = useState<ExperienceKpiId>('punctuality')
  const [kpiByOp, setKpiByOp] = useState<ExperienceKpiId>('punctuality')
  const [kpiByRoute, setKpiByRoute] = useState<ExperienceKpiId>('punctuality')
  const [kpiTrend, setKpiTrend] = useState<ExperienceKpiId>('punctuality')
  const [kpiTimeOp, setKpiTimeOp] = useState<ExperienceKpiId>('cleanliness')
  const [kpiPrice, setKpiPrice] = useState<ExperienceKpiId>('punctuality')
  const [kpiSrp, setKpiSrp] = useState<ExperienceKpiId>('punctuality')
  const [kpiVol, setKpiVol] = useState<ExperienceKpiId>('punctuality')
  const [kpiSvc, setKpiSvc] = useState<ExperienceKpiId>('punctuality')

  const operators = useMemo(() => poolByOperator(rows), [rows])
  const routes = useMemo(() => poolByRoute(rows), [rows])
  const combos = useMemo(() => comboObservations(rows), [rows])
  const colors = useMemo(() => operatorColorMap(operators), [operators])
  const corr = useMemo(() => kpiCorrelation(combos), [combos])

  const takeOps = <T,>(list: T[], limit: OperatorViewLimit) =>
    list.slice(0, resolveOperatorLimit(limit, list.length))

  const cmpOps = takeOps(operators, cmpLimit)
  const comparisonData = EXPERIENCE_KPIS.map(kpi => {
    const row: Record<string, string | number> = { kpi: kpi.label }
    for (const op of cmpOps) {
      const rate = mentionRate(op.pools[kpi.id])
      if (rate != null) row[op.operator] = Number(rate.toFixed(2))
    }
    return row
  })

  const opChart = takeOps(operators, opLimit)
    .map(op => ({
      name: op.operatorDisplay,
      operator: op.operator,
      rate: mentionRate(op.pools[kpiByOp]),
      n: op.pools[kpiByOp].ratings,
      services: op.serviceCount,
      fill: colors.get(op.operator) || FB_BLUE,
    }))
    .filter(r => r.rate != null)

  const routeChart = takeOps(routes, routeLimit)
    .map(r => ({
      name: r.route,
      rate: mentionRate(r.pools[kpiByRoute]),
      n: r.pools[kpiByRoute].ratings,
      services: r.serviceCount,
    }))
    .filter(r => r.rate != null)

  const heatRows = takeOps(combos, heatLimit)
  const scatterN = (limit: OperatorViewLimit) => takeOps(combos, limit)

  const scatterPts = (
    kpi: ExperienceKpiId,
    x: (c: (typeof combos)[0]) => number | null,
    limit: OperatorViewLimit,
  ) =>
    scatterN(limit)
      .map(c => {
        const rate = c.kpis[kpi]
        const xv = x(c)
        if (rate == null || xv == null || !Number.isFinite(xv)) return null
        return { ...c, rate, x: xv }
      })
      .filter((v): v is NonNullable<typeof v> => v != null)

  const ratingPts = scatterPts(kpiRating, c => c.avgRating, scatterLimit)
  const occPts = scatterPts(kpiOcc, c => c.occupancy, scatterLimit)
  const pricePts = scatterPts(kpiPrice, c => c.avgPrice, scatterLimit)
  const srpPts = scatterPts(kpiSrp, c => c.avgSrp, scatterLimit)
  const volPts = scatterPts(kpiVol, c => (c.pools[kpiVol]?.ratings ?? null), scatterLimit)
  const svcPts = scatterPts(kpiSvc, c => c.serviceCount, scatterLimit)

  const trendKpi = findKpi(kpiTrend)
  const timeKpi = findKpi(kpiTimeOp)
  const trendRows = useMemo(
    () => (startDate && endDate ? trendByPeriod(rows, startDate, endDate, trendKpi) : []),
    [rows, startDate, endDate, trendKpi],
  )
  const timeOpRows = useMemo(
    () => (startDate && endDate ? trendByPeriod(rows, startDate, endDate, timeKpi) : []),
    [rows, startDate, endDate, timeKpi],
  )
  const trendOps = takeOps(operators, trendOpLimit)
  const timeOps = takeOps(operators, trendOpLimit)

  const trendLineData = trendRows.map(p => ({ period: p.label, Market: p.market }))
  const timeOpData = timeOpRows.map(p => {
    const row: Record<string, string | number | null> = { period: p.label }
    for (const op of timeOps) {
      row[op.operatorDisplay] = p.byOperator[op.operator]
    }
    return row
  })

  const barH = (n: number) => Math.min(720, Math.max(280, n * 32 + 24))
  const cmpH = Math.min(720, Math.max(360, 8 * (18 + cmpOps.length * 9)))

  if (!rows.length) return null

  return (
    <section className="srp-listings-panel exp-kpi-panel">
      <div className="srp-listings-panel__head">
        <div>
          <h3 className="srp-listings-panel__title">Experience KPI analytics</h3>
          <p className="srp-listings-panel__sub">
            Customer Mention Rate (%) = eligible mentions ÷ eligible ratings × 100. Not a quality
            score. Buses need 100+ ratings; mentions cannot exceed ratings; missing tags are omitted
            (not 0%). Date ranges use pooled mentions ÷ pooled ratings.
          </p>
        </div>
        <span className="srp-listings-count">
          <strong>8</strong> Experience KPIs
        </span>
      </div>

      <div className="srp-viz exp-kpi-viz">
        <div className="srp-viz-grid">
        <ChartCard
          className="srp-viz-span-12"
          title="KPI performance comparison"
          description="Grouped bars: Customer Mention Rate (%) for each Experience KPI across Top operators (by service count)."
          empty={!cmpOps.length ? 'No eligible operators for Experience KPIs.' : null}
          action={<OperatorViewToggle value={cmpLimit} total={operators.length} onChange={setCmpLimit} />}
        >
          <div className={cx('srp-viz-chart-scroll', (cmpLimit === 'all' || cmpLimit === 25) && 'srp-viz-chart-scroll--open')}>
            <div className="srp-viz-chart srp-viz-chart--ops" style={{ height: cmpH }}>
              <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
                <BarChart data={comparisonData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    unit="%"
                    label={{ value: 'Customer Mention Rate (%)', position: 'insideBottom', offset: -2, fontSize: 11 }}
                  />
                  <YAxis type="category" dataKey="kpi" width={128} tick={{ fontSize: 11 }} interval={0} />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      Number.isFinite(Number(v)) ? `${Number(v).toFixed(1)}%` : '—',
                      operators.find(o => o.operator === name)?.operatorDisplay ?? name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {cmpOps.map(op => (
                    <Bar
                      key={op.operator}
                      dataKey={op.operator}
                      name={op.operatorDisplay}
                      fill={colors.get(op.operator)}
                      radius={[0, 5, 5, 0]}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-6"
          title="Experience KPI vs customer rating"
          description={`${findKpi(kpiRating).label} Customer Mention Rate (%) vs average customer rating. Each point is operator × route.`}
          empty={!ratingPts.length ? 'Not enough eligible operator × route points.' : null}
          action={
            <div className="exp-kpi-actions">
              <KpiPills value={kpiRating} onChange={setKpiRating} />
              <OperatorViewToggle value={scatterLimit} total={combos.length} onChange={setScatterLimit} />
            </div>
          }
        >
          <div className="srp-viz-chart srp-viz-chart--tall">
            <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
              <ScatterChart margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="rate"
                  name="Customer Mention Rate"
                  unit="%"
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Customer Mention Rate (%)', position: 'insideBottom', offset: -2, fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="x"
                  name="Avg rating"
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11 }}
                  width={42}
                  label={{ value: 'Average customer rating', angle: -90, position: 'insideLeft', fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload
                    if (!active || !p) return null
                    return (
                      <Tip
                        rows={[
                          { k: 'Operator', v: p.operatorDisplay },
                          { k: 'Route', v: p.route },
                          { k: 'Experience KPI', v: findKpi(kpiRating).label },
                          { k: 'Customer Mention Rate', v: formatRate(p.rate) },
                          { k: 'Rating', v: p.x?.toFixed?.(2) ?? '—' },
                        ]}
                      />
                    )
                  }}
                />
                <Scatter data={ratingPts} isAnimationActive={false}>
                  {ratingPts.map(p => (
                    <Cell key={p.key} fill={p.freshbus ? '#D4AF37' : FB_BLUE} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-6"
          title="Experience KPI vs occupancy"
          description={`${findKpi(kpiOcc).label} Customer Mention Rate (%) vs occupancy (%). Each point is operator × route.`}
          empty={!occPts.length ? 'Not enough eligible operator × route points with occupancy.' : null}
          action={
            <div className="exp-kpi-actions">
              <KpiPills value={kpiOcc} onChange={setKpiOcc} />
              <OperatorViewToggle value={scatterLimit} total={combos.length} onChange={setScatterLimit} />
            </div>
          }
        >
          <div className="srp-viz-chart srp-viz-chart--tall">
            <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
              <ScatterChart margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="rate" unit="%" tick={{ fontSize: 11 }} name="Customer Mention Rate" />
                <YAxis type="number" dataKey="x" unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} width={42} name="Occupancy" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload
                    if (!active || !p) return null
                    return (
                      <Tip
                        rows={[
                          { k: 'Operator', v: p.operatorDisplay },
                          { k: 'Route', v: p.route },
                          { k: 'Experience KPI', v: findKpi(kpiOcc).label },
                          { k: 'Customer Mention Rate', v: formatRate(p.rate) },
                          { k: 'Occupancy', v: formatRate(p.x) },
                        ]}
                      />
                    )
                  }}
                />
                <Scatter data={occPts} isAnimationActive={false}>
                  {occPts.map(p => (
                    <Cell key={p.key} fill={p.freshbus ? '#D4AF37' : FB_BLUE} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-6"
          title="Experience KPI by operator"
          description={`${findKpi(kpiByOp).label} Customer Mention Rate (%) by operator.`}
          empty={!opChart.length ? 'No eligible operator mention rates for this KPI.' : null}
          action={
            <div className="exp-kpi-actions">
              <KpiPills value={kpiByOp} onChange={setKpiByOp} />
              <OperatorViewToggle value={opLimit} total={operators.length} onChange={setOpLimit} />
            </div>
          }
        >
          <div className="srp-viz-chart srp-viz-chart--ops" style={{ height: barH(opChart.length) }}>
            <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
              <BarChart data={opChart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={128} tick={{ fontSize: 11 }} interval={0} />
                <Tooltip
                  formatter={(v: number, _n, item) => {
                    const row = item?.payload
                    return [`${Number(v).toFixed(1)}%`, `${row?.services ?? 0} services · ${row?.n ?? 0} eligible ratings`]
                  }}
                />
                <Bar dataKey="rate" name="Customer Mention Rate" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                  {opChart.map(r => (
                    <Cell key={r.operator} fill={r.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-6"
          title="Experience KPI by route"
          description={`${findKpi(kpiByRoute).label} Customer Mention Rate (%) by route.`}
          empty={!routeChart.length ? 'No eligible route mention rates for this KPI.' : null}
          action={
            <div className="exp-kpi-actions">
              <KpiPills value={kpiByRoute} onChange={setKpiByRoute} />
              <OperatorViewToggle value={routeLimit} total={routes.length} onChange={setRouteLimit} />
            </div>
          }
        >
          <div className="srp-viz-chart srp-viz-chart--ops" style={{ height: barH(routeChart.length) }}>
            <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
              <BarChart data={routeChart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} interval={0} />
                <Tooltip
                  formatter={(v: number, _n, item) => {
                    const row = item?.payload
                    return [`${Number(v).toFixed(1)}%`, `${row?.services ?? 0} services · ${row?.n ?? 0} eligible ratings`]
                  }}
                />
                <Bar dataKey="rate" name="Customer Mention Rate" fill={findKpi(kpiByRoute).color} radius={[0, 6, 6, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-12"
          title="Operator × route Experience heatmap"
          description="Customer Mention Rate (%) for all 8 Experience KPIs. Blank cells have no eligible data (not 0%)."
          empty={!heatRows.length ? 'No operator × route combinations with eligible Experience KPIs.' : null}
          action={<OperatorViewToggle value={heatLimit} total={combos.length} onChange={setHeatLimit} />}
        >
          <div className="srp-viz-heat-scroll exp-kpi-heat-scroll">
            <table className="srp-viz-heat exp-kpi-heat">
              <thead>
                <tr>
                  <th>Operator × route</th>
                  {EXPERIENCE_KPIS.map(k => (
                    <th key={k.id}>{k.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatRows.map(row => (
                  <tr key={row.key}>
                    <td className="srp-viz-heat__op" title={`${row.operatorDisplay} · ${row.route}`}>
                      <span className={cx(row.freshbus && 'exp-kpi-heat__fb')}>{row.operatorDisplay}</span>
                      <span className="exp-kpi-heat__route">{row.route}</span>
                    </td>
                    {EXPERIENCE_KPIS.map(k => {
                      const pct = row.kpis[k.id] ?? null
                      return (
                        <td key={k.id}>
                          <div
                            className="srp-viz-heat__cell"
                            style={heatCell(pct)}
                            title={pct == null ? 'No eligible data' : `${k.label}: ${pct.toFixed(1)}%`}
                          >
                            {pct == null ? '' : `${pct.toFixed(0)}%`}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-6"
          title="Experience KPI trend"
          description={`${trendKpi.label} market Customer Mention Rate (%) over the selected period (pooled, not averaged daily %).`}
          empty={!trendLineData.some(d => d.Market != null) ? 'Not enough dated snapshots for a trend.' : null}
          action={<KpiPills value={kpiTrend} onChange={setKpiTrend} />}
        >
          <div className="srp-viz-chart srp-viz-chart--tall">
            <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
              <LineChart data={trendLineData} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} width={42} />
                <Tooltip formatter={(v: number) => [`${Number(v).toFixed(1)}%`, 'Market']} />
                <Line
                  type="monotone"
                  dataKey="Market"
                  stroke={trendKpi.color}
                  strokeWidth={2.4}
                  dot={{ r: 3 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-6"
          title="Experience KPI × time × operator"
          description={`${timeKpi.label} Customer Mention Rate (%) by operator over time.`}
          empty={!timeOpData.length ? 'Not enough dated snapshots for operator series.' : null}
          action={
            <div className="exp-kpi-actions">
              <KpiPills value={kpiTimeOp} onChange={setKpiTimeOp} />
              <OperatorViewToggle value={trendOpLimit} total={operators.length} onChange={setTrendOpLimit} />
            </div>
          }
        >
          <div className="srp-viz-chart srp-viz-chart--tall">
            <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
              <LineChart data={timeOpData} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} width={42} />
                <Tooltip formatter={(v: number, name: string) => [`${Number(v).toFixed(1)}%`, name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {timeOps.map(op => (
                  <Line
                    key={op.operator}
                    type="monotone"
                    dataKey={op.operatorDisplay}
                    stroke={colors.get(op.operator)}
                    strokeWidth={op.freshbus ? 2.6 : 1.8}
                    dot={{ r: 2 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-12"
          title="Experience KPI relationship matrix"
          description="Pearson correlation of Customer Mention Rates across operator × route observations. Needs 4+ paired points. Diagonal is 1.00."
          empty={combos.length < 4 ? 'Need more operator × route observations to correlate KPIs.' : null}
        >
          <div className="srp-viz-heat-scroll">
            <table className="srp-viz-heat exp-kpi-heat">
              <thead>
                <tr>
                  <th />
                  {EXPERIENCE_KPIS.map(k => (
                    <th key={k.id}>{k.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EXPERIENCE_KPIS.map((rowK, i) => (
                  <tr key={rowK.id}>
                    <td className="srp-viz-heat__op">{rowK.label}</td>
                    {EXPERIENCE_KPIS.map((colK, j) => {
                      const r = corr[i][j]
                      return (
                        <td key={colK.id}>
                          <div
                            className="srp-viz-heat__cell"
                            style={corrCell(r)}
                            title={r == null ? 'Insufficient paired data' : `${rowK.label} × ${colK.label}: ${r.toFixed(2)}`}
                          >
                            {r == null ? '' : r.toFixed(2)}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-6"
          title="Experience KPI vs price"
          description={`${findKpi(kpiPrice).label} Customer Mention Rate (%) vs average price (₹). Each point is operator × route.`}
          empty={!pricePts.length ? 'Not enough priced operator × route points.' : null}
          action={
            <div className="exp-kpi-actions">
              <KpiPills value={kpiPrice} onChange={setKpiPrice} />
              <OperatorViewToggle value={scatterLimit} total={combos.length} onChange={setScatterLimit} />
            </div>
          }
        >
          <div className="srp-viz-chart srp-viz-chart--tall">
            <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
              <ScatterChart margin={{ top: 12, right: 12, left: 8, bottom: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => `₹${Number(v).toLocaleString('en-IN')}`}
                  name="Average price"
                />
                <YAxis type="number" dataKey="rate" unit="%" tick={{ fontSize: 11 }} width={42} name="Customer Mention Rate" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload
                    if (!active || !p) return null
                    return (
                      <Tip
                        rows={[
                          { k: 'Operator', v: p.operatorDisplay },
                          { k: 'Route', v: p.route },
                          { k: 'Experience KPI', v: findKpi(kpiPrice).label },
                          { k: 'Customer Mention Rate', v: formatRate(p.rate) },
                          { k: 'Avg price', v: `₹${Math.round(p.x).toLocaleString('en-IN')}` },
                        ]}
                      />
                    )
                  }}
                />
                <Scatter data={pricePts} isAnimationActive={false}>
                  {pricePts.map(p => (
                    <Cell key={p.key} fill={p.freshbus ? '#D4AF37' : FB_BLUE} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-6"
          title="Experience KPI vs SRP position"
          description={`${findKpi(kpiSrp).label} Customer Mention Rate (%) vs average SRP rank (lower is better). Each point is operator × route.`}
          empty={!srpPts.length ? 'Not enough SRP operator × route points.' : null}
          action={
            <div className="exp-kpi-actions">
              <KpiPills value={kpiSrp} onChange={setKpiSrp} />
              <OperatorViewToggle value={scatterLimit} total={combos.length} onChange={setScatterLimit} />
            </div>
          }
        >
          <div className="srp-viz-chart srp-viz-chart--tall">
            <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
              <ScatterChart margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" tick={{ fontSize: 11 }} name="SRP position" reversed />
                <YAxis type="number" dataKey="rate" unit="%" tick={{ fontSize: 11 }} width={42} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload
                    if (!active || !p) return null
                    return (
                      <Tip
                        rows={[
                          { k: 'Operator', v: p.operatorDisplay },
                          { k: 'Route', v: p.route },
                          { k: 'Experience KPI', v: findKpi(kpiSrp).label },
                          { k: 'Customer Mention Rate', v: formatRate(p.rate) },
                          { k: 'Avg SRP', v: `#${Number(p.x).toFixed(1)}` },
                        ]}
                      />
                    )
                  }}
                />
                <Scatter data={srpPts} isAnimationActive={false}>
                  {srpPts.map(p => (
                    <Cell key={p.key} fill={p.freshbus ? '#D4AF37' : FB_BLUE} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-6"
          title="Experience KPI vs rating volume"
          description={`${findKpi(kpiVol).label} Customer Mention Rate (%) vs eligible rating volume. Each point is operator × route.`}
          empty={!volPts.length ? 'Not enough rating-volume points.' : null}
          action={
            <div className="exp-kpi-actions">
              <KpiPills value={kpiVol} onChange={setKpiVol} />
              <OperatorViewToggle value={scatterLimit} total={combos.length} onChange={setScatterLimit} />
            </div>
          }
        >
          <div className="srp-viz-chart srp-viz-chart--tall">
            <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
              <ScatterChart margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" tick={{ fontSize: 11 }} name="Rating volume" />
                <YAxis type="number" dataKey="rate" unit="%" tick={{ fontSize: 11 }} width={42} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload
                    if (!active || !p) return null
                    return (
                      <Tip
                        rows={[
                          { k: 'Operator', v: p.operatorDisplay },
                          { k: 'Route', v: p.route },
                          { k: 'Experience KPI', v: findKpi(kpiVol).label },
                          { k: 'Customer Mention Rate', v: formatRate(p.rate) },
                          { k: 'Rating volume', v: Number(p.x).toLocaleString('en-IN') },
                        ]}
                      />
                    )
                  }}
                />
                <Scatter data={volPts} isAnimationActive={false}>
                  {volPts.map(p => (
                    <Cell key={p.key} fill={p.freshbus ? '#D4AF37' : FB_BLUE} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-6"
          title="Experience KPI vs service count"
          description={`${findKpi(kpiSvc).label} Customer Mention Rate (%) vs service count. Each point is operator × route.`}
          empty={!svcPts.length ? 'Not enough service-count points.' : null}
          action={
            <div className="exp-kpi-actions">
              <KpiPills value={kpiSvc} onChange={setKpiSvc} />
              <OperatorViewToggle value={scatterLimit} total={combos.length} onChange={setScatterLimit} />
            </div>
          }
        >
          <div className="srp-viz-chart srp-viz-chart--tall">
            <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
              <ScatterChart margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" tick={{ fontSize: 11 }} allowDecimals={false} name="Service count" />
                <YAxis type="number" dataKey="rate" unit="%" tick={{ fontSize: 11 }} width={42} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload
                    if (!active || !p) return null
                    return (
                      <Tip
                        rows={[
                          { k: 'Operator', v: p.operatorDisplay },
                          { k: 'Route', v: p.route },
                          { k: 'Experience KPI', v: findKpi(kpiSvc).label },
                          { k: 'Customer Mention Rate', v: formatRate(p.rate) },
                          { k: 'Service count', v: String(p.x) },
                        ]}
                      />
                    )
                  }}
                />
                <Scatter data={svcPts} isAnimationActive={false}>
                  {svcPts.map(p => (
                    <Cell key={p.key} fill={p.freshbus ? '#D4AF37' : FB_BLUE} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        </div>
      </div>

      <p className="exp-kpi-footnote">
        Gold points / bars = FreshBus. Top 10 / Top 25 / View All ranks operators, routes, and
        operator×route rows by service count. Market trend pools eligible mentions and ratings among
        services that appeared in each period.
      </p>
    </section>
  )
}
