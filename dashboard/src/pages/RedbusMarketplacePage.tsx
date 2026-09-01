import React, { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  Cell,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react'
import ChartTooltip from '../components/ChartTooltip'
import KPICard from '../components/KPICard'
import SectionHeader from '../components/SectionHeader'
import { useMarketplaceFilters } from '../context/MarketplaceFilterContext'
import {
  buildMarketplacePulse,
  buildMarketplaceTrend,
  buildRouteCompetitionHeatmap,
  buildRouteLeaderboard,
  buildWhatChanged,
  type AnalyticsScope,
  type TrendMetric,
} from '../lib/marketplaceAnalytics'
import { comparisonUnavailableMessage, formatPeriodDisplay } from '../lib/periodPresets'
import { MARKETPLACE_BRAND } from '../lib/marketplaceConfig'
import { cx } from '../lib/insights'

const TREND_OPTIONS: { id: TrendMetric; label: string }[] = [
  { id: 'avg_srp', label: 'Average SRP Rank' },
  { id: 'avg_fare', label: 'Average Fare' },
  { id: 'active_services', label: 'Active Services' },
  { id: 'active_operators', label: 'Active Operators' },
]

function formatRankDelta(positions: number | null) {
  if (positions == null) return null
  if (positions === 0) return 'No change vs previous period'
  const better = positions > 0
  return `${better ? '↑' : '↓'} ${Math.abs(positions)} positions ${better ? 'better' : 'worse'}`
}

export default function RedbusMarketplacePage() {
  const filters = useMarketplaceFilters()
  const [trendMetric, setTrendMetric] = React.useState<TrendMetric>('avg_srp')

  const scope: AnalyticsScope = useMemo(
    () => ({
      marketplace: 'redbus',
      routes: filters.selectedRoutes,
      operators: filters.selectedOperators,
      periodRange: filters.periodRange,
      snapshot: filters.snapshot,
      compareEnabled: filters.compare === 'previous_period',
    }),
    [filters],
  )

  const pulse = useMemo(() => buildMarketplacePulse(scope), [scope])
  const trend = useMemo(() => buildMarketplaceTrend(scope, trendMetric), [scope, trendMetric])
  const heatmap = useMemo(() => buildRouteCompetitionHeatmap(scope), [scope])
  const insights = useMemo(() => buildWhatChanged(scope), [scope])
  const leaderboard = useMemo(() => buildRouteLeaderboard(scope), [scope])
  const brand = MARKETPLACE_BRAND.redbus

  if (filters.periodRange.emptyReason) {
    return (
      <div className="analytics-empty-state">{filters.periodRange.emptyReason}</div>
    )
  }

  const maxOps = Math.max(1, ...heatmap.flatMap(r => r.cells.map(c => c.operators)))

  return (
    <div className="analytics-page flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="section-title text-2xl">Marketplace</h2>
        <p className="text-sm font-medium text-theme-secondary">
          Understand marketplace scale, competition and FreshBus position.
        </p>
        <p className="text-xs font-semibold text-theme-muted">
          {formatPeriodDisplay(filters.periodRange.endDate)} · {filters.periodRange.label}
          {filters.snapshot !== 'all' ? ` · ${filters.snapshot} snapshot` : ' · latest snapshot'}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KPICard
          label="Active Services"
          value={pulse.activeServices}
          caption={pulse.context.scale}
          tip="Number of distinct services observed in the latest completed snapshot."
          accent={brand.accent}
        />
        <KPICard
          label="Operators"
          value={pulse.activeOperators}
          caption={pulse.context.scale}
          tip="Number of distinct operators with at least one observed service in the latest snapshot."
          accent={brand.accent}
        />
        <KPICard
          label="Routes"
          value={pulse.activeRoutes}
          caption={pulse.context.scale}
          tip="Number of distinct routes with at least one observed service in the latest snapshot."
          accent={brand.accent}
        />
        <KPICard
          label="Avg SRP Rank"
          value={pulse.avgSrpRank != null ? `#${pulse.avgSrpRank}` : '—'}
          caption={
            pulse.comparisons.avgSrp.unavailable
              ? comparisonUnavailableMessage()
              : formatRankDelta(pulse.comparisons.avgSrp.positionsBetter) ?? pulse.context.srp
          }
          tip="Average search rank across observed FreshBus service snapshots. Lower rank is better."
          accent={brand.accent}
        />
        <KPICard
          label="Top-10 Services"
          value={pulse.top10Services}
          caption={pulse.context.srp}
          tip="Distinct FreshBus services with average SRP rank of 10 or better in the selected period."
          accent={brand.accent}
        />
        <KPICard
          label="Avg Fare"
          value={pulse.avgFare != null ? `₹${pulse.avgFare.toLocaleString('en-IN')}` : '—'}
          caption={
            pulse.comparisons.avgFare.pct != null
              ? `${pulse.comparisons.avgFare.pct > 0 ? '↑' : '↓'} ${Math.abs(pulse.comparisons.avgFare.pct)}% vs previous period`
              : pulse.context.fare
          }
          tip="Average displayed fare across observed FreshBus services in the selected period."
          accent={brand.accent}
        />
      </section>

      <section className="analytics-panel">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <SectionHeader divider={false} title="Marketplace Trend" subtitle="One metric at a time — how the marketplace is moving." />
          <label className="flex items-center gap-2 text-xs font-bold text-theme-secondary">
            Metric
            <select
              value={trendMetric}
              onChange={e => setTrendMetric(e.target.value as TrendMetric)}
              className="filter-chip-trigger filter-chip-trigger--select"
            >
              {TREND_OPTIONS.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid className="chart-grid" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700 }} />
              <YAxis
                reversed={trendMetric === 'avg_srp'}
                tick={{ fontSize: 11, fontWeight: 700 }}
                label={{
                  value: trendMetric === 'avg_srp' ? 'Average SRP Rank (#)' : trendMetric === 'avg_fare' ? 'Average fare (₹)' : trendMetric === 'active_services' ? 'Active services' : 'Active operators',
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="value" stroke={brand.accent} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="analytics-panel">
        <SectionHeader divider={false} title="Route Competition" subtitle="Active operators per route and snapshot slot — higher count means stronger competition." />
        <div className="overflow-x-auto">
          <table className="data-table min-w-[640px]">
            <thead>
              <tr>
                <th className="text-left">Route</th>
                {['05:00', '11:00', '17:00', '23:00'].map(slot => (
                  <th key={slot} className="text-center">{slot}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.map(row => (
                <tr key={row.routeKey}>
                  <td className="font-semibold whitespace-nowrap">{row.routeLabel}</td>
                  {row.cells.map(cell => {
                    const intensity = cell.operators / maxOps
                    return (
                      <td key={cell.slot} className="text-center">
                        <span
                          className="inline-flex min-w-[2.5rem] justify-center rounded-md px-2 py-1 text-xs font-bold tabular-nums"
                          style={{
                            background: `rgba(100, 116, 139, ${0.08 + intensity * 0.35})`,
                          }}
                          title={`${row.routeLabel}\n${cell.slot} IST\n${cell.operators} active operators\n${cell.services} active services`}
                        >
                          {cell.operators}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {insights.length ? (
        <section className="analytics-panel">
          <SectionHeader divider={false} title="What Changed" subtitle="Deterministic movements vs the previous comparable period." />
          <ul className="space-y-2">
            {insights.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm font-semibold text-theme-primary">
                {item.direction === 'up' ? (
                  <TrendingUp size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                ) : item.direction === 'down' ? (
                  <TrendingDown size={16} className="mt-0.5 shrink-0 text-rose-600" />
                ) : null}
                {item.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="analytics-panel">
        <SectionHeader divider={false} title="Route Leaderboard" subtitle="Sorted by FreshBus average SRP — lower is better." />
        <div className="overflow-x-auto">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th>Route</th>
                <th>Operators</th>
                <th>Services</th>
                <th>FreshBus Services</th>
                <th>FreshBus Avg SRP</th>
                <th>SRP Change</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map(row => (
                <tr key={row.routeKey}>
                  <td className="font-semibold">{row.routeLabel}</td>
                  <td>{row.operators}</td>
                  <td>{row.services}</td>
                  <td>{row.freshbusServices}</td>
                  <td>{row.freshbusAvgSrp != null ? `#${row.freshbusAvgSrp}` : '—'}</td>
                  <td>
                    {row.srpChange.positionsBetter != null ? (
                      <span className={cx('inline-flex items-center gap-1', row.srpChange.positionsBetter > 0 ? 'text-emerald-700' : row.srpChange.positionsBetter < 0 ? 'text-rose-700' : 'text-theme-muted')}>
                        {row.srpChange.positionsBetter > 0 ? <ArrowUpRight size={14} /> : row.srpChange.positionsBetter < 0 ? <ArrowDownRight size={14} /> : null}
                        {formatRankDelta(row.srpChange.positionsBetter)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
