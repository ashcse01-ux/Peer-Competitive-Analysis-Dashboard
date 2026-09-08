import React, { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import type { RedbusSrpEntry } from '../api'
import {
  buildDepartureOccupancyHeatmap,
  buildOperatorPriceOccupancy,
  buildOperatorPricePositioning,
  buildOperatorRankHeatmap,
  buildOperatorVisibilityRanking,
  computeKpis,
  expandObservations,
  formatInr,
  formatPct1,
  formatRating1,
  priceOccupancyMedians,
  SRP_RANK_BANDS,
} from '../lib/srpVizAnalytics'
import { type BusTypeBucket, type RatingBucket } from '../lib/srpFilters'
import { cx } from '../lib/insights'
import { FB_BLUE } from '../lib/playTopics'
import OperatorViewToggle, {
  resolveOperatorLimit,
  type OperatorViewLimit,
} from './OperatorViewToggle'
import { Bus, IndianRupee, Percent, Star, Eye, Users } from 'lucide-react'

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

function KpiCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: string
  icon: React.ReactNode
  accent?: string
}) {
  return (
    <div className="srp-viz-kpi" style={{ ['--kpi-accent' as string]: accent || FB_BLUE }}>
      <div className="srp-viz-kpi__top">
        <p className="srp-viz-kpi__label">{label}</p>
        <span className="srp-viz-kpi__icon" aria-hidden>
          {icon}
        </span>
      </div>
      <p className="srp-viz-kpi__value">{value}</p>
    </div>
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

function occHeatBg(pct: number | null): React.CSSProperties {
  if (pct == null) return { background: 'transparent' }
  const t = Math.min(1, Math.max(0, pct / 100))
  const r = Math.round(245 + (12 - 245) * t)
  const g = Math.round(158 + (77 - 158) * t)
  const b = Math.round(11 + (195 - 11) * t)
  return {
    background: `rgba(${r}, ${g}, ${b}, ${0.15 + t * 0.55})`,
    color: t > 0.55 ? '#0f1d35' : 'var(--text-primary)',
    fontWeight: 750,
  }
}

export default function SrpAnalyticsPanel({
  rows,
  startDate,
  endDate,
}: Props) {
  type ChartKey = 'avgSrp' | 'serviceCount' | 'rankHeat' | 'visibility' | 'priceOcc' | 'pricePos'

  const [limits, setLimits] = useState<Record<ChartKey, OperatorViewLimit>>({
    avgSrp: 10,
    serviceCount: 10,
    rankHeat: 10,
    visibility: 10,
    priceOcc: 10,
    pricePos: 10,
  })

  const setChartLimit = (key: ChartKey) => (next: OperatorViewLimit) => {
    setLimits(prev => ({ ...prev, [key]: next }))
  }

  const obs = useMemo(() => expandObservations(rows, startDate, endDate), [rows, startDate, endDate])
  const kpis = useMemo(() => computeKpis(rows, obs), [rows, obs])

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

  const pricePosAll = useMemo(() => buildOperatorPricePositioning(rows), [rows])
  const priceOccAll = useMemo(() => buildOperatorPriceOccupancy(rows), [rows])
  const depHeat = useMemo(() => buildDepartureOccupancyHeatmap(obs), [obs])
  const priceOccGuides = useMemo(() => priceOccupancyMedians(priceOccAll), [priceOccAll])

  const operatorTotal = rankingAll.length
  const takeFor = <T,>(key: ChartKey, list: T[]) =>
    list.slice(0, resolveOperatorLimit(limits[key], list.length))

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
  const rankingBars = takeFor('visibility', byServices)
  const rankHeat = takeFor('rankHeat', rankHeatAll)
  const pricePos = takeFor('pricePos', pricePosAll)
  const priceOcc = takeFor('priceOcc', priceOccAll)
  const maxPrice = useMemo(
    () => Math.max(...pricePosAll.map(r => r.max ?? 0), 1),
    [pricePosAll],
  )

  const avgSrpScope = scopeMeta('avgSrp')
  const serviceCountScope = scopeMeta('serviceCount')
  const rankHeatScope = scopeMeta('rankHeat')
  const visibilityScope = scopeMeta('visibility')
  const priceOccScope = scopeMeta('priceOcc')
  const pricePosScope = scopeMeta('pricePos')

  const chartHeight = (count: number) => Math.max(280, count * 30 + 16)

  if (!startDate || !endDate) {
    return <div className="srp-viz-empty-block">Apply filters to load SRP analytics.</div>
  }

  return (
    <div className="srp-viz">
      <div className="srp-viz-kpis">
        <KpiCard
          label="Total Services"
          value={kpis.totalServices.toLocaleString('en-IN')}
          icon={<Bus size={16} strokeWidth={2.4} />}
          accent="#0c4dc3"
        />
        <KpiCard
          label="Median Price"
          value={formatInr(kpis.medianPrice)}
          icon={<IndianRupee size={16} strokeWidth={2.4} />}
          accent="#0a3fa0"
        />
        <KpiCard
          label="Avg Occupancy"
          value={formatPct1(kpis.avgOccupancy)}
          icon={<Percent size={16} strokeWidth={2.4} />}
          accent="#0369a1"
        />
        <KpiCard
          label="Market Rating"
          value={kpis.weightedRating != null ? `${formatRating1(kpis.weightedRating)} ★` : '—'}
          icon={<Star size={16} strokeWidth={2.4} />}
          accent="#ca8a04"
        />
        <KpiCard
          label="Top-10 Visibility"
          value={formatPct1(kpis.top10Visibility)}
          icon={<Eye size={16} strokeWidth={2.4} />}
          accent="#1d4ed8"
        />
        <KpiCard
          label="Active Operators"
          value={kpis.activeOperators.toLocaleString('en-IN')}
          icon={<Users size={16} strokeWidth={2.4} />}
          accent="#4338ca"
        />
      </div>

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
              <ResponsiveContainer width="100%" height="100%">
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
                  <Bar dataKey="medianSrp" name="Median SRP" radius={[0, 6, 6, 0]}>
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
              <ResponsiveContainer width="100%" height="100%">
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
                  <Bar dataKey="serviceCount" name="Services" fill={FB_BLUE} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-7"
          title="Operator SRP Position"
          description={`SRP rank-band mix — ${rankHeatScope.label} by service count.`}
          empty={!rankHeat.length ? 'No operator SRP distribution available.' : null}
          action={rankHeatScope.toggle}
        >
          <div className={cx('srp-viz-heat-scroll', rankHeatScope.open && 'srp-viz-heat-scroll--open')}>
            <table className="srp-viz-heat">
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
                    <td className="srp-viz-heat__op">{row.operatorDisplay}</td>
                    {SRP_RANK_BANDS.map(b => {
                      const pct = row.bands[b.id]
                      return (
                        <td key={b.id}>
                          <div className="srp-viz-heat__cell" style={heatBg(pct)} title={`${pct.toFixed(1)}%`}>
                            {pct >= 0.5 ? `${pct.toFixed(0)}%` : '·'}
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
          className="srp-viz-span-5"
          title="Operator SRP Visibility"
          description={`Share of services in Top-10 SRP — ${visibilityScope.label} by service count.`}
          empty={!rankingBars.length ? 'No operators to rank for Top-10 visibility.' : null}
          action={visibilityScope.toggle}
        >
          <div className={cx('srp-viz-chart-scroll', visibilityScope.open && 'srp-viz-chart-scroll--open')}>
            <div className="srp-viz-chart srp-viz-chart--ops" style={{ height: chartHeight(rankingBars.length) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankingBars} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <YAxis type="category" dataKey="operatorDisplay" width={128} tick={{ fontSize: 11 }} interval={0} />
                  <Tooltip
                    formatter={(v: number, _n, p) => {
                      const row = p?.payload
                      return [
                        `${v.toFixed(1)}%`,
                        `Top-10 · ${row?.serviceCount ?? 0} services · Median SRP ${
                          row?.medianSrp != null ? `#${row.medianSrp.toFixed(1)}` : '—'
                        }`,
                      ]
                    }}
                  />
                  <Bar dataKey="top10" name="Top-10 visibility" radius={[0, 6, 6, 0]}>
                    {rankingBars.map((r, i) => (
                      <Cell key={r.operator} fill={i === 0 ? '#D4AF37' : FB_BLUE} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-7"
          title="Price vs Occupancy"
          description={`Each bubble = one operator (median price × avg occupancy). Bubble size = service count. Dashed lines = market medians — ${priceOccScope.label} by services.`}
          empty={!priceOcc.length ? 'Not enough operators with both price and occupancy.' : null}
          action={priceOccScope.toggle}
        >
          <div className="srp-viz-chart srp-viz-chart--tall">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="price"
                  name="Median price"
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => `₹${Number(v).toLocaleString('en-IN')}`}
                />
                <YAxis
                  type="number"
                  dataKey="occupancy"
                  name="Avg occupancy"
                  unit="%"
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  width={42}
                />
                <ZAxis type="number" dataKey="serviceCount" range={[60, 280]} />
                {priceOccGuides.medianPrice != null ? (
                  <ReferenceLine
                    x={priceOccGuides.medianPrice}
                    stroke="var(--text-muted)"
                    strokeDasharray="4 4"
                    label={{ value: 'Med price', position: 'insideTopRight', fontSize: 10, fill: 'var(--text-muted)' }}
                  />
                ) : null}
                {priceOccGuides.medianOcc != null ? (
                  <ReferenceLine
                    y={priceOccGuides.medianOcc}
                    stroke="var(--text-muted)"
                    strokeDasharray="4 4"
                    label={{ value: 'Med occ', position: 'insideTopLeft', fontSize: 10, fill: 'var(--text-muted)' }}
                  />
                ) : null}
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const p = payload[0].payload
                    const mp = priceOccGuides.medianPrice
                    const mo = priceOccGuides.medianOcc
                    let quadrant = ''
                    if (mp != null && mo != null) {
                      const hiP = p.price >= mp
                      const hiO = p.occupancy >= mo
                      if (hiP && hiO) quadrant = 'Premium + filling'
                      else if (!hiP && hiO) quadrant = 'Value + filling'
                      else if (hiP && !hiO) quadrant = 'Premium + soft fill'
                      else quadrant = 'Value + soft fill'
                    }
                    return (
                      <div className="srp-viz-tip">
                        <p className="srp-viz-tip__title">{p.operatorDisplay}</p>
                        <p>Median price {formatInr(p.price)}</p>
                        <p>Avg occupancy {formatPct1(p.occupancy)}</p>
                        <p>{p.serviceCount} services</p>
                        {quadrant ? <p className="srp-viz-tip__title">{quadrant}</p> : null}
                      </div>
                    )
                  }}
                />
                <Scatter name="Operators" data={priceOcc} fillOpacity={0.85}>
                  {priceOcc.map(r => (
                    <Cell key={r.operator} fill={r.freshbus ? '#D4AF37' : FB_BLUE} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="srp-viz-quad-legend">
            <span>Gold = FreshBus</span>
            <span>Larger bubble = more services</span>
            <span>Above/right of dashed lines = above market median</span>
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-5"
          title="Operator Price Positioning"
          description={`P25 · Median · P75 price band — ${pricePosScope.label} by priced service count.`}
          empty={!pricePos.length ? 'Not enough priced services for operator positioning.' : null}
          action={pricePosScope.toggle}
        >
          <div className={cx('srp-viz-price-list', pricePosScope.open && 'srp-viz-price-list--open')}>
            {pricePos.map(r => {
              const left = ((r.p25 ?? 0) / maxPrice) * 100
              const width = Math.max((((r.p75 ?? 0) - (r.p25 ?? 0)) / maxPrice) * 100, 1.5)
              const mid = ((r.median ?? 0) / maxPrice) * 100
              return (
                <div
                  key={r.operator}
                  className="srp-viz-price-row"
                  title={`P25 ${formatInr(r.p25)} · Median ${formatInr(r.median)} · P75 ${formatInr(r.p75)} · n=${r.n}`}
                >
                  <span className="srp-viz-price-row__name">
                    {r.operatorDisplay}
                    <span className="srp-viz-price-row__n">{r.n}</span>
                  </span>
                  <div className="srp-viz-price-row__track">
                    <span className="srp-viz-price-row__iqr" style={{ left: `${left}%`, width: `${width}%` }} />
                    <span className="srp-viz-price-row__median" style={{ left: `${mid}%` }} />
                  </div>
                  <span className="srp-viz-price-row__val tabular-nums">{formatInr(r.median)}</span>
                </div>
              )
            })}
          </div>
        </ChartCard>

        <ChartCard
          className="srp-viz-span-12"
          title="Departure Window Occupancy"
          description="Median observed occupancy by departure window and day of week."
          empty={!depHeat.enoughData ? 'Not enough observations for a reliable departure-window view.' : null}
        >
          <div className="srp-viz-heat-scroll">
            <table className="srp-viz-heat srp-viz-heat--dow">
              <thead>
                <tr>
                  <th>Day</th>
                  {depHeat.buckets.map(b => (
                    <th key={b.id}>{b.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {depHeat.days.map(dow => (
                  <tr key={dow}>
                    <td className="srp-viz-heat__op">{dow}</td>
                    {depHeat.buckets.map(b => {
                      const cell = depHeat.cells.find(c => c.dow === dow && c.bucketId === b.id)
                      const occ = cell?.occupancy ?? null
                      return (
                        <td key={b.id}>
                          <div
                            className="srp-viz-heat__cell"
                            style={occHeatBg(occ)}
                            title={
                              occ == null
                                ? 'No data'
                                : `${dow} ${b.label}: ${occ.toFixed(1)}% · ${cell?.n ?? 0} services`
                            }
                          >
                            {occ == null ? '' : `${occ.toFixed(0)}%`}
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
      </div>
    </div>
  )
}
