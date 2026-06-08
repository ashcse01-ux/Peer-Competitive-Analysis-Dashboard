import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, Gauge, Layers3, Map as MapIcon, Sparkles, Target, Trophy, X } from 'lucide-react'
import { useRedbus, useRedbusRoute, type RedbusCell } from '../api'
import ChartTooltip from '../components/ChartTooltip'
import HeatmapCell from '../components/HeatmapCell'
import KPICard from '../components/KPICard'
import { useDashboardStore } from '../store'
import {
  operatorColor,
  average,
  cx,
  formatCompact,
  formatMetric,
  getInitials,
  rankTone,
  sum,
} from '../lib/insights'

type SortKey = 'route' | 'rank' | 'sentiment'

function rankClass(rank: number | null | undefined) {
  const tone = rankTone(rank)
  if (tone === 'good') return 'bg-emerald-50 text-emerald-700'
  if (tone === 'watch') return 'bg-amber-50 text-amber-700'
  if (tone === 'risk') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-500'
}

function routeLabel(origin: string, destination: string) {
  return `${origin} -> ${destination}`
}

export default function RedbusPage() {
  const { data, isLoading, isError } = useRedbus()
  const { activeRouteFilter, setActiveRouteFilter } = useDashboardStore()
  const [drillRouteId, setDrillRouteId] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const { data: drillData } = useRedbusRoute(drillRouteId ?? 0)

  const cells = data?.data ?? []

  const { routes, operators } = useMemo(() => {
    const routeMap = new Map<number, { id: number; origin: string; destination: string }>()
    const operatorMap = new Map<number, { id: number; name: string; slug: string }>()

    cells.forEach(cell => {
      routeMap.set(cell.route_id, { id: cell.route_id, origin: cell.origin, destination: cell.destination })
      operatorMap.set(cell.operator_id, { id: cell.operator_id, name: cell.operator_name, slug: cell.operator_slug })
    })

    return {
      routes: [...routeMap.values()].sort((a, b) => routeLabel(a.origin, a.destination).localeCompare(routeLabel(b.origin, b.destination))),
      operators: [...operatorMap.values()].map((operator) => ({
        ...operator,
        color: operatorColor(operator.slug),
      })),
    }
  }, [cells])

  if (isLoading) return <div className="glass-panel p-6 text-sm font-semibold text-slate-500">Loading Redbus route metrics...</div>
  if (isError) return <div className="glass-panel p-6 text-sm font-semibold text-rose-600">Redbus route data could not be loaded.</div>

  const displayRoutes = activeRouteFilter
    ? routes.filter(route => route.id === activeRouteFilter)
    : routes

  const freshbus = operators.find(operator => operator.slug === 'freshbus' || operator.name.toLowerCase().includes('fresh'))
  const freshbusCells = cells.filter(cell => cell.operator_id === freshbus?.id && cell.sentiment_score != null)
  const totalReviews = sum(cells.map(cell => cell.review_count))
  const avgSentiment = average(cells.map(cell => cell.sentiment_score))
  const coveragePct = cells.length
    ? Math.round((cells.filter(cell => cell.sentiment_score != null).length / cells.length) * 100)
    : 0
  const topTwoShare = freshbusCells.length
    ? Math.round((freshbusCells.filter(cell => (cell.competitive_rank ?? 99) <= 2).length / freshbusCells.length) * 100)
    : null

  const operatorScores = operators.map(operator => {
    const rows = cells.filter(cell => cell.operator_id === operator.id && cell.sentiment_score != null)
    return {
      ...operator,
      avgSentiment: average(rows.map(row => row.sentiment_score)),
      avgRank: average(rows.map(row => row.competitive_rank)),
      coverage: rows.length,
    }
  })

  const sentimentLeader = [...operatorScores].sort((a, b) => (b.avgSentiment ?? -2) - (a.avgSentiment ?? -2))[0]

  const routeRows = routes.map(route => {
    const routeCells = cells.filter(cell => cell.route_id === route.id)
    const scoredCells = routeCells.filter(cell => cell.sentiment_score != null)
    const leader = [...scoredCells].sort((a, b) => (b.sentiment_score ?? -2) - (a.sentiment_score ?? -2))[0]
    const freshCell = routeCells.find(cell => cell.operator_id === freshbus?.id)
    const gap = leader?.sentiment_score != null && freshCell?.sentiment_score != null
      ? leader.sentiment_score - freshCell.sentiment_score
      : null
    return {
      route_id: route.id,
      origin: route.origin,
      destination: route.destination,
      label: routeLabel(route.origin, route.destination),
      freshRank: freshCell?.competitive_rank ?? null,
      freshSentiment: freshCell?.sentiment_score ?? null,
      leaderName: leader?.operator_name ?? 'No data',
      leaderSentiment: leader?.sentiment_score ?? null,
      reviewCount: sum(routeCells.map(cell => cell.review_count)),
      gap,
    }
  })

  const sortedRouteRows = [...routeRows].sort((a, b) => {
    if (sortKey === 'rank') return (a.freshRank ?? 99) - (b.freshRank ?? 99)
    if (sortKey === 'sentiment') return (b.freshSentiment ?? -2) - (a.freshSentiment ?? -2)
    return a.label.localeCompare(b.label)
  })

  const barData = displayRoutes.map(route => {
    const entry: Record<string, string | number | null> = {
      name: `${route.origin.slice(0, 3)}-${route.destination.slice(0, 3)}`,
    }
    operators.forEach(operator => {
      const cell = cells.find(item => item.route_id === route.id && item.operator_id === operator.id)
      entry[operator.name] = cell?.sentiment_score ?? null
    })
    return entry
  })

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <p className="eyebrow">Redbus route analysis</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#14211f] sm:text-5xl">
            Route-level sentiment, review volume, rank pressure, and FreshBus gaps.
          </h1>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Link to="/review-tags" className="control-chip inline-flex h-10 items-center gap-2 px-4 text-sm font-bold">
          <Sparkles size={16} />
          Review Tags
        </Link>
        <div className="glass-panel p-3">
          <label className="mb-1 block text-xs font-black uppercase tracking-wide text-theme-muted">Route direction</label>
          <select
            className="h-10 max-w-full rounded-full border border-slate-900/10 bg-white/80 px-3 text-sm font-bold text-[#14211f] outline-none transition focus:border-[#0077b6]"
            value={activeRouteFilter ?? ''}
            onChange={event => {
              const value = event.target.value
              setActiveRouteFilter(value === '' ? null : Number(value))
            }}
          >
            <option value="">All directions</option>
            {routes.map(route => (
              <option key={route.id} value={route.id}>{routeLabel(route.origin, route.destination)}</option>
            ))}
          </select>
        </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard label="Tracked Routes" value={routes.length} caption={`${coveragePct}% score coverage`} icon={<MapIcon size={20} />} accent="#0077b6" />
        <KPICard label="Total Reviews" value={formatCompact(totalReviews)} caption="Route review volume" icon={<Layers3 size={20} />} accent="#00a676" />
        <KPICard label="Avg Sentiment" value={formatMetric(avgSentiment, 2)} caption="All route cells" icon={<Gauge size={20} />} accent="#ffb000" />
        <KPICard label="FreshBus Top-2" value={topTwoShare != null ? topTwoShare : null} unit={topTwoShare != null ? '%' : ''} caption="Routes with rank 1 or 2" icon={<Trophy size={20} />} accent="#f45d48" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.74fr)]">
        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="eyebrow">Sentiment heatmap</p>
              <h2 className="section-title">Route by operator score</h2>
            </div>
            <span className="text-xs font-bold text-slate-500">Click any score for route drill-down</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[780px] space-y-2">
              <div className="grid items-center gap-2" style={{ gridTemplateColumns: `210px repeat(${operators.length}, minmax(68px, 1fr))` }}>
                <span />
                {operators.map(operator => (
                  <span key={operator.id} className="truncate text-center text-[0.68rem] font-black uppercase tracking-wide text-slate-400">{operator.name}</span>
                ))}
              </div>
              {displayRoutes.map(route => (
                <div key={route.id} className="grid items-center gap-2" style={{ gridTemplateColumns: `210px repeat(${operators.length}, minmax(68px, 1fr))` }}>
                  <span className="truncate text-xs font-black text-slate-600">{routeLabel(route.origin, route.destination)}</span>
                  {operators.map(operator => {
                    const cell = cells.find(item => item.route_id === route.id && item.operator_id === operator.id)
                    return (
                      <HeatmapCell
                        key={operator.id}
                        value={cell?.sentiment_score ?? null}
                        width={68}
                        height={30}
                        showValue
                        label={`${operator.name} ${routeLabel(route.origin, route.destination)}`}
                        onClick={() => setDrillRouteId(route.id)}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4">
            <p className="eyebrow">Operator route strength</p>
            <h2 className="section-title">Average sentiment and rank</h2>
          </div>
          <div className="space-y-3">
            {operatorScores.map(operator => {
              const width = operator.avgSentiment == null ? 0 : Math.max(4, ((operator.avgSentiment + 1) / 2) * 100)
              return (
                <div key={operator.id} className="border-b border-slate-900/10 pb-3 last:border-b-0 last:pb-0">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ backgroundColor: operator.color }}>
                        {getInitials(operator.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[#14211f]">{operator.name}</p>
                        <p className="text-xs font-bold text-slate-500">{operator.coverage} scored routes</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-900/5 px-2.5 py-1 text-xs font-black text-slate-600">
                      Avg rank {formatMetric(operator.avgRank, 1)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-900/5">
                    <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: operator.color }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4">
            <p className="eyebrow text-emerald-700">Route sentiment leader</p>
            <p className="mt-1 text-xl font-black text-[#14211f]">{sentimentLeader?.name ?? 'No data'}</p>
            <p className="mt-1 text-sm font-bold text-emerald-700">{formatMetric(sentimentLeader?.avgSentiment, 2)} average route sentiment</p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4">
            <p className="eyebrow">Volume heatmap</p>
            <h2 className="section-title">Review density by route</h2>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[780px] space-y-2">
              <div className="grid items-center gap-2" style={{ gridTemplateColumns: `210px repeat(${operators.length}, minmax(68px, 1fr))` }}>
                <span />
                {operators.map(operator => (
                  <span key={operator.id} className="truncate text-center text-[0.68rem] font-black uppercase tracking-wide text-slate-400">{operator.name}</span>
                ))}
              </div>
              {displayRoutes.map(route => {
                const counts = operators.map(operator =>
                  cells.find(cell => cell.route_id === route.id && cell.operator_id === operator.id)?.review_count ?? null
                )
                const maxCount = Math.max(...counts.filter((value): value is number => value != null), 1)
                return (
                  <div key={route.id} className="grid items-center gap-2" style={{ gridTemplateColumns: `210px repeat(${operators.length}, minmax(68px, 1fr))` }}>
                    <span className="truncate text-xs font-black text-slate-600">{routeLabel(route.origin, route.destination)}</span>
                    {counts.map((count, index) => (
                      <HeatmapCell
                        key={`${route.id}-${operators[index]?.id}`}
                        value={count != null ? count / maxCount : null}
                        min={0}
                        max={1}
                        width={68}
                        height={30}
                        label={count != null ? `${operators[index]?.name}: ${count} reviews` : 'No reviews'}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4">
            <p className="eyebrow">Route sentiment spread</p>
            <h2 className="section-title">Scores by direction</h2>
          </div>
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(720, displayRoutes.length * 78) }}>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={barData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid className="chart-grid" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#64706d', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[-1, 1]} tick={{ fill: '#64706d', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,119,182,0.05)' }} />
                  <Legend wrapperStyle={{ color: '#50615d', fontSize: 11, fontWeight: 700 }} />
                  {operators.map(operator => (
                    <Bar key={operator.id} dataKey={operator.name} name={operator.name} fill={operator.color} radius={[5, 5, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {drillRouteId && drillData && (
        <section className="glass-panel-strong p-4 sm:p-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Route drill-down</p>
              <h2 className="section-title">
                {routeLabel(drillData.route?.origin ?? '', drillData.route?.destination ?? '')}
              </h2>
            </div>
            <button type="button" className="icon-button" onClick={() => setDrillRouteId(null)} aria-label="Close drill-down" title="Close drill-down">
              <X size={17} />
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(drillData.operators ?? []).map((operator: any) => {
              const known = operators.find(item => item.id === operator.operator_id)
              return (
                <article key={operator.operator_id} className="rounded-lg border border-slate-900/10 bg-white/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-[#14211f]">{operator.operator_name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{operator.review_count ?? 0} reviews</p>
                    </div>
                    <span className={cx('rounded-full px-2.5 py-1 text-xs font-black', rankClass(operator.competitive_rank))}>
                      Rank {operator.competitive_rank ?? 'No data'}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                    <div>
                      <p className="text-xl font-black text-[#14211f]">{formatMetric(operator.sentiment_score, 2)}</p>
                      <p className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-400">Sentiment</p>
                    </div>
                    <div>
                      <p className="text-xl font-black text-[#14211f]">{formatMetric(operator.sentiment_breakdown?.positive_pct, 1)}%</p>
                      <p className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-400">Positive</p>
                    </div>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-rose-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${operator.sentiment_breakdown?.positive_pct ?? 0}%`, backgroundColor: known?.color ?? '#00a676' }}
                    />
                  </div>
                  <div className="mt-4 space-y-2">
                    {(operator.top_reviews ?? []).slice(0, 3).map((review: any, index: number) => (
                      <p key={index} className="border-b border-slate-900/10 pb-2 text-xs font-semibold leading-5 text-slate-600 last:border-b-0">
                        {review.text ?? 'No review text'}
                      </p>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-900/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="eyebrow">FreshBus route table</p>
            <h2 className="section-title">Rank, leader gap, and review pressure</h2>
          </div>
          <div className="flex gap-2">
            {[
              { key: 'rank', label: 'Rank' },
              { key: 'sentiment', label: 'Sentiment' },
              { key: 'route', label: 'Route' },
            ].map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSortKey(item.key as SortKey)}
                className={cx('control-chip inline-flex items-center px-3 text-xs font-black', sortKey === item.key && 'control-chip-active')}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[940px]">
            <thead>
              <tr>
                <th>Route</th>
                <th>FreshBus Rank</th>
                <th>FreshBus Sentiment</th>
                <th>Route Leader</th>
                <th>Leader Gap</th>
                <th>Reviews</th>
              </tr>
            </thead>
            <tbody>
              {sortedRouteRows.map(row => (
                <tr key={row.route_id}>
                  <td className="font-black text-[#14211f]">{row.label}</td>
                  <td>
                    <span className={cx('rounded-full px-2.5 py-1 text-xs font-black', rankClass(row.freshRank))}>
                      {row.freshRank != null ? `#${row.freshRank}` : 'No data'}
                    </span>
                  </td>
                  <td className="font-black text-[#14211f]">{formatMetric(row.freshSentiment, 2)}</td>
                  <td>{row.leaderName}</td>
                  <td className={cx('font-black', (row.gap ?? 0) <= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                    {formatMetric(row.gap, 2)}
                  </td>
                  <td>{formatCompact(row.reviewCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-panel p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow">Action focus</p>
            <h2 className="section-title">Highest-pressure FreshBus routes</h2>
          </div>
          <Target size={20} className="text-[#f45d48]" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {sortedRouteRows
            .filter(row => row.gap != null)
            .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))
            .slice(0, 3)
            .map(row => (
              <article key={row.route_id} className="rounded-lg border border-slate-900/10 bg-white/60 p-4">
                <p className="text-sm font-black text-[#14211f]">{row.label}</p>
                <p className="mt-2 text-2xl font-black text-rose-700">{formatMetric(row.gap, 2)}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Leader: {row.leaderName} - FreshBus rank {row.freshRank ?? 'No data'}
                </p>
              </article>
            ))}
        </div>
      </section>
    </div>
  )
}
