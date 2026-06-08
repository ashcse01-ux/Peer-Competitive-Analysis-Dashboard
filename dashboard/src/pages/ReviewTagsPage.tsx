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
import { Award, Gauge, Layers3, Sparkles, Target, TrendingUp, Zap } from 'lucide-react'
import { useRedbusTags } from '../api'
import ChartTooltip from '../components/ChartTooltip'
import KPICard from '../components/KPICard'
import { useTranslation } from '../i18n/useTranslation'
import {
  operatorColor,
  TAG_COLORS,
  average,
  cx,
  formatMetric,
  getInitials,
} from '../lib/insights'

function corrColor(value: number): string {
  if (value >= 0.6) return 'rgba(0, 212, 255, 0.85)'
  if (value >= 0.4) return 'rgba(0, 119, 255, 0.65)'
  if (value >= 0.2) return 'rgba(255, 234, 0, 0.55)'
  return 'rgba(255, 107, 53, 0.45)'
}

export default function ReviewTagsPage() {
  const { data, isLoading, isError } = useRedbusTags()
  const { t, tagLabel } = useTranslation()
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  const operators = data?.operators ?? []
  const tags = data?.tags ?? []
  const correlations = data?.correlations ?? []
  const insights = data?.insights

  const freshbus = operators.find(op => op.operator_slug === 'freshbus')
  const leader = operators[0]
  const marketAvg = average(operators.map(op => op.composite_tag_score))

  const radarData = useMemo(() => {
    if (!freshbus || !leader) return []
    return tags.map(tag => ({
      tag: tagLabel(tag.id).slice(0, 12),
      freshbus: freshbus.tags.find(item => item.tag_id === tag.id)?.score ?? 0,
      leader: leader.tags.find(item => item.tag_id === tag.id)?.score ?? 0,
    }))
  }, [freshbus, leader, tags, tagLabel])

  const barData = useMemo(() => {
    const activeTag = selectedTag ?? tags[0]?.id
    return operators.map((op) => ({
      name: op.operator_name.slice(0, 10),
      score: op.tags.find(item => item.tag_id === activeTag)?.score ?? 0,
      fill: operatorColor(op.operator_slug),
    }))
  }, [operators, selectedTag, tags])

  const gapData = useMemo(() => {
    if (!freshbus || !leader) return []
    return tags.map(tag => {
      const fb = freshbus.tags.find(item => item.tag_id === tag.id)?.score ?? 0
      const ld = leader.tags.find(item => item.tag_id === tag.id)?.score ?? 0
      return {
        tag: tagLabel(tag.id),
        gap: Number((fb - ld).toFixed(2)),
        freshbus: fb,
        leader: ld,
      }
    }).sort((a, b) => a.gap - b.gap)
  }, [freshbus, leader, tags, tagLabel])

  const tagIds = tags.map(t => t.id)

  if (isLoading) {
    return <div className="glass-panel p-6 text-sm font-semibold text-theme-muted">{t('common.loading')}</div>
  }
  if (isError) {
    return <div className="glass-panel p-6 text-sm font-semibold text-rose-500">Review tag data could not be loaded.</div>
  }

  const freshbusRank = freshbus?.rank ?? null
  const totalReviews = operators.reduce((sum, op) => sum + (op.review_count ?? 0), 0)
  const strongestTag = insights?.freshbus_strength
  const weakestTag = insights?.freshbus_gap

  return (
    <div className="space-y-7">
      <section className="hero-glow glass-panel-strong p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="eyebrow flex items-center gap-2">
              <Sparkles size={14} className="text-[var(--neon-blue)]" />
              {t('tags.eyebrow')}
            </p>
            <h1 className="page-title mt-2 text-3xl font-black tracking-tight sm:text-5xl">
              <span className="neon-text">{t('tags.title')}</span>
            </h1>
            <p className="mt-3 text-sm font-semibold text-theme-secondary">
              Toilet Cleanliness · Punctuality · Staff Behavior · Cleanliness · Seat Comfort · Driving · Rest Stop Hygiene · Live Tracking · AC
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, i) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => setSelectedTag(tag.id)}
                className={cx('tag-pill', (selectedTag ?? tags[0]?.id) === tag.id && 'tag-pill-active')}
                style={{ borderColor: (selectedTag ?? tags[0]?.id) === tag.id ? TAG_COLORS[i % TAG_COLORS.length] : undefined }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: TAG_COLORS[i % TAG_COLORS.length] }} />
                {tagLabel(tag.id)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label={t('tags.composite')}
          value={formatMetric(freshbus?.composite_tag_score, 2)}
          caption={`${t('tags.rank')} #${freshbusRank ?? '—'}`}
          icon={<Gauge size={20} />}
          accent="var(--neon-blue)"
        />
        <KPICard
          label={t('tags.reviews')}
          value={totalReviews.toLocaleString('en-IN')}
          caption="Across all operators"
          icon={<Layers3 size={20} />}
          accent="var(--neon-yellow)"
        />
        <KPICard
          label={t('tags.strongest')}
          value={strongestTag ? tagLabel(strongestTag) : '—'}
          caption="FreshBus advantage"
          icon={<TrendingUp size={20} />}
          accent="var(--neon-green)"
        />
        <KPICard
          label={t('tags.weakest')}
          value={weakestTag ? tagLabel(weakestTag) : '—'}
          caption="Improvement priority"
          icon={<Target size={20} />}
          accent="var(--neon-orange)"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4">
            <p className="eyebrow">{t('tags.operatorCompare')}</p>
            <h2 className="section-title">
              {selectedTag ? tagLabel(selectedTag) : tagLabel(tags[0]?.id ?? '')} — 5-point scale
            </h2>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={barData} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 5]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,212,255,0.06)' }} />
              <Bar dataKey="score" name="Score" radius={[8, 8, 0, 0]}>
                {barData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="eyebrow">{t('tags.radar')}</p>
              <h2 className="section-title">{t('tags.freshbusFocus')}</h2>
            </div>
            <Award size={20} className="text-[var(--neon-yellow)]" />
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke="var(--chart-grid)" />
              <PolarAngleAxis dataKey="tag" tick={{ fill: 'var(--text-muted)', fontSize: 9, fontWeight: 700 }} />
              <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} />
              <Radar name="FreshBus" dataKey="freshbus" stroke="#00d4ff" fill="#00d4ff" fillOpacity={0.2} strokeWidth={2.5} />
              <Radar name={leader?.operator_name ?? 'Leader'} dataKey="leader" stroke="#ffea00" fill="#ffea00" fillOpacity={0.12} strokeWidth={2} />
              <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4">
            <p className="eyebrow">{t('tags.correlation')}</p>
            <h2 className="section-title">{t('tags.correlationDesc')}</h2>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="grid gap-1" style={{ gridTemplateColumns: `100px repeat(${tagIds.length}, 1fr)` }}>
                <span />
                {tagIds.map(id => (
                  <span key={id} className="truncate text-center text-[0.6rem] font-black uppercase text-theme-muted" title={tagLabel(id)}>
                    {tagLabel(id).split(' ')[0]}
                  </span>
                ))}
                {tagIds.map((rowId, ri) => (
                  <React.Fragment key={rowId}>
                    <span className="truncate text-[0.65rem] font-black text-theme-secondary" title={tagLabel(rowId)}>
                      {tagLabel(rowId).split(' ')[0]}
                    </span>
                    {tagIds.map((colId, ci) => {
                      const isDiag = ri === ci
                      const corr = isDiag
                        ? 1
                        : correlations.find(c =>
                            (c.tag_a === rowId && c.tag_b === colId) ||
                            (c.tag_a === colId && c.tag_b === rowId),
                          )?.correlation ?? 0
                      return (
                        <div
                          key={`${rowId}-${colId}`}
                          className="corr-cell flex h-8 items-center justify-center text-[0.65rem] font-black"
                          style={{
                            background: isDiag ? 'var(--bg-elevated)' : corrColor(corr),
                            color: corr > 0.5 && !isDiag ? '#070b1a' : 'var(--text-muted)',
                            opacity: isDiag ? 0.4 : 1,
                          }}
                          title={`${tagLabel(rowId)} × ${tagLabel(colId)}: ${corr.toFixed(2)}`}
                        >
                          {!isDiag && corr.toFixed(2)}
                        </div>
                      )
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-bold text-theme-muted">
            <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded" style={{ background: corrColor(0.7) }} /> Strong (+0.6)</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded" style={{ background: corrColor(0.45) }} /> Moderate</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded" style={{ background: corrColor(0.25) }} /> Weak</span>
          </div>
        </div>

        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="eyebrow">{t('tags.gapAnalysis')}</p>
              <h2 className="section-title">FreshBus vs {leader?.operator_name ?? 'Leader'}</h2>
            </div>
            <Zap size={20} className="text-[var(--neon-pink)]" />
          </div>
          <div className="space-y-2">
            {gapData.map(item => (
              <div key={item.tag} className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                <span className="w-28 shrink-0 truncate text-xs font-black text-theme-primary">{item.tag}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--border-subtle)]">
                  <div
                    className="absolute top-0 h-full rounded-full transition-all"
                    style={{
                      left: item.gap < 0 ? `${50 + item.gap * 10}%` : '50%',
                      width: `${Math.abs(item.gap) * 10}%`,
                      background: item.gap >= 0
                        ? 'linear-gradient(90deg, #00d4ff, #39ff14)'
                        : 'linear-gradient(90deg, #ff6b35, #ff3d9a)',
                    }}
                  />
                  <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-[var(--text-muted)] opacity-40" />
                </div>
                <span className={cx('w-12 text-right text-xs font-black', item.gap >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                  {item.gap >= 0 ? '+' : ''}{item.gap.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="glass-panel overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] p-4 sm:p-5">
          <p className="eyebrow">Operator tag leaderboard</p>
          <h2 className="section-title">All 9 dimensions · Market avg {formatMetric(marketAvg, 2)}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[1100px]">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Operator</th>
                <th>Composite</th>
                {tags.map(tag => (
                  <th key={tag.id} title={tagLabel(tag.id)}>{tagLabel(tag.id).split(' ')[0]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {operators.map((op) => {
                const color = operatorColor(op.operator_slug)
                return (
                  <tr key={op.operator_slug}>
                    <td className="font-black text-[var(--neon-blue)]">#{op.rank}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: color }}>
                          {getInitials(op.operator_name)}
                        </span>
                        <span className="font-black text-theme-primary">{op.operator_name}</span>
                      </div>
                    </td>
                    <td className="font-black text-theme-primary">{formatMetric(op.composite_tag_score, 2)}</td>
                    {op.tags.map(tag => (
                      <td key={tag.tag_id} className={cx(
                        'font-bold',
                        tag.score >= 4.2 ? 'text-emerald-500' : tag.score < 3.5 ? 'text-rose-500' : 'text-theme-secondary',
                      )}>
                        {formatMetric(tag.score, 1)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
