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
import { Award, Gauge, Layers3, Map as MapIcon, Sparkles, Target, Trophy, X, Zap } from 'lucide-react'
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
  const tagOperators = tagData?.operators ?? []
  const correlations = tagData?.correlations ?? []
  const insights = tagData?.insights
  const freshbusTags = tagOperators.find(op => op.operator_slug === 'freshbus')
  const tagLeader = tagOperators[0]
  const marketAvg = average(tagOperators.map(op => op.composite_tag_score))

  const cells = routeData?.data ?? []
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

  const activeCells = activeRouteFilter ? cells.filter(c => c.route_id === activeRouteFilter) : cells
  const displayRoutes = activeRouteFilter ? routes.filter(r => r.id === activeRouteFilter) : routes
  const freshbus = operators.find(o => o.slug === 'freshbus' || o.name.toLowerCase().includes('fresh'))
  const freshbusCells = activeCells.filter(c => c.operator_id === freshbus?.id && c.sentiment_score != null)
  const totalReviews = sum(activeCells.map(c => c.review_count))
  const avgSentiment = average(activeCells.map(c => c.sentiment_score))
  const coveragePct = activeCells.length ? Math.round((activeCells.filter(c => c.sentiment_score != null).length / activeCells.length) * 100) : 0
  const topTwoShare = freshbusCells.length
    ? Math.round((freshbusCells.filter(c => (c.competitive_rank ?? 99) <= 2).length / freshbusCells.length) * 100)
    : null

  const barData = tagOperators.map(op => ({
    name: op.operator_name.slice(0, 10),
    score: selectedTag === 'overall' ? op.composite_tag_score : (op.tags.find(item => item.tag_id === selectedTag)?.score ?? 0),
    fill: operatorColor(op.operator_slug),
  })).sort((a, b) => b.score - a.score)

  const radarData = freshbusTags && tagLeader ? tags.map(tag => ({
    tag: tagLabel(tag.id).slice(0, 12),
    freshbus: freshbusTags.tags.find(item => item.tag_id === tag.id)?.score ?? 0,
    leader: tagLeader.tags.find(item => item.tag_id === tag.id)?.score ?? 0,
  })) : []

  const gapData = freshbusTags && tagLeader ? tags.map(tag => {
    const fb = freshbusTags.tags.find(item => item.tag_id === tag.id)?.score ?? 0
    const ld = tagLeader.tags.find(item => item.tag_id === tag.id)?.score ?? 0
    return { tag: tagLabel(tag.id), gap: Number((fb - ld).toFixed(2)) }
  }).sort((a, b) => a.gap - b.gap) : []

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
      <section className="hero-glow glass-panel-strong p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <SectionHeader
              eyebrow="Redbus analysis"
              title="Reviews, tag classification & route-wise breakdown"
              subtitle="Ratings, 9 review tags, and per-route sentiment — all in one place."
              eyebrowTip={tip('redbus')}
              titleTip={tip('reviewClassification')}
            />
          </div>
          <div className="glass-panel p-3">
            <MetricTip tip="Filter to one origin-destination pair" as="label" className="mb-1 block text-xs font-black uppercase text-theme-muted">Route direction</MetricTip>
            <select
              className="h-10 max-w-full rounded-full border border-slate-900/10 bg-white/80 px-3 text-sm font-bold text-[#14211f] outline-none"
              value={activeRouteFilter ?? ''}
              onChange={e => setActiveRouteFilter(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">All directions</option>
              {routes.map(route => <option key={route.id} value={route.id}>{routeLabel(route.origin, route.destination)}</option>)}
            </select>
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
        <div className="border-b border-[var(--border-subtle)] p-4 sm:p-5">
          <SectionHeader
            eyebrow="Operator tag leaderboard"
            title={`All 9 dimensions · Market avg ${formatMetric(marketAvg, 2)}`}
            eyebrowTip={tip('compositeTagScore')}
            titleTip={tip('marketAvg')}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[1100px]">
            <thead>
              <tr>
                <th><MetricTip tip={tip('rank')}>Rank</MetricTip></th>
                <th>Operator</th>
                <th><MetricTip tip={tip('compositeTagScore')}>Composite</MetricTip></th>
                {tags.map(tag => <th key={tag.id}><MetricTip tip={tagLabel(tag.id)}>{tagLabel(tag.id).split(' ')[0]}</MetricTip></th>)}
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
                  <td className="font-black">{formatMetric(op.composite_tag_score, 2)}</td>
                  {op.tags.map(tag => (
                    <td key={tag.tag_id} className={cx('font-bold', tag.score >= 4.2 ? 'text-emerald-500' : tag.score < 3.5 ? 'text-rose-500' : 'text-theme-secondary')}>
                      {formatMetric(tag.score, 1)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard label={t('tags.composite')} value={formatMetric(freshbusTags?.composite_tag_score, 2)} tip={tip('compositeTagScore')} caption={`Rank #${freshbusTags?.rank ?? '—'}`} icon={<Gauge size={20} />} accent="var(--neon-blue)" />
        <KPICard label={t('tags.reviews')} value={tagOperators.reduce((n, o) => n + o.review_count, 0).toLocaleString('en-IN')} tip={tip('taggedReviews')} caption="Tagged reviews" icon={<Layers3 size={20} />} accent="var(--neon-yellow)" />
        <KPICard label={t('tags.strongest')} value={insights?.freshbus_strength ? tagLabel(insights.freshbus_strength) : '—'} tip={tip('strongestDimension')} caption="FreshBus advantage" icon={<Sparkles size={20} />} accent="var(--neon-green)" />
        <KPICard label={t('tags.weakest')} value={insights?.freshbus_gap ? tagLabel(insights.freshbus_gap) : '—'} tip={tip('weakestDimension')} caption="Improvement priority" icon={<Target size={20} />} accent="var(--neon-orange)" />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="glass-panel p-4 sm:p-5">
          <SectionHeader eyebrow={t('tags.operatorCompare')} title={`${selectedTag === 'overall' ? 'Overall composite' : tagLabel(selectedTag)} scores`} titleTip={tip('dimensionScore')} />
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={barData} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 5]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="score" name="Score" radius={[8, 8, 0, 0]}>{barData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-panel p-4 sm:p-5">
          <SectionHeader eyebrow={t('tags.radar')} title={t('tags.freshbusFocus')} titleTip={tip('radar')} trailing={<Award size={20} className="text-[var(--neon-yellow)]" />} />
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke="var(--chart-grid)" />
              <PolarAngleAxis dataKey="tag" tick={{ fill: 'var(--text-muted)', fontSize: 9, fontWeight: 700 }} />
              <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} />
              <Radar name="FreshBus" dataKey="freshbus" stroke="#00d4ff" fill="#00d4ff" fillOpacity={0.2} strokeWidth={2.5} />
              <Radar name={tagLeader?.operator_name ?? 'Leader'} dataKey="leader" stroke="#ffea00" fill="#ffea00" fillOpacity={0.12} strokeWidth={2} />
              <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="glass-panel p-4 sm:p-5">
          <SectionHeader eyebrow={t('tags.correlation')} title={t('tags.correlationDesc')} titleTip={tip('correlation')} />
          <div className="overflow-x-auto">
            <div className="min-w-[520px] grid gap-1" style={{ gridTemplateColumns: `100px repeat(${tagIds.length}, 1fr)` }}>
              <span />
              {tagIds.map(id => <span key={id} className="truncate text-center text-[0.6rem] font-black uppercase text-theme-muted">{tagLabel(id).split(' ')[0]}</span>)}
              {tagIds.map((rowId, ri) => (
                <React.Fragment key={rowId}>
                  <span className="truncate text-[0.65rem] font-black text-theme-secondary">{tagLabel(rowId).split(' ')[0]}</span>
                  {tagIds.map((colId, ci) => {
                    const isDiag = ri === ci
                    const corr = isDiag ? 1 : correlations.find(c => (c.tag_a === rowId && c.tag_b === colId) || (c.tag_a === colId && c.tag_b === rowId))?.correlation ?? 0
                    return <div key={`${rowId}-${colId}`} className="corr-cell flex h-8 items-center justify-center text-[0.65rem] font-black" style={{ background: isDiag ? 'var(--bg-elevated)' : corrColor(corr), opacity: isDiag ? 0.4 : 1 }}>{!isDiag && corr.toFixed(2)}</div>
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
        <div className="glass-panel p-4 sm:p-5">
          <SectionHeader eyebrow={t('tags.gapAnalysis')} title={`FreshBus vs ${tagLeader?.operator_name ?? 'Leader'}`} titleTip={tip('tagGap')} trailing={<Zap size={20} className="text-[var(--neon-pink)]" />} />
          <div className="space-y-2">
            {gapData.map(item => (
              <div key={item.tag} className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                <span className="w-28 shrink-0 truncate text-xs font-black">{item.tag}</span>
                <span className={cx('ml-auto text-xs font-black', item.gap >= 0 ? 'text-emerald-500' : 'text-rose-500')}>{item.gap >= 0 ? '+' : ''}{item.gap.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--border-subtle)] pt-2">
        <SectionHeader eyebrow="Route analysis" title="Route-level sentiment, volume & FreshBus gaps" titleTip={tip('redbus')} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard label="Tracked Routes" value={routes.length} tip={tip('trackedRoutes')} caption={`${coveragePct}% coverage`} icon={<MapIcon size={20} />} accent="#0077b6" />
        <KPICard label="Total Reviews" value={formatCompact(totalReviews)} tip={tip('reviewVolume')} caption="Route review volume" icon={<Layers3 size={20} />} accent="#00a676" />
        <KPICard label="Avg Sentiment" value={formatMetric(avgSentiment, 2)} tip={tip('sentiment')} caption="All route cells" icon={<Gauge size={20} />} accent="#ffb000" />
        <KPICard label="FreshBus Top-2" value={topTwoShare} unit={topTwoShare != null ? '%' : ''} tip={tip('topTwo')} caption="Rank 1 or 2 routes" icon={<Trophy size={20} />} accent="#f45d48" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="glass-panel p-4 sm:p-5">
          <SectionHeader eyebrow="Sentiment heatmap" title="Route by operator score" titleTip={tip('heatmap')} subtitle="Click any cell for route drill-down" />
          <div className="overflow-x-auto">
            <div className="min-w-[780px] space-y-2">
              <div className="grid items-center gap-2" style={{ gridTemplateColumns: `210px repeat(${operators.length}, minmax(68px, 1fr))` }}>
                <span />
                {operators.map(op => <span key={op.id} className="truncate text-center text-[0.68rem] font-black uppercase text-slate-400">{op.name}</span>)}
              </div>
              {displayRoutes.map(route => (
                <div key={route.id} className="grid items-center gap-2" style={{ gridTemplateColumns: `210px repeat(${operators.length}, minmax(68px, 1fr))` }}>
                  <span className="truncate text-xs font-black text-slate-600">{routeLabel(route.origin, route.destination)}</span>
                  {operators.map(operator => {
                    const cell = activeCells.find(item => item.route_id === route.id && item.operator_id === operator.id)
                    return <HeatmapCell key={operator.id} value={cell?.sentiment_score ?? null} width={68} height={30} showValue label={`${operator.name} ${routeLabel(route.origin, route.destination)}`} onClick={() => setDrillRouteId(route.id)} />
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="glass-panel p-4 sm:p-5">
          <SectionHeader eyebrow="Operator strength" title="Average sentiment and rank" titleTip={tip('sentiment')} />
          <div className="space-y-3">
            {operatorScores.map(operator => (
              <div key={operator.id} className="border-b border-slate-900/10 pb-3 last:border-b-0">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-black">{operator.name}</p>
                  <span className="text-xs font-black text-slate-500">Avg rank {formatMetric(operator.avgRank, 1)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-900/5">
                  <div className="h-full rounded-full" style={{ width: `${operator.avgSentiment == null ? 0 : ((operator.avgSentiment + 1) / 2) * 100}%`, backgroundColor: operator.color }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4">
            <p className="text-sm font-black">{sentimentLeader?.name ?? 'No data'}</p>
            <p className="text-xs font-bold text-emerald-700">{formatMetric(sentimentLeader?.avgSentiment, 2)} avg route sentiment</p>
          </div>
        </div>
      </section>

      <section className="glass-panel p-4 sm:p-5">
        <SectionHeader eyebrow="Route spread" title="Scores by direction" titleTip={tip('sentiment')} />
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={barRouteData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid className="chart-grid" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#64706d', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
            <YAxis domain={[-1, 1]} tick={{ fill: '#64706d', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
            {operators.map(operator => <Bar key={operator.id} dataKey={operator.name} name={operator.name} fill={operator.color} radius={[5, 5, 0, 0]} />)}
          </BarChart>
        </ResponsiveContainer>
      </section>

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
        <div className="flex flex-col gap-3 border-b border-slate-900/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <SectionHeader eyebrow="FreshBus route table" title="Rank, leader gap & review pressure" titleTip={tip('leaderGap')} />
          <div className="flex gap-2">
            {(['rank', 'sentiment', 'route'] as SortKey[]).map(key => (
              <button key={key} type="button" onClick={() => setSortKey(key)} className={cx('control-chip px-3 text-xs font-black', sortKey === key && 'control-chip-active')}>{key}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[940px]">
            <thead>
              <tr>
                <th>Route</th>
                <th><MetricTip tip={tip('competitiveRank')}>FreshBus Rank</MetricTip></th>
                <th>FreshBus Rating</th>
                <th>Route Leader</th>
                <th>Leader Rating</th>
                <th><MetricTip tip={tip('sentiment')}>Sentiment</MetricTip></th>
                <th><MetricTip tip={tip('leaderGap')}>Leader Gap</MetricTip></th>
                <th>Count of Avg Rating</th>
              </tr>
            </thead>
            <tbody>
              {sortedRouteRows.map(row => (
                <tr key={row.route_id}>
                  <td className="font-black">{row.label}</td>
                  <td><span className={cx('rounded-full px-2.5 py-1 text-xs font-black', rankClass(row.freshRank))}>{row.freshRank != null ? `#${row.freshRank}` : '—'}</span></td>
                  <td className="font-black text-theme-primary">{row.freshRating ? formatMetric(row.freshRating, 2) : '—'}</td>
                  <td>{row.leaderName}</td>
                  <td className="font-black text-theme-primary">{row.leaderRating ? formatMetric(row.leaderRating, 2) : '—'}</td>
                  <td className="font-black text-theme-secondary">{formatMetric(row.freshSentiment, 2)}</td>
                  <td className={cx('font-black', (row.gap ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{row.gap != null ? (row.gap >= 0 ? '+' : '') + formatMetric(row.gap, 2) : '—'}</td>
                  <td>{formatCompact(row.reviewCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-panel p-4 sm:p-5">
        <SectionHeader eyebrow="Action focus" title="Highest-pressure FreshBus routes" titleTip={tip('actionFocus')} trailing={<Target size={20} className="text-[#f45d48]" />} />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {sortedRouteRows.filter(r => r.gap != null).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0)).slice(0, 3).map(row => (
            <article key={row.route_id} className="rounded-lg border border-slate-900/10 bg-white/60 p-4">
              <p className="text-sm font-black">{row.label}</p>
              <p className="mt-2 text-2xl font-black text-rose-700">{formatMetric(row.gap, 2)}</p>
              <p className="mt-1 text-xs text-slate-500">Leader: {row.leaderName}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
