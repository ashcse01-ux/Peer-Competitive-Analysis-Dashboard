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
import { MapPin, Trophy, TrendingUp } from 'lucide-react'
import ChartTooltip from './ChartTooltip'
import CompetitiveScatter from './CompetitiveScatter'
import HeatmapCell from './HeatmapCell'
import KPICard from './KPICard'
import RouteInsightStrip from './RouteInsightStrip'
import SectionHeader from './SectionHeader'
import TrackedPeerCards from './TrackedPeerCards'
import { useMarketplaceFilters } from '../context/MarketplaceFilterContext'
import {
  MARKETPLACE_BRAND,
  MARKETPLACE_TAG_LABELS,
  MARKETPLACE_TAG_IDS,
  displayOperatorName,
  isFreshBus,
  isTrackedPeer,
  type MarketplaceId,
} from '../lib/marketplaceConfig'
import {
  buildAllRouteSummaries,
  buildRouteKpis,
  freshbusRankTrend,
  networkFreshbusStats,
  type OperatorKpiRow,
} from '../lib/marketplaceMockData'
import { cx, formatMetric } from '../lib/insights'
import { FB_YELLOW } from '../lib/playTopics'

interface Props {
  marketplace: MarketplaceId
}

function filterRows(rows: OperatorKpiRow[], selected: string[]) {
  if (!selected.length) return []
  const set = new Set(selected)
  return rows.filter(r => set.has(r.name))
}

export default function MarketplaceKpiDashboard({ marketplace }: Props) {
  const brand = MARKETPLACE_BRAND[marketplace]
  const {
    selectedRoutes,
    selectedOperators,
    periodRange,
    selectedRouteKeys,
  } = useMarketplaceFilters()

  const summaries = useMemo(() => {
    const all = buildAllRouteSummaries(marketplace)
    return all.filter(s => selectedRouteKeys.includes(s.route.key))
  }, [marketplace, selectedRouteKeys])

  const network = useMemo(() => networkFreshbusStats(summaries), [summaries])

  const primaryRoute = selectedRoutes[0]
  const routeOperators = useMemo(() => {
    const set = new Set<string>()
    selectedRoutes.forEach(r => r.operators.forEach(o => set.add(o)))
    return [...set]
  }, [selectedRoutes])

  const allRouteRows = useMemo(
    () => (primaryRoute ? buildRouteKpis(marketplace, primaryRoute) : []),
    [marketplace, primaryRoute],
  )

  const visibleRows = useMemo(
    () => filterRows(allRouteRows, selectedOperators),
    [allRouteRows, selectedOperators],
  )

  const trend = useMemo(
    () => freshbusRankTrend(marketplace, primaryRoute?.key ?? ''),
    [marketplace, primaryRoute?.key],
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <KPICard
          label="Routes in scope"
          value={String(selectedRoutes.length)}
          caption={periodRange.label}
          icon={<MapPin size={20} />}
          accent={brand.accent}
        />
        <KPICard
          label="FreshBus network rank"
          value={network.avgRank != null ? `#${formatMetric(network.avgRank, 1)}` : '—'}
          caption={`Across ${summaries.length} selected route(s)`}
          icon={<Trophy size={20} />}
          accent={brand.accent}
        />
        <KPICard
          label="Route leadership"
          value={String(network.leads)}
          caption={`${network.topThreeShare}% of routes in top 3`}
          icon={<TrendingUp size={20} />}
          accent={FB_YELLOW}
        />
      </div>

      <TrackedPeerCards routeOperators={routeOperators} kpiRows={allRouteRows} />

      {primaryRoute ? (
        <RouteInsightStrip routeLabel={primaryRoute.label} rows={allRouteRows} accent={brand.accent} />
      ) : null}

      {selectedOperators.length === 0 ? (
        <div className="liquid-glass rounded-2xl p-8 text-center text-sm font-semibold text-theme-muted">
          Select at least one operator using the filter bar above.
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="liquid-glass rounded-2xl p-8 text-center text-sm font-semibold text-theme-muted">
          No operators match on {primaryRoute?.label ?? 'this route'}.
        </div>
      ) : (
        <>
          <section className="liquid-glass chart-panel panel-shell overflow-hidden">
            <SectionHeader
              eyebrow="Scorecard"
              title={`${primaryRoute?.label ?? 'Route'} — operator metrics`}
              subtitle={
                selectedRoutes.length > 1
                  ? `Detail for first selected route · ${selectedRoutes.length} routes in filter · ${periodRange.label}`
                  : `${periodRange.label} · ranks reflect full route`
              }
            />
            <div className="visual-body overflow-x-auto">
              <table className="data-table min-w-[980px]">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Operator</th>
                    <th>Rating</th>
                    <th>Reviews</th>
                    <th>Tag composite</th>
                    <th>Sentiment</th>
                    <th>Visibility</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(row => (
                    <tr
                      key={row.slug}
                      className={cx(
                        isFreshBus(row.name) && 'bg-amber-500/5',
                        isTrackedPeer(row.name) && !isFreshBus(row.name) && 'bg-blue-500/[0.03]',
                      )}
                    >
                      <td className="font-extrabold tabular-nums" style={{ color: brand.accent }}>#{row.competitiveRank}</td>
                      <td className="font-bold">{displayOperatorName(row.name)}</td>
                      <td className="font-extrabold tabular-nums">{formatMetric(row.overallRating, 2)}</td>
                      <td className="tabular-nums">{row.reviewCount.toLocaleString()}</td>
                      <td className="tabular-nums">{formatMetric(row.compositeTagScore, 2)}</td>
                      <td className="tabular-nums">{formatMetric(row.sentiment, 2)}</td>
                      <td className="tabular-nums">{row.visibilityScore}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="liquid-glass chart-panel panel-shell overflow-hidden">
              <SectionHeader
                eyebrow="Review dimensions"
                title="Tag heatmap"
                subtitle="Nine scraped review tags for selected operators."
              />
              <div className="visual-body overflow-x-auto">
                <table className="data-table min-w-[1100px]">
                  <thead>
                    <tr>
                      <th>Operator</th>
                      {MARKETPLACE_TAG_IDS.map(tag => (
                        <th key={tag} className="text-[0.65rem]">{MARKETPLACE_TAG_LABELS[tag]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(row => (
                      <tr key={row.slug}>
                        <td className="font-bold">{displayOperatorName(row.name)}</td>
                        {MARKETPLACE_TAG_IDS.map(tag => (
                          <td key={tag}>
                            <HeatmapCell value={row.tags[tag]} min={3} max={5} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <CompetitiveScatter rows={visibleRows} />
          </div>

          <section className="liquid-glass chart-panel panel-shell">
            <SectionHeader
              eyebrow="Snapshot time (scrape windows)"
              title="FreshBus SRP rank by scrape window"
              subtitle="05:00 · 11:00 · 17:00 · 23:00 IST — not bus departure times. Uses latest period context."
            />
            <div className="visual-body h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid className="chart-grid" vertical={false} />
                  <XAxis dataKey="slot" tick={{ fontSize: 11, fontWeight: 700 }} />
                  <YAxis reversed domain={[1, 15]} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="rank" name="FreshBus rank" stroke={brand.accent} strokeWidth={3} dot={{ r: 4, fill: FB_YELLOW }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
