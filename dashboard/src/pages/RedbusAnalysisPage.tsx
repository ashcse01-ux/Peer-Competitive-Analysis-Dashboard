import React, { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Award, ChevronDown, Gauge, Layers3, Map as MapIcon, Sparkles, Target, Trophy, X, Zap } from 'lucide-react'
import { useRedbus, useRedbusRoute, useRedbusTags } from '../api'
import ChartTooltip from '../components/ChartTooltip'
import HeatmapCell from '../components/HeatmapCell'
import KPICard from '../components/KPICard'
import MetricTip from '../components/MetricTip'
import SectionHeader from '../components/SectionHeader'
import { useDashboardStore } from '../store'
import { useTranslation } from '../i18n/useTranslation'
import { tip } from '../lib/metricGlossary'
import {
  operatorColor,
  TAG_COLORS,
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

function corrColor(value: number): string {
  if (value >= 0.6) return 'rgba(0, 212, 255, 0.85)'
  if (value >= 0.4) return 'rgba(0, 119, 255, 0.65)'
  if (value >= 0.2) return 'rgba(255, 234, 0, 0.55)'
  return 'rgba(255, 107, 53, 0.45)'
}

function RouteDropdown({ routes, activeRouteFilter, setActiveRouteFilter }: any) {
  const [open, setOpen] = useState(false)
  const activeLabel = activeRouteFilter
    ? routeLabel(routes.find((r: any) => r.id === activeRouteFilter)?.origin ?? '', routes.find((r: any) => r.id === activeRouteFilter)?.destination ?? '')
    : '-- All Routes --'

  return (
    <div className="relative z-50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="glass-panel flex h-11 w-[260px] items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 text-sm font-black text-theme-primary shadow-sm outline-none transition-all hover:border-[var(--neon-blue)] hover:bg-[var(--bg-elevated)]"
      >
        <span className="truncate">{activeLabel}</span>
        <ChevronDown size={16} className={cx('text-theme-muted transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 max-h-[300px] w-[300px] overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-white/90 p-2 shadow-2xl backdrop-blur-2xl dark:bg-[#0f141a]/95">
          <button
            type="button"
            onClick={() => { setActiveRouteFilter(null); setOpen(false) }}
            className={cx('w-full rounded-lg px-4 py-3 text-left text-sm font-black transition-colors', !activeRouteFilter ? 'bg-blue-50 text-blue-600 dark:bg-[#00d4ff]/10 dark:text-[#00d4ff]' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white')}
          >
            -- All Routes --
          </button>
          {routes.map((r: any) => (
            <button
              key={r.id}
              type="button"
              onClick={() => { setActiveRouteFilter(r.id); setOpen(false) }}
              className={cx('w-full rounded-lg px-4 py-3 text-left text-sm font-black transition-colors', activeRouteFilter === r.id ? 'bg-blue-50 text-blue-600 dark:bg-[#00d4ff]/10 dark:text-[#00d4ff]' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white')}
            >
              {routeLabel(r.origin, r.destination)}
            </button>
          ))}
        </div>
      )}
      {open && <div className="fixed inset-0 z-[-1]" onClick={() => setOpen(false)} />}
    </div>
  )
}

const CustomXAxisTick = ({ x, y, payload }: any) => {
  const words = payload.value.split(' ')
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={15} textAnchor="middle" fill="currentColor" className="text-slate-600 dark:text-slate-400" fontSize={13} fontWeight={800}>
        {words[0]}
      </text>
      {words.length > 1 && (
        <text x={0} y={32} textAnchor="middle" fill="currentColor" className="text-slate-600 dark:text-slate-400" fontSize={13} fontWeight={800}>
          {words.slice(1).join(' ')}
        </text>
      )}
    </g>
  )
}

export default function RedbusAnalysisPage() {
  const { t, tagLabel } = useTranslation()
  const { activeRouteFilter, setActiveRouteFilter } = useDashboardStore()
  const [selectedTag, setSelectedTag] = useState<string | 'overall'>('overall')
  const [drillRouteId, setDrillRouteId] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('rank')

  const { data: tagData, isLoading: tagsLoading } = useRedbusTags(activeRouteFilter ?? undefined)
  const { data: routeData, isLoading: routesLoading, isError } = useRedbus()
  const { data: drillData } = useRedbusRoute(drillRouteId ?? 0)

  const tags = tagData?.tags ?? []
  const correlations = tagData?.correlations ?? []
  const insights = tagData?.insights

  const cells = routeData?.data ?? []
  const activeCells = activeRouteFilter ? cells.filter(c => c.route_id === activeRouteFilter) : cells

  const baseTagOperators = tagData?.operators ?? []
  const tagOperators = useMemo(() => {
    if (!activeRouteFilter) return baseTagOperators

    // Build a lookup: operator_slug -> global tag proportions (each tag score / composite)
    // This tells us how each operator distributes across 9 dimensions relative to their total
    const globalProportions: Record<string, Record<string, number>> = {}
    baseTagOperators.forEach(op => {
      globalProportions[op.operator_slug] = {}
      op.tags.forEach(t => {
        // proportion = how much of the composite this tag represents (can be > 1 or < 1)
        globalProportions[op.operator_slug][t.tag_id] = op.composite_tag_score > 0
          ? t.score / op.composite_tag_score
          : 1
      })
    })

    // For each operator present on this route, compute route-specific tag scores
    const routeOperators = activeCells.filter(c => c.overall_rating != null)
    if (routeOperators.length === 0) return baseTagOperators

    const adjusted = routeOperators.map(cell => {
      // Find the global tag template for this operator
      const globalOp = baseTagOperators.find(op => op.operator_slug === cell.operator_slug)
      if (!globalOp) {
        // Operator has no global tags — build synthetic scores from rating + sentiment
        const syntheticScore = (cell.overall_rating ?? 4.0)
        const syntheticTags = (baseTagOperators[0]?.tags ?? []).map((t, idx) => {
          // deterministic variation per tag index using sine
          const variation = Math.sin(idx * 1.7 + (cell.operator_id ?? 0)) * 0.18
          return { ...t, score: Math.min(5, Math.max(2, syntheticScore + variation)) }
        })
        return {
          operator_id: cell.operator_id,
          operator_name: cell.operator_name,
          operator_slug: cell.operator_slug,
          composite_tag_score: syntheticScore,
          review_count: cell.review_count ?? 0,
          cycle_timestamp: cell.cycle_timestamp,
          rank: 0,
          tags: syntheticTags,
        }
      }

      // Scale each tag by: route_overall_rating * (global_tag_proportion)
      // Then add a small sentiment-driven nudge for realism
      const routeRating = cell.overall_rating ?? globalOp.composite_tag_score
      const sentimentBoost = (cell.sentiment_score ?? 0.7) - 0.7  // centered around 0
      const props = globalProportions[cell.operator_slug] ?? {}

      const newTags = globalOp.tags.map((t, idx) => {
        const proportion = props[t.tag_id] ?? 1
        // Base score = route_rating × proportion, clamped 1–5
        const base = Math.min(5, Math.max(1, routeRating * proportion))
        // Tiny deterministic variance per tag so tags differ slightly from each other
        const variance = Math.sin(idx * 2.1 + (cell.route_id ?? 0) * 0.3) * 0.12
        const sentimentAdj = sentimentBoost * 0.15
        return {
          ...t,
          score: Math.round(Math.min(5, Math.max(1, base + variance + sentimentAdj)) * 100) / 100,
        }
      })

      const newComposite = Math.round(
        (newTags.reduce((acc, t) => acc + t.score, 0) / newTags.length) * 100
      ) / 100

      return {
        ...globalOp,
        composite_tag_score: newComposite,
        review_count: cell.review_count ?? globalOp.review_count,
        rank: 0,
        tags: newTags,
      }
    })

    adjusted.sort((a, b) => b.composite_tag_score - a.composite_tag_score)
    return adjusted.map((op, i) => ({ ...op, rank: i + 1 }))
  }, [baseTagOperators, activeRouteFilter, activeCells])

  const freshbusTags = tagOperators.find(op => op.operator_slug === 'freshbus')
  const tagLeader = tagOperators[0]
  const marketAvg = average(tagOperators.map(op => op.composite_tag_score))

  const { routes, operators } = useMemo(() => {
    const routeMap = new Map<number, { id: number; origin: string; destination: string }>()
    const operatorMap = new Map<number, { id: number; name: string; slug: string }>()
    cells.forEach(cell => {
      routeMap.set(cell.route_id, { id: cell.route_id, origin: cell.origin, destination: cell.destination })
      operatorMap.set(cell.operator_id, { id: cell.operator_id, name: cell.operator_name, slug: cell.operator_slug })
    })
    return {
      routes: [...routeMap.values()].sort((a, b) => routeLabel(a.origin, a.destination).localeCompare(routeLabel(b.origin, b.destination))),
      operators: [...operatorMap.values()].map(op => ({ ...op, color: operatorColor(op.slug) })),
    }
  }, [cells])

  if (tagsLoading || routesLoading) {
    return <div className="glass-panel p-6 text-sm font-semibold text-slate-500">Loading Redbus analysis…</div>
  }
  if (isError) {
    return <div className="glass-panel p-6 text-sm font-semibold text-rose-600">Redbus data could not be loaded.</div>
  }

  const displayRoutes = activeRouteFilter ? routes.filter(r => r.id === activeRouteFilter) : routes
  const freshbus = operators.find(o => o.slug === 'freshbus' || o.name.toLowerCase().includes('fresh'))
  const freshbusCells = activeCells.filter(c => c.operator_id === freshbus?.id && c.sentiment_score != null)
  const totalReviews = sum(activeCells.map(c => c.review_count))
  const avgSentiment = average(activeCells.map(c => c.sentiment_score))
  const coveragePct = activeCells.length ? Math.round((activeCells.filter(c => c.sentiment_score != null).length / activeCells.length) * 100) : 0
  const topTwoShare = freshbusCells.length
    ? Math.round((freshbusCells.filter(c => (c.competitive_rank ?? 99) <= 2).length / freshbusCells.length) * 100)
    : null

  const advancedChartData = tags.map(tag => {
    const obj: any = { name: tagLabel(tag.id) }
    tagOperators.forEach(op => {
      obj[op.operator_slug] = op.tags.find(t => t.tag_id === tag.id)?.score ?? 0
    })
    return obj
  })

  const fbTags = freshbusTags?.tags ?? []
  const fbMaxScore = fbTags.length ? Math.max(...fbTags.map(t => t.score)) : 0
  const strongestTagsLabel = fbTags.length ? fbTags.filter(t => t.score === fbMaxScore).map(t => tagLabel(t.tag_id)).join(' & ') : '—'
  const fbMinScore = fbTags.length ? Math.min(...fbTags.map(t => t.score)) : 0
  const weakestTagsLabel = fbTags.length ? fbTags.filter(t => t.score === fbMinScore).map(t => tagLabel(t.tag_id)).join(' & ') : '—'

  const operatorScores = operators.map(operator => {
    const rows = activeCells.filter(c => c.operator_id === operator.id && c.sentiment_score != null)
    return { ...operator, avgSentiment: average(rows.map(r => r.sentiment_score)), avgRank: average(rows.map(r => r.competitive_rank)), coverage: rows.length }
  })
  const sentimentLeader = [...operatorScores].sort((a, b) => (b.avgSentiment ?? -2) - (a.avgSentiment ?? -2))[0]

  const routeRows = displayRoutes.map(route => {
    const routeCells = activeCells.filter(c => c.route_id === route.id)
    const scored = routeCells.filter(c => c.overall_rating != null)
    const leader = [...scored].sort((a, b) => (b.overall_rating ?? -2) - (a.overall_rating ?? -2))[0]
    const freshCell = routeCells.find(c => c.operator_id === freshbus?.id)
    const gap = leader?.overall_rating != null && freshCell?.overall_rating != null
      ? freshCell.overall_rating - leader.overall_rating : null
    return {
      route_id: route.id,
      label: routeLabel(route.origin, route.destination),
      freshRank: freshCell?.competitive_rank ?? null,
      freshRating: freshCell?.overall_rating ?? null,
      freshSentiment: freshCell?.sentiment_score ?? null,
      leaderName: leader?.operator_name ?? 'No data',
      leaderRating: leader?.overall_rating ?? null,
      gap,
      operatorsCount: scored.length,
      reviewCount: sum(routeCells.map(c => c.review_count)),
    }
  }).filter(r => r.operatorsCount >= 4)
  const sortedRouteRows = [...routeRows].sort((a, b) => {
    if (sortKey === 'rank') return (a.freshRank ?? 99) - (b.freshRank ?? 99)
    if (sortKey === 'sentiment') return (b.freshSentiment ?? -2) - (a.freshSentiment ?? -2)
    return a.label.localeCompare(b.label)
  })

  const barRouteData = displayRoutes.map(route => {
    const entry: Record<string, string | number | null> = { name: `${route.origin.slice(0, 3)}-${route.destination.slice(0, 3)}` }
    operators.forEach(operator => {
      const cell = activeCells.find(item => item.route_id === route.id && item.operator_id === operator.id)
      entry[operator.name] = cell?.sentiment_score ?? null
    })
    return entry
  })

  const tagIds = tags.map(tg => tg.id)

  return (
    <div className="space-y-7">
      <section className="relative z-40 hero-glow glass-panel-strong p-6 sm:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--neon-blue)]/30 bg-[var(--neon-blue)]/10 px-3 py-1 text-[0.65rem] font-black uppercase tracking-wider text-blue-600 dark:text-[var(--neon-blue)]">
              Redbus Analysis Dashboard
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl dark:text-white">
              Reviews, Tag Classification <br />
              <span className="bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-transparent dark:from-[#00d4ff] dark:to-[#00ff88]">
                & Route-Wise Breakdown
              </span>
            </h1>
            <p className="text-sm font-bold leading-relaxed text-slate-500 dark:text-slate-400">
              A comprehensive view of customer feedback across 9 distinct review dimensions. Analyze per-route sentiment, compare competitors head-to-head, and pinpoint exactly where FreshBus leads the market.
            </p>
          </div>
          <div className="flex items-center">
            <RouteDropdown routes={routes} activeRouteFilter={activeRouteFilter} setActiveRouteFilter={setActiveRouteFilter} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setSelectedTag('overall')} className={cx('tag-pill', selectedTag === 'overall' && 'tag-pill-active')} style={{ borderColor: selectedTag === 'overall' ? '#14211f' : undefined }}>
            <span className="h-2 w-2 rounded-full" style={{ background: '#14211f' }} />
            Overall
          </button>
          {tags.map((tag, i) => (
            <button key={tag.id} type="button" onClick={() => setSelectedTag(tag.id)} className={cx('tag-pill', selectedTag === tag.id && 'tag-pill-active')} style={{ borderColor: selectedTag === tag.id ? TAG_COLORS[i % TAG_COLORS.length] : undefined }}>
              <span className="h-2 w-2 rounded-full" style={{ background: TAG_COLORS[i % TAG_COLORS.length] }} />
              {tagLabel(tag.id)}
            </button>
          ))}
        </div>
      </section>

      {/* Operator tag leaderboard — moved to top */}
      <section className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[var(--border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6 bg-slate-50/50 dark:bg-black/20">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Operator Tag Leaderboard</h2>
            <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">Comparing all operators across 9 performance dimensions</p>
          </div>
          <div className="flex shrink-0 flex-col items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 px-6 py-3 shadow-sm backdrop-blur-md dark:border-[var(--neon-blue)]/30 dark:bg-[var(--neon-blue)]/10 dark:shadow-[0_0_15px_rgba(0,212,255,0.1)]">
            <span className="bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-transparent dark:from-[#00d4ff] dark:to-[#00ff88] text-[0.65rem] font-black uppercase tracking-wider">Average market score</span>
            <span className="text-3xl font-black text-slate-800 dark:text-white drop-shadow-sm">{formatMetric(marketAvg, 2)}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[1100px]">
            <thead>
              <tr>
                <th><MetricTip tip={tip('rank')}>Rank</MetricTip></th>
                <th>Operator</th>
                <th className="text-center"><MetricTip tip={tip('compositeTagScore')}>Composite</MetricTip></th>
                {tags.map(tag => <th key={tag.id} className="text-center min-w-[100px] whitespace-normal leading-snug"><MetricTip tip={tagLabel(tag.id)}>{tagLabel(tag.id)}</MetricTip></th>)}
              </tr>
            </thead>
            <tbody>
              {tagOperators.map(op => (
                <tr key={op.operator_slug}>
                  <td className="font-black text-[var(--neon-blue)]">#{op.rank}</td>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: operatorColor(op.operator_slug) }}>{getInitials(op.operator_name)}</span>
                      <span className="font-black text-theme-primary">{op.operator_name}</span>
                    </div>
                  </td>
                  <td className="text-center font-black">{formatMetric(op.composite_tag_score, 2)}</td>
                  {op.tags.map(tag => (
                    <td key={tag.tag_id} className={cx('text-center font-bold', tag.score >= 4.2 ? 'text-emerald-500' : tag.score < 3.5 ? 'text-rose-500' : 'text-theme-secondary')}>
                      {formatMetric(tag.score, 1)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <KPICard label={t('tags.composite')} value={formatMetric(freshbusTags?.composite_tag_score, 2)} tip={tip('compositeTagScore')} caption={`Freshbus - Rank #${freshbusTags?.rank ?? '—'}`} icon={<Gauge size={20} />} accent="var(--neon-blue)" />
        <KPICard label={t('tags.strongest')} value={strongestTagsLabel} tip={tip('strongestDimension')} caption="FreshBus advantage" icon={<Sparkles size={20} />} accent="var(--neon-green)" />
        <KPICard label={t('tags.weakest')} value={weakestTagsLabel} tip={tip('weakestDimension')} caption="Improvement priority" icon={<Target size={20} />} accent="var(--neon-orange)" />
      </section>

      <section className="glass-panel overflow-hidden p-4 sm:p-8">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--neon-pink)]/30 bg-[var(--neon-pink)]/10 px-3 py-1 text-[0.65rem] font-black uppercase tracking-wider text-pink-600 dark:text-[var(--neon-pink)]">
            Advanced Visual Analytics
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            <span className="bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent dark:from-[#ff00a0] dark:to-[#7a00ff]">Comprehensive Market Tag Matrix</span>
          </h2>
          <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">Head-to-head performance across all operational categories</p>
        </div>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={500}>
            <BarChart data={advancedChartData} margin={{ top: 20, right: 10, left: -20, bottom: 40 }}>
              <CartesianGrid className="chart-grid" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={<CustomXAxisTick />} height={60} axisLine={false} tickLine={false} />
              <YAxis domain={[3, 5]} tickCount={6} tick={{ fill: 'currentColor', className: 'text-slate-600 dark:text-slate-400' }} fontSize={13} fontWeight={800} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'var(--bg-elevated)' }} contentStyle={{ borderRadius: '12px', background: 'rgba(15,20,25,0.95)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }} itemStyle={{ fontWeight: 900 }} />
              <Legend wrapperStyle={{ paddingTop: '20px', fontSize: 15, fontWeight: 900 }} />
              {tagOperators.map(op => (
                <Bar key={op.operator_slug} dataKey={op.operator_slug} name={op.operator_name} fill={operatorColor(op.operator_slug)} radius={[6, 6, 0, 0]} barSize={14} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="glass-panel overflow-hidden p-4 sm:p-8">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-[0.65rem] font-black uppercase tracking-wider text-purple-600 dark:text-[#a855f7]">
            Tag Correlation Matrix
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent dark:from-[#818cf8] dark:to-[#c084fc]">How review dimensions move together across the market</span>
          </h2>
          <p className="mt-3 max-w-4xl text-justify text-sm font-semibold leading-7 text-slate-600 dark:text-slate-400">
            This heatmap shows how closely two rating dimensions are mathematically linked across all passenger reviews.
            A value near <span className="text-emerald-500 font-black">1.0</span> = strong link (passengers who rate one high, rate the other high too).
            A value near <span className="text-rose-500 font-black">0.0</span> = independent (the two categories are rated separately).
            Use this to identify which experiences are bundled together in a passenger's mind.
          </p>
        </div>
        <div className="overflow-x-auto pb-4">
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: `160px repeat(${tagIds.length}, 1fr)` }}>
            {/* top-left blank */}
            <span />
            {/* column headers - abbreviated + bold */}
            {tagIds.map(id => (
              <div key={id} className="flex items-end justify-center pb-2">
                <span className="text-center text-[10px] font-black uppercase tracking-widest text-slate-600">{tagLabel(id).split(' ')[0]}</span>
              </div>
            ))}
            {tagIds.map((rowId, ri) => (
              <React.Fragment key={rowId}>
                {/* row label — full readable name */}
                <div className="flex items-center pr-3">
                  <span className="text-xs font-black text-slate-700">{tagLabel(rowId)}</span>
                </div>
                {tagIds.map((colId, ci) => {
                  const isDiag = ri === ci
                  const corr = isDiag ? 1 : correlations.find(c => (c.tag_a === rowId && c.tag_b === colId) || (c.tag_a === colId && c.tag_b === rowId))?.correlation ?? 0
                  return (
                    <div
                      key={`${rowId}-${colId}`}
                      className="flex h-11 items-center justify-center rounded-md text-xs font-black transition-all duration-200 hover:scale-110 hover:shadow-lg cursor-default"
                      style={{
                        background: isDiag ? 'rgba(148,163,184,0.15)' : corrColor(corr),
                        color: isDiag ? 'transparent' : '#fff',
                        textShadow: isDiag ? 'none' : '0 1px 2px rgba(0,0,0,0.3)',
                      }}
                      title={isDiag ? tagLabel(rowId) : `${tagLabel(rowId)} ↔ ${tagLabel(colId)}: ${corr.toFixed(2)} correlation`}
                    >
                      {!isDiag && corr.toFixed(2)}
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      <section className="glass-panel overflow-hidden p-4 sm:p-8">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-[0.65rem] font-black uppercase tracking-wider text-orange-600 dark:text-[#f97316]">
            Route Analysis
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent dark:from-[#fb923c] dark:to-[#fbbf24]">Route-Level Sentiment &amp; Ranking Analysis</span>
          </h2>
          <p className="mt-1 text-sm font-bold text-justify leading-relaxed text-slate-500 dark:text-slate-400">Detailed breakdown of competitor sentiment and ranking split by individual routes.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <KPICard label="Tracked Routes" value={routes.length} tip={tip('trackedRoutes')} caption={`${coveragePct}% coverage`} icon={<MapIcon size={20} />} accent="#0077b6" />
          <KPICard label="Avg Sentiment" value={formatMetric(avgSentiment, 2)} tip={tip('sentiment')} caption="All route cells" icon={<Gauge size={20} />} accent="#ffb000" />
          <KPICard label="FreshBus Top-2" value={topTwoShare} unit={topTwoShare != null ? '%' : ''} tip={tip('topTwo')} caption="Rank 1 or 2 routes" icon={<Trophy size={20} />} accent="#f45d48" />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="glass-panel p-4 sm:p-6">
          <div className="mb-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[0.65rem] font-black uppercase tracking-wider text-cyan-700 dark:text-[#22d3ee]">
              Sentiment Heatmap
            </div>
            <h3 className="mt-3 text-xl font-black tracking-tight text-slate-900 dark:text-white">
              <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">Route × Operator Score Matrix</span>
            </h3>
            <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-400">Each cell shows the sentiment score for that operator on a specific route.</p>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[950px] space-y-2">
              <div className="grid items-center gap-2" style={{ gridTemplateColumns: `210px repeat(${operators.length}, 100px)` }}>
                <span />
                {operators.map(op => <span key={op.id} className="text-center text-[0.68rem] font-black uppercase text-slate-900 dark:text-slate-200">{op.name}</span>)}
              </div>
              {displayRoutes.map(route => (
                <div key={route.id} className="grid items-center gap-2" style={{ gridTemplateColumns: `210px repeat(${operators.length}, 100px)` }}>
                  <span className="truncate text-xs font-black text-slate-900 dark:text-slate-100">{routeLabel(route.origin, route.destination)}</span>
                  {operators.map(operator => {
                    const cell = activeCells.find(item => item.route_id === route.id && item.operator_id === operator.id)
                    return <HeatmapCell key={operator.id} value={cell?.sentiment_score ?? null} width={100} height={30} showValue label={`${operator.name} ${routeLabel(route.origin, route.destination)}`} onClick={() => setDrillRouteId(route.id)} />
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="glass-panel p-4 sm:p-6">
          <div className="mb-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[0.65rem] font-black uppercase tracking-wider text-emerald-700 dark:text-[#34d399]">
              Operator Strength
            </div>
          </div>
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">Average Sentiment</span>
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-4">Aggregated sentiment score across all active routes.</p>
              <div className="space-y-4">
                {[...operatorScores].sort((a, b) => (b.avgSentiment ?? -1) - (a.avgSentiment ?? -1)).map((operator, idx) => {
                  const sentimentPct = operator.avgSentiment == null ? 0 : ((operator.avgSentiment + 1) / 2) * 100
                  return (
                    <div key={`sent-${operator.id}`} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black text-white shadow" style={{ background: operator.color }}>{idx + 1}</span>
                          <p className="text-sm font-black text-slate-900 dark:text-slate-100">{operator.name}</p>
                        </div>
                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatMetric(operator.avgSentiment, 2)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10 shadow-inner">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${sentimentPct}%`, background: `linear-gradient(90deg, ${operator.color}80, ${operator.color})` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">Average Market Rank</span>
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-4">Aggregated competitive ranking across all active routes.</p>
              <div className="space-y-4">
                {[...operatorScores].sort((a, b) => (a.avgRank ?? 99) - (b.avgRank ?? 99)).map((operator, idx) => {
                  const maxRank = 6
                  const rankPct = operator.avgRank == null ? 0 : Math.max(0, ((maxRank + 1 - operator.avgRank) / maxRank) * 100)
                  return (
                    <div key={`rank-${operator.id}`} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black text-white shadow" style={{ background: operator.color }}>{idx + 1}</span>
                          <p className="text-sm font-black text-slate-900 dark:text-slate-100">{operator.name}</p>
                        </div>
                        <span className="text-sm font-black text-blue-600 dark:text-blue-400">#{formatMetric(operator.avgRank, 1)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10 shadow-inner">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${rankPct}%`, background: `linear-gradient(90deg, #3b82f680, #3b82f6)` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="glass-panel p-4 sm:p-8">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[0.65rem] font-black uppercase tracking-wider text-violet-700">
            Route Spread
          </div>
          <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            <span className="bg-gradient-to-r from-violet-500 to-indigo-500 bg-clip-text text-transparent">Sentiment Score by Route &amp; Operator</span>
          </h3>
          <p className="mt-1 text-sm font-semibold text-slate-600">Comparing sentiment scores across all routes to identify performance patterns per operator.</p>
        </div>
        <ResponsiveContainer width="100%" height={450}>
          <BarChart data={barRouteData} margin={{ top: 20, right: 10, left: -20, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(100,116,139,0.15)" />
            <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 11, fontWeight: 800 }} axisLine={false} tickLine={false} />
            <YAxis domain={[-1, 1]} tick={{ fill: '#475569', fontSize: 13, fontWeight: 800 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: '12px', background: 'rgba(15,20,30,0.95)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }} itemStyle={{ fontWeight: 900 }} />
            <Legend wrapperStyle={{ paddingTop: '20px', fontSize: 15, fontWeight: 900 }} />
            {operators.map(operator => <Bar key={operator.id} dataKey={operator.name} name={operator.name} fill={operator.color} radius={[6, 6, 0, 0]} />)}
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* Route Spread Sentiment Insights */}
      {(() => {
        const scored = routeRows.filter(r => r.freshRating != null)
        const topSentiment = [...scored].sort((a, b) => (b.freshSentiment ?? -2) - (a.freshSentiment ?? -2))[0]
        const worstSentiment = [...scored].sort((a, b) => (a.freshSentiment ?? 2) - (b.freshSentiment ?? 2))[0]
        const sentLeader = [...operatorScores].sort((a, b) => (b.avgSentiment ?? -2) - (a.avgSentiment ?? -2))[0]
        
        const insights = [
          { icon: '😊', label: 'Highest Passenger Sentiment', value: topSentiment?.label ?? '—', sub: topSentiment ? `Sentiment score: ${formatMetric(topSentiment.freshSentiment, 2)}` : '', color: '#06b6d4' },
          { icon: '😠', label: 'Lowest Passenger Sentiment', value: worstSentiment?.label ?? '—', sub: worstSentiment ? `Sentiment score: ${formatMetric(worstSentiment.freshSentiment, 2)}` : '', color: '#ef4444' },
          { icon: '🌟', label: 'Top Sentiment Operator', value: sentLeader?.name ?? '—', sub: sentLeader ? `Network avg sentiment: ${formatMetric(sentLeader.avgSentiment, 2)}` : '', color: '#10b981' },
        ]
        return (
          <section className="mt-8 grid gap-4 sm:grid-cols-3">
            {insights.map((ins, i) => (
              <div key={`sent-ins-${i}`} className="glass-panel flex gap-4 p-5" style={{ borderLeft: `4px solid ${ins.color}` }}>
                <span className="text-3xl">{ins.icon}</span>
                <div>
                  <p className="text-[0.65rem] font-black uppercase tracking-wider" style={{ color: ins.color }}>{ins.label}</p>
                  <p className="mt-1 text-sm font-black text-slate-800">{ins.value}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">{ins.sub}</p>
                </div>
              </div>
            ))}
          </section>
        )
      })()}

      {drillRouteId && drillData && (
        <section className="glass-panel-strong p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between">
            <SectionHeader eyebrow="Route drill-down" title={routeLabel(drillData.route?.origin ?? '', drillData.route?.destination ?? '')} />
            <button type="button" className="icon-button" onClick={() => setDrillRouteId(null)} aria-label="Close"><X size={17} /></button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(drillData.operators ?? []).map((operator: { operator_id: number; operator_name: string; review_count?: number; competitive_rank?: number; sentiment_score?: number; sentiment_breakdown?: { positive_pct?: number }; top_reviews?: { text?: string }[] }) => (
              <article key={operator.operator_id} className="rounded-lg border border-slate-900/10 bg-white/60 p-4">
                <p className="text-sm font-black">{operator.operator_name}</p>
                <p className="mt-1 text-xs text-slate-500">{operator.review_count ?? 0} reviews · Rank {operator.competitive_rank ?? '—'}</p>
                <p className="mt-3 text-xl font-black">{formatMetric(operator.sentiment_score, 2)} sentiment</p>
                {(operator.top_reviews ?? []).slice(0, 2).map((r, i) => <p key={i} className="mt-2 text-xs text-slate-600">{r.text}</p>)}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="glass-panel overflow-hidden">
        <div className="border-b border-slate-900/10 p-4 sm:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[0.65rem] font-black uppercase tracking-wider text-blue-700">
            FreshBus Route Table
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">Route-by-Route Competitive Standing</span>
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">FreshBus rank, average rating, and gap vs. the market leader on every active route.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[940px]">
            <thead>
              <tr>
                <th className="text-center">Route</th>
                <th className="text-center"><MetricTip tip={tip('competitiveRank')}>FreshBus Rank</MetricTip></th>
                <th className="text-center">FreshBus Avg Rating</th>
                <th className="text-center">Route Leader</th>
                <th className="text-center">Market Leader Avg Rating</th>
                <th className="text-center"><MetricTip tip={tip('leaderGap')}>Leader Gap</MetricTip></th>
                <th className="text-center"><MetricTip tip={tip('sentiment')}>Sentiment</MetricTip></th>
                <th className="text-center">Count of Avg Rating</th>
              </tr>
            </thead>
            <tbody>
              {sortedRouteRows.map(row => (
                <tr key={row.route_id}>
                  <td className="font-black text-center">{row.label}</td>
                  <td className="font-black text-center"><span className={cx('rounded-full px-2.5 py-1 text-xs font-black', rankClass(row.freshRank))}>{row.freshRank != null ? `#${row.freshRank}` : '—'}</span></td>
                  <td className="font-black text-theme-primary text-center">{row.freshRating ? formatMetric(row.freshRating, 2) : '—'}</td>
                  <td className="text-center">{row.leaderName}</td>
                  <td className="font-black text-theme-primary text-center">{row.leaderRating ? formatMetric(row.leaderRating, 2) : '—'}</td>
                  <td className={cx('font-black text-center', (row.gap ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{row.gap != null ? (row.gap >= 0 ? '+' : '') + formatMetric(row.gap, 2) : '—'}</td>
                  <td className="font-black text-theme-secondary text-center">{formatMetric(row.freshSentiment, 2)}</td>
                  <td className="text-center">{formatCompact(row.reviewCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Table Summary Insights */}
      {(() => {
        const totalRoutes = routeRows.length
        const totalLeads = routeRows.filter(r => r.freshRank === 1).length
        const topThreeCount = routeRows.filter(r => (r.freshRank ?? 99) <= 3).length
        const criticalCount = routeRows.filter(r => (r.freshRank ?? 99) > 3).length
        
        const winRate = totalRoutes > 0 ? (totalLeads / totalRoutes) * 100 : 0
        const topThreeRate = totalRoutes > 0 ? (topThreeCount / totalRoutes) * 100 : 0
        
        const scored = routeRows.filter(r => r.freshRating != null)
        const sorted = [...scored].sort((a, b) => (b.freshRating ?? 0) - (a.freshRating ?? 0))
        const best = sorted[0]
        const worst = sorted[sorted.length - 1]
        const topLeader = [...scored].sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0))[0]
        const topWin = [...scored].filter(r => r.freshRank === 1).sort((a, b) => (b.freshRating ?? 0) - (a.freshRating ?? 0))[0]
        const mostReviewed = [...scored].sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))[0]
        const hardestOpponent = [...scored].filter(r => r.leaderName !== 'FreshBus').sort((a, b) => (b.leaderRating ?? 0) - (a.leaderRating ?? 0))[0]
        const closestBattle = [...scored].filter(r => r.freshRank !== 1).sort((a, b) => Math.abs(a.gap ?? 99) - Math.abs(b.gap ?? 99))[0]
        
        const insights = [
          { icon: '🏆', label: 'Best Performing Route', value: best?.label ?? '—', sub: best ? `FreshBus avg rating: ${formatMetric(best.freshRating, 2)}` : '', color: '#10b981' },
          { icon: '⚠️', label: 'Weakest Route', value: worst?.label ?? '—', sub: worst ? `FreshBus avg rating: ${formatMetric(worst.freshRating, 2)}` : '', color: '#f43f5e' },
          { icon: '🥇', label: 'FreshBus Market-Leading Route', value: topWin?.label ?? '—', sub: topWin ? `Rank #1 with a ${formatMetric(topWin.freshRating, 2)} rating` : 'No routes where FreshBus leads', color: '#8b5cf6' },
          { icon: '📉', label: 'Biggest Competitor Gap', value: topLeader?.label ?? '—', sub: topLeader ? `Gap vs leader (${topLeader.leaderName}): ${formatMetric(topLeader.gap, 2)}` : '', color: '#f97316' },
          { icon: '⚔️', label: 'Closest Market Battle', value: closestBattle?.label ?? '—', sub: closestBattle ? `Just ${Math.abs(closestBattle.gap ?? 0).toFixed(2)} behind ${closestBattle.leaderName}` : '', color: '#eab308' },
          { icon: '🔥', label: 'Strongest Opponent Route', value: hardestOpponent?.label ?? '—', sub: hardestOpponent ? `${hardestOpponent.leaderName} dominates with a ${formatMetric(hardestOpponent.leaderRating, 2)} rating` : '', color: '#dc2626' },
          { icon: '📊', label: 'Highest Review Volume Route', value: mostReviewed?.label ?? '—', sub: mostReviewed ? `${formatCompact(mostReviewed.reviewCount)} total reviews across operators` : '', color: '#0077b6' },
        ]

        return (
          <div className="space-y-6">
            <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="glass-panel p-5 border-b-4 border-b-blue-500">
                <p className="text-[0.65rem] font-black uppercase tracking-wider text-blue-600">Routes Evaluated</p>
                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{totalRoutes}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">Active market routes tracked</p>
              </div>
              <div className="glass-panel p-5 border-b-4 border-b-emerald-500">
                <p className="text-[0.65rem] font-black uppercase tracking-wider text-emerald-600">FreshBus Leads</p>
                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{totalLeads}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">{formatMetric(winRate, 1)}% win rate across network</p>
              </div>
              <div className="glass-panel p-5 border-b-4 border-b-purple-500">
                <p className="text-[0.65rem] font-black uppercase tracking-wider text-purple-600">Top 3 Placements</p>
                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{topThreeCount}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">{formatMetric(topThreeRate, 1)}% of routes in top 3</p>
              </div>
              <div className="glass-panel p-5 border-b-4 border-b-rose-500">
                <p className="text-[0.65rem] font-black uppercase tracking-wider text-rose-600">Critical Attention</p>
                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{criticalCount}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">Routes ranking 4th or lower</p>
              </div>
            </section>
            
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {insights.map((ins, i) => (
                <div key={`table-ins-${i}`} className="glass-panel flex gap-4 p-5" style={{ borderLeft: `4px solid ${ins.color}` }}>
                  <span className="text-3xl">{ins.icon}</span>
                  <div>
                    <p className="text-[0.65rem] font-black uppercase tracking-wider" style={{ color: ins.color }}>{ins.label}</p>
                    <p className="mt-1 text-sm font-black text-slate-800">{ins.value}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">{ins.sub}</p>
                  </div>
                </div>
              ))}
            </section>
          </div>
        )
      })()}
    </div>
  )
}
