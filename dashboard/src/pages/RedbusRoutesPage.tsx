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
  buildRouteLeaderboard,
  buildRouteMatrix,
  buildRoutePageKpis,
  type AnalyticsScope,
} from '../lib/marketplaceAnalytics'
import { formatPeriodDisplay } from '../lib/periodPresets'
import { MARKETPLACE_BRAND } from '../lib/marketplaceConfig'
import { cx } from '../lib/insights'

export default function RedbusRoutesPage() {
  const filters = useMarketplaceFilters()
  const [selectedRouteKey, setSelectedRouteKey] = useState<string | null>(null)

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

  const kpis = useMemo(() => buildRoutePageKpis(scope), [scope])
  const leaderboard = useMemo(() => buildRouteLeaderboard(scope), [scope])
  const matrix = useMemo(() => buildRouteMatrix(scope), [scope])
  const brand = MARKETPLACE_BRAND.redbus

  const selected = leaderboard.find(r => r.routeKey === selectedRouteKey) ?? null

  if (filters.periodRange.emptyReason) {
    return <div className="analytics-empty-state">{filters.periodRange.emptyReason}</div>
  }

  const scatterData = matrix
    .filter(p => p.freshbusAvgSrp != null)
    .map(p => ({
      ...p,
      x: p.activeOperators,
      y: p.freshbusAvgSrp,
      z: Math.max(40, p.freshbusServices * 25),
    }))

  return (
    <div className="analytics-page flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="section-title text-2xl">Route Intelligence</h2>
        <p className="text-sm font-medium text-theme-secondary">
          Compare marketplace structure and FreshBus position across route corridors.
        </p>
        <p className="text-xs font-semibold text-theme-muted">{formatPeriodDisplay(filters.periodRange.endDate)} · {filters.periodRange.label}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard label="Routes" value={kpis.routes} tip="Routes in the selected scope." accent={brand.accent} />
        <KPICard label="Avg Operators / Route" value={kpis.avgOperatorsPerRoute} tip="Average active operators per route." accent={brand.accent} />
        <KPICard label="Avg Services / Route" value={kpis.avgServicesPerRoute} tip="Average active services per route." accent={brand.accent} />
        <KPICard
          label="FreshBus Route Coverage"
          value={`${kpis.freshbusCoverage.covered} / ${kpis.freshbusCoverage.total}`}
          tip="Routes where FreshBus has at least one observed service."
          accent={brand.accent}
        />
      </section>

      <section className="analytics-panel">
        <SectionHeader divider={false} title="Route Leaderboard" subtitle="Click a route for detail." />
        <div className="overflow-x-auto">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th>Route</th>
                <th>Active Operators</th>
                <th>Active Services</th>
                <th>FreshBus Services</th>
                <th>FreshBus Avg SRP</th>
                <th>SRP Change</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map(row => (
                <tr
                  key={row.routeKey}
                  className={cx('cursor-pointer', selectedRouteKey === row.routeKey && 'row-selected')}
                  onClick={() => setSelectedRouteKey(row.routeKey)}
                >
                  <td className="font-semibold">{row.routeLabel}</td>
                  <td>{row.operators}</td>
                  <td>{row.services}</td>
                  <td>{row.freshbusServices}</td>
                  <td>{row.freshbusAvgSrp != null ? `#${row.freshbusAvgSrp}` : '—'}</td>
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
        <SectionHeader divider={false} title="Route Competitive Matrix" subtitle="Competition intensity vs FreshBus visibility. Higher on chart = better rank." />
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid className="chart-grid" />
              <XAxis type="number" dataKey="x" name="Active operators" tick={{ fontSize: 10, fontWeight: 700 }} />
              <YAxis type="number" dataKey="y" name="FreshBus Avg SRP" reversed tick={{ fontSize: 10, fontWeight: 700 }} />
              <ZAxis type="number" dataKey="z" range={[80, 400]} />
              <Tooltip content={<ChartTooltip />} />
              <Scatter data={scatterData} fill={brand.accent}>
                {scatterData.map(entry => (
                  <Cell key={entry.routeKey} fill={brand.accent} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </section>

      {selected ? (
        <section className="analytics-panel">
          <SectionHeader
            divider={false}
            title={selected.routeLabel}
            subtitle={`${selected.operators} operators · ${selected.services} services · ${selected.freshbusServices} FreshBus services`}
          />
          <div className="grid gap-3 sm:grid-cols-4">
            <KPICard label="Active Operators" value={selected.operators} accent={brand.accent} />
            <KPICard label="Active Services" value={selected.services} accent={brand.accent} />
            <KPICard label="FreshBus Services" value={selected.freshbusServices} accent={brand.accent} />
            <KPICard label="FreshBus Avg SRP" value={selected.freshbusAvgSrp != null ? `#${selected.freshbusAvgSrp}` : '—'} accent={brand.accent} />
          </div>
        </section>
      ) : null}
    </div>
  )
}
