import React, { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import ChartTooltip from '../components/ChartTooltip'
import KPICard from '../components/KPICard'
import SectionHeader from '../components/SectionHeader'
import { useMarketplaceFilters } from '../context/MarketplaceFilterContext'
import {
  buildOperatorLeaderboard,
  buildOperatorMatrix,
  type AnalyticsScope,
} from '../lib/marketplaceAnalytics'
import { formatPeriodDisplay } from '../lib/periodPresets'
import { MARKETPLACE_BRAND } from '../lib/marketplaceConfig'
import { cx } from '../lib/insights'

export default function RedbusOperatorsPage() {
  const filters = useMarketplaceFilters()
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null)

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

  const leaderboard = useMemo(() => buildOperatorLeaderboard(scope), [scope])
  const matrix = useMemo(() => buildOperatorMatrix(scope), [scope])
  const brand = MARKETPLACE_BRAND.redbus
  const selected = leaderboard.find(o => o.operatorId === selectedOperatorId) ?? null

  if (filters.periodRange.emptyReason) {
    return <div className="analytics-empty-state">{filters.periodRange.emptyReason}</div>
  }

  const scatterData = matrix
    .filter(p => p.avgSrp != null && p.medianFare != null)
    .map(p => ({
      ...p,
      x: p.medianFare,
      y: p.avgSrp,
      z: Math.max(50, p.activeServices * 20),
      fill: p.isFreshBus ? '#FFEA20' : brand.accent,
    }))

  return (
    <div className="analytics-page flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="section-title text-2xl">Operator Intelligence</h2>
        <p className="text-sm font-medium text-theme-secondary">
          Compare operator scale, visibility and pricing across the marketplace.
        </p>
        <p className="text-xs font-semibold text-theme-muted">{formatPeriodDisplay(filters.periodRange.endDate)} · {filters.periodRange.label}</p>
      </header>

      <section className="analytics-panel">
        <SectionHeader divider={false} title="Operator Leaderboard" subtitle="FreshBus pinned first. Sorted by average SRP." />
        <div className="overflow-x-auto">
          <table className="data-table min-w-[780px]">
            <thead>
              <tr>
                <th>Operator</th>
                <th>Routes</th>
                <th>Services</th>
                <th>Avg SRP</th>
                <th>Top-10 Services</th>
                <th>Avg Fare</th>
                <th>SRP Change</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map(row => (
                <tr
                  key={row.operatorId}
                  className={cx(
                    'cursor-pointer',
                    row.isFreshBus && 'freshbus-row',
                    selectedOperatorId === row.operatorId && 'row-selected',
                  )}
                  onClick={() => setSelectedOperatorId(row.operatorId)}
                >
                  <td className={cx('font-semibold', row.isFreshBus && 'text-theme-primary')}>{row.operatorName}</td>
                  <td>{row.routes}</td>
                  <td>{row.services}</td>
                  <td>{row.avgSrp != null ? `#${row.avgSrp}` : '—'}</td>
                  <td>{row.top10Services}</td>
                  <td>{row.avgFare != null ? `₹${Math.round(row.avgFare).toLocaleString('en-IN')}` : '—'}</td>
                  <td>
                    {row.srpChange.positionsBetter != null
                      ? `${row.srpChange.positionsBetter > 0 ? '↑' : row.srpChange.positionsBetter < 0 ? '↓' : ''} ${Math.abs(row.srpChange.positionsBetter)} positions ${row.srpChange.positionsBetter >= 0 ? 'better' : 'worse'}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="analytics-panel">
        <SectionHeader divider={false} title="Operator Competitive Positioning" subtitle="Visibility vs median displayed fare." />
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid className="chart-grid" />
              <XAxis type="number" dataKey="x" name="Median fare (₹)" tick={{ fontSize: 10, fontWeight: 700 }} />
              <YAxis type="number" dataKey="y" name="Avg SRP" reversed tick={{ fontSize: 10, fontWeight: 700 }} />
              <ZAxis type="number" dataKey="z" range={[60, 420]} />
              <Tooltip content={<ChartTooltip />} />
              <Scatter data={scatterData}>
                {scatterData.map(entry => (
                  <Cell key={entry.operatorName} fill={entry.fill} stroke={entry.isFreshBus ? '#0f1d35' : 'transparent'} strokeWidth={2} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </section>

      {selected ? (
        <section className="analytics-panel">
          <SectionHeader divider={false} title={selected.operatorName} subtitle="Operator detail for selected period." />
          <div className="grid gap-3 sm:grid-cols-5">
            <KPICard label="Routes" value={selected.routes} accent={brand.accent} />
            <KPICard label="Services" value={selected.services} accent={brand.accent} />
            <KPICard label="Avg SRP" value={selected.avgSrp != null ? `#${selected.avgSrp}` : '—'} accent={brand.accent} />
            <KPICard label="Top-10 Services" value={selected.top10Services} accent={brand.accent} />
            <KPICard label="Median Fare" value={selected.avgFare != null ? `₹${Math.round(selected.avgFare).toLocaleString('en-IN')}` : '—'} accent={brand.accent} />
          </div>
        </section>
      ) : null}
    </div>
  )
}
