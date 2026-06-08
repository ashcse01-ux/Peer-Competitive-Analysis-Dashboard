import React, { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useReviewClassification } from '../api'
import ChartTooltip from './ChartTooltip'
import SectionHeader from './SectionHeader'
import { tip } from '../lib/metricGlossary'
import { DIMENSION_COLORS } from '../lib/reviewDimensions'
import { formatMetric, operatorColor, cx } from '../lib/insights'

interface Props {
  source: 'google_play' | 'ios_app_store' | 'google_reviews'
  title: string
  selectedSlug?: string | null
}

export default function ReviewClassificationPanel({ source, title, selectedSlug }: Props) {
  const { data, isLoading, isError } = useReviewClassification(source)

  const operators = useMemo(() => {
    const list = data?.operators ?? []
    if (!selectedSlug) return list
    return list.filter(op => op.operator_slug === selectedSlug)
  }, [data, selectedSlug])

  const marketAvg = useMemo(() => {
    const dims = data?.dimensions ?? []
    return dims.map((dim, i) => {
      const scores = operators
        .map(op => op.dimensions.find(d => d.dimension_id === dim.id)?.score)
        .filter((s): s is number => s != null)
      const mentions = operators
        .map(op => op.dimensions.find(d => d.dimension_id === dim.id)?.mention_pct ?? 0)
      const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
      const avgMention = mentions.length ? mentions.reduce((a, b) => a + b, 0) / mentions.length : 0
      return {
        id: dim.id,
        label: dim.label,
        score: Number(avgScore.toFixed(2)),
        mention_pct: Number(avgMention.toFixed(1)),
        fill: DIMENSION_COLORS[i % DIMENSION_COLORS.length],
      }
    })
  }, [data, operators])

  if (isLoading) {
    return <div className="glass-panel p-5 text-sm font-semibold text-theme-muted">Loading review topics…</div>
  }
  if (isError || !data?.operators?.length) {
    return null
  }

  return (
    <section className="glass-panel p-4 sm:p-5">
      <SectionHeader
        eyebrow="Review classification"
        title={`${title} — 15 topic dimensions`}
        subtitle="Reviews grouped by what passengers talk about — no need to read each one."
        eyebrowTip={tip('reviewClassification')}
        titleTip={tip('dimensionScore')}
      />

      <div className="mb-6">
        <p className="mb-3 text-xs font-bold text-theme-muted">Market average by topic (5-point scale)</p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={marketAvg} margin={{ top: 4, right: 8, left: -16, bottom: 60 }}>
            <CartesianGrid className="chart-grid" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-muted)', fontSize: 11, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis domain={[0, 5]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,119,182,0.05)' }} />
            <Bar dataKey="score" name="Score" radius={[4, 4, 0, 0]}>
              {marketAvg.map((entry, i) => (
                <Cell key={entry.id} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {operators.map(op => {
          const color = operatorColor(op.operator_slug)
          const topDims = [...op.dimensions]
            .filter(d => d.mention_count > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
          return (
            <article
              key={op.operator_slug}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="truncate text-sm font-black text-theme-primary">{op.operator_name}</p>
                <span className="text-xs font-bold text-theme-muted">{op.review_count} reviews</span>
              </div>
              <div className="space-y-2.5">
                {topDims.length ? topDims.map(dim => (
                  <div key={dim.dimension_id} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-xs font-bold text-theme-secondary">
                      {dim.label}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--border-subtle)]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(dim.score / 5) * 100}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className={cx(
                      'w-8 text-right text-xs font-black',
                      dim.score >= 4 ? 'text-emerald-600' : dim.score < 3.5 ? 'text-rose-600' : 'text-theme-secondary',
                    )}>
                      {formatMetric(dim.score, 1)}
                    </span>
                  </div>
                )) : (
                  <p className="text-xs text-theme-muted">No classified review topics yet.</p>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {marketAvg.length > 0 && (
        <div className="mt-4 rounded-xl border border-blue-900/10 bg-blue-50/50 p-4">
          <p className="mb-3 text-xs font-black uppercase tracking-wide text-blue-900/60">Topic Analysis & Insights</p>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-bold text-slate-500">Strongest Market Feature</p>
              <p className="mt-1 font-black text-[#14211f]">
                {marketAvg.reduce((max, d) => d.score > max.score ? d : max, marketAvg[0]).label}
              </p>
              <p className="mt-0.5 text-[0.7rem] text-slate-500">Highest average score across all operators</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500">Key Weakness (Opportunity)</p>
              <p className="mt-1 font-black text-rose-600">
                {marketAvg.reduce((min, d) => d.score < min.score && d.score > 0 ? d : min, marketAvg[0]).label}
              </p>
              <p className="mt-0.5 text-[0.7rem] text-slate-500">Lowest average score in the market</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500">Most Talked About</p>
              <p className="mt-1 font-black text-blue-700">
                {marketAvg.reduce((max, d) => d.mention_pct > max.mention_pct ? d : max, marketAvg[0]).label}
              </p>
              <p className="mt-0.5 text-[0.7rem] text-slate-500">Appears in highest percentage of reviews</p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
