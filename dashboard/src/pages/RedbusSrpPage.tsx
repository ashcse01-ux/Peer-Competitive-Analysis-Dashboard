import React, { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import MarketplaceSrpDashboard from '../components/MarketplaceSrpDashboard'
import ChartTooltip from '../components/ChartTooltip'
import KPICard from '../components/KPICard'
import SectionHeader from '../components/SectionHeader'
import { useMarketplaceFilters } from '../context/MarketplaceFilterContext'
import {
  buildIntradayGrid,
  buildMarketplaceTrend,
  buildSrpBandDistribution,
  buildSrpStability,
  buildSrpSummary,
  type AnalyticsScope,
} from '../lib/marketplaceAnalytics'
import { formatPeriodDisplay } from '../lib/periodPresets'
import { MARKETPLACE_BRAND } from '../lib/marketplaceConfig'
import { SRP_SLOT_KEYS } from '../lib/srpAnalytics'

function BandBar({ dist }: { dist: ReturnType<typeof buildSrpBandDistribution> }) {
  const total = dist.total || 1
  const segments = [
    { key: 'top10', label: 'Top 10', count: dist.top10, className: 'srp-band--top10' },
    { key: '11-30', label: '11–30', count: dist.band11_30, className: 'srp-band--mid' },
    { key: '31-100', label: '31–100', count: dist.band31_100, className: 'srp-band--amber' },
    { key: '100+', label: '100+', count: dist.band100plus, className: 'srp-band--low' },
  ]
  return (
    <div className="srp-band-bar" role="img" aria-label="SRP rank distribution">
      {segments.map(seg => (
        <div
          key={seg.key}
          className={`srp-band-segment ${seg.className}`}
          style={{ width: `${(seg.count / total) * 100}%` }}
          title={`${seg.label}: ${seg.count} services (${Math.round((seg.count / total) * 100)}%)`}
        >
          {seg.count > 0 ? seg.label : null}
        </div>
      ))}
    </div>
  )
}

export default function RedbusSrpPage() {
  const filters = useMarketplaceFilters()
  const brand = MARKETPLACE_BRAND.redbus

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

  const summary = useMemo(() => buildSrpSummary(scope), [scope])
  const trend = useMemo(() => buildMarketplaceTrend(scope, 'avg_srp'), [scope])
  const bands = useMemo(() => buildSrpBandDistribution(scope, true), [scope])
  const stability = useMemo(() => buildSrpStability(scope), [scope])
  const intraday = useMemo(() => buildIntradayGrid(scope), [scope])

  if (filters.periodRange.emptyReason) {
    return <div className="analytics-empty-state">{filters.periodRange.emptyReason}</div>
  }

  return (
    <div className="analytics-page flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="section-title text-2xl">SRP Tracker</h2>
        <p className="text-sm font-medium text-theme-secondary">Search rank performance at service level.</p>
        <p className="text-xs font-semibold text-theme-muted">{formatPeriodDisplay(filters.periodRange.endDate)} · {filters.periodRange.label}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard label="Avg SRP Rank" value={summary.avgSrp != null ? `#${summary.avgSrp}` : '—'} tip="Average FreshBus SRP in scope. Lower is better." accent={brand.accent} />
        <KPICard label="Top-10 Services" value={summary.top10} tip="Services with average rank ≤ 10." accent={brand.accent} />
        <KPICard label="Top-30 Services" value={summary.top30} tip="Services with average rank ≤ 30." accent={brand.accent} />
        <KPICard label="100+ Services" value={summary.band100plus} tip="Services with average rank above 100." accent={brand.accent} />
      </section>

      <section className="analytics-panel">
        <SectionHeader divider={false} title="SRP Rank Movement" subtitle="FreshBus aggregate — inverted axis (#1 at top)." />
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid className="chart-grid" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700 }} />
              <YAxis reversed tick={{ fontSize: 11, fontWeight: 700 }} label={{ value: 'Average SRP Rank (#)', angle: -90, position: 'insideLeft', fontSize: 10, fontWeight: 700 }} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="value" stroke={brand.accent} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="analytics-panel">
        <SectionHeader divider={false} title="SRP Rank Distribution" subtitle="Share of FreshBus services in each visibility band." />
        <BandBar dist={bands} />
        <p className="mt-2 text-xs font-semibold text-theme-muted">
          Top 10: {bands.top10} · 11–30: {bands.band11_30} · 31–100: {bands.band31_100} · 100+: {bands.band100plus}
        </p>
      </section>

      <section className="analytics-panel">
        <SectionHeader divider={false} title="SRP Rank Stability" subtitle="Volatility = standard deviation of observed ranks." />
        <div className="overflow-x-auto">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th>Service</th>
                <th>Avg SRP</th>
                <th>Best Rank</th>
                <th>Worst Rank</th>
                <th>Rank Volatility</th>
                <th>Top-10 Days</th>
              </tr>
            </thead>
            <tbody>
              {stability.map(row => (
                <tr key={row.serviceId}>
                  <td>
                    <div className="font-semibold">{row.serviceLabel}</div>
                    <div className="text-xs text-theme-muted">{row.routeLabel}</div>
                  </td>
                  <td>{row.avgSrp != null ? `#${row.avgSrp}` : '—'}</td>
                  <td>{row.bestRank ?? '—'}</td>
                  <td>{row.worstRank ?? '—'}</td>
                  <td title={row.stdDev != null ? `σ = ${row.stdDev}` : undefined}>{row.volatility}</td>
                  <td>{row.top10Days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="analytics-panel">
        <SectionHeader divider={false} title="Intraday SRP Movement" subtitle="Rank by snapshot slot for the latest day in scope." />
        <div className="overflow-x-auto">
          <table className="data-table min-w-[640px]">
            <thead>
              <tr>
                <th>Service</th>
                {SRP_SLOT_KEYS.map(slot => (
                  <th key={slot} className="text-center">{slot}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {intraday.map((row, i) => (
                <tr key={`${row.serviceLabel}-${i}`}>
                  <td>
                    <div className="font-semibold">{row.serviceLabel}</div>
                    <div className="text-xs text-theme-muted">{row.routeLabel}</div>
                  </td>
                  {SRP_SLOT_KEYS.map(slot => (
                    <td key={slot} className="text-center tabular-nums">
                      {row.slots[slot] != null ? row.slots[slot] : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <MarketplaceSrpDashboard marketplace="redbus" embedded />
    </div>
  )
}
