import React, { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, Gauge, Layers3, MessageSquare, Smartphone, Star, TrendingUp } from 'lucide-react'
import { useAppStore, useHistory, useTopReviews, type AppStoreEntry } from '../api'
import ChartTooltip from '../components/ChartTooltip'
import HeatmapCell from '../components/HeatmapCell'
import KPICard from '../components/KPICard'
import {
  average,
  cx,
  formatDelta,
  formatMetric,
  formatStarRating,
  getInitials,
  latestTimestamp,
  operatorColor,
  sourceLabel,
} from '../lib/insights'

const SOURCES = ['google_play', 'ios_app_store']

function summarize(entries: AppStoreEntry[]) {
  const slugs = [...new Set(entries.map(entry => entry.operator_slug))]
  return slugs.map((slug) => {
    const rows = entries.filter(entry => entry.operator_slug === slug)
    const gp = rows.find(entry => entry.source === 'google_play')
    const ios = rows.find(entry => entry.source === 'ios_app_store')
    const avgRating = average([gp?.overall_rating, ios?.overall_rating])
    const avgSentiment = average(rows.map(row => row.sentiment_score))
    const avgPositive = average(rows.map(row => row.positive_review_ratio))
    const momentum = average(rows.map(row => row.rating_delta_mom))
    const platformGap = gp?.overall_rating != null && ios?.overall_rating != null
      ? Math.abs(gp.overall_rating - ios.overall_rating)
      : null

    return {
      slug,
      name: rows[0]?.operator_name ?? slug,
      color: operatorColor(slug),
      gp,
      ios,
      rows,
      avgRating,
      avgSentiment,
      avgPositive,
      momentum,
      platformGap,
      coverage: rows.length,
      isStale: rows.some(row => row.is_stale),
    }
  })
}

export default function AppStorePage() {
  const [selectedOp, setSelectedOp] = useState<string | null>(null)
  const { data: appData, isLoading, isError } = useAppStore()
  const { data: gpHistory } = useHistory('google_play')
  const { data: iosHistory } = useHistory('ios_app_store')

  const entries = appData?.data ?? []
  const summaries = useMemo(() => summarize(entries), [entries])
  const activeSlug = selectedOp ?? summaries[0]?.slug ?? null
  const { data: reviews } = useTopReviews(activeSlug ?? undefined)

  if (isLoading) return <div className="glass-panel p-6 text-sm font-semibold text-slate-500">Loading app store metrics...</div>
  if (isError) return <div className="glass-panel p-6 text-sm font-semibold text-rose-600">App store data could not be loaded.</div>

  const activeSummary = summaries.find(summary => summary.slug === activeSlug)
  const avgRating = average(summaries.map(summary => summary.avgRating))
  const bestRating = [...summaries].sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))[0]
  const sentimentLeader = [...summaries].sort((a, b) => (b.avgSentiment ?? -2) - (a.avgSentiment ?? -2))[0]
  const parityGap = average(summaries.map(summary => summary.platformGap))
  const coveragePct = summaries.length ? Math.round((entries.length / (summaries.length * SOURCES.length)) * 100) : 0
  const lastUpdated = latestTimestamp(entries.map(entry => entry.cycle_timestamp))

  const ratingBarData = summaries.map(summary => ({
    name: summary.name,
    'Google Play': summary.gp?.overall_rating ?? null,
    'iOS Store': summary.ios?.overall_rating ?? null,
  }))

  const allMonths = [...new Set([
    ...(gpHistory?.series ?? []).map(series => series.month),
    ...(iosHistory?.series ?? []).map(series => series.month),
  ])].sort()

  const trendData = allMonths.map(month => {
    const row: Record<string, string | number | null> = { month: month.slice(0, 7) }
    summaries.forEach(summary => {
      const gp = gpHistory?.series.find(series => series.operator_slug === summary.slug && series.month === month)
      const ios = iosHistory?.series.find(series => series.operator_slug === summary.slug && series.month === month)
      row[summary.slug] = average([gp?.avg_sentiment, ios?.avg_sentiment])
    })
    return row
  })

  const heatMonths = allMonths.slice(-12)
  const visibleSummaries = selectedOp ? summaries.filter(summary => summary.slug === selectedOp) : summaries

  return (
    <div className="page-section">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="eyebrow">Mobile app ratings</p>
          <h1 className="page-title mt-2 text-xl sm:text-2xl">
            Google Play Store & Apple App Store — ratings and reviews
          </h1>
          <p className="chart-subtitle">Compare star ratings and review mood across every bus operator app.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="control-chip control-chip-active inline-flex items-center gap-2 px-4 text-sm font-black">
            <Smartphone size={16} />
            {coveragePct}% platform coverage
          </span>
          <span className="control-chip inline-flex items-center gap-2 px-4 text-sm font-bold">
            <Activity size={16} />
            {lastUpdated ?? 'Refresh pending'}
          </span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard label="Average App Rating" value={formatStarRating(avgRating)} caption="Google Play + Apple" icon={<Star size={20} />} accent="#2563EB" />
        <KPICard label="Highest Rated App" value={bestRating?.name ?? null} caption={formatStarRating(bestRating?.avgRating)} icon={<Gauge size={20} />} accent="#16A34A" />
        <KPICard label="Play vs Apple Gap" value={formatMetric(parityGap, 2)} caption="Smaller gap = more consistent" icon={<Layers3 size={20} />} accent="#9333EA" />
        <KPICard label="Best Review Mood" value={sentimentLeader?.name ?? null} caption={formatMetric(sentimentLeader?.avgSentiment, 2)} icon={<TrendingUp size={20} />} accent="#F97316" />
      </section>

      <section className="glass-panel p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="eyebrow">Operator lens</p>
            <h2 className="section-title">Storefront health cards</h2>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedOp(null)}
              className={cx('control-chip inline-flex shrink-0 items-center px-4 text-sm font-black', selectedOp === null && 'control-chip-active')}
            >
              All
            </button>
            {summaries.map(summary => (
              <button
                key={summary.slug}
                type="button"
                onClick={() => setSelectedOp(selectedOp === summary.slug ? null : summary.slug)}
                className={cx('control-chip inline-flex shrink-0 items-center gap-2 px-4 text-sm font-black', selectedOp === summary.slug && 'control-chip-active')}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: summary.color }} />
                {summary.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleSummaries.map(summary => (
            <article key={summary.slug} className="rounded-lg border border-slate-900/10 bg-white/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#14211f]">{summary.name}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {summary.coverage}/2 platforms - {summary.isStale ? 'stale source' : 'fresh source'}
                  </p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ backgroundColor: summary.color }}>
                  {getInitials(summary.name)}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-black text-[#14211f]">{formatMetric(summary.avgRating, 2)}</p>
                  <p className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-400">Rating</p>
                </div>
                <div>
                  <p className="text-lg font-black text-[#14211f]">{formatMetric(summary.avgSentiment, 2)}</p>
                  <p className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-400">Mood</p>
                </div>
                <div>
                  <p className="text-lg font-black text-[#14211f]">{formatMetric(summary.platformGap, 2)}</p>
                  <p className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-400">Gap</p>
                </div>
                <div>
                  <p className={cx('text-lg font-black', (summary.momentum ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                    {formatDelta(summary.momentum) ?? 'No'}
                  </p>
                  <p className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-400">MoM</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4">
            <p className="eyebrow">Platform comparison</p>
            <h2 className="section-title">Google Play Store vs Apple App Store</h2>
            <p className="chart-subtitle">Side-by-side star ratings (1–5) for each operator.</p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={ratingBarData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#64706d', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 5]} tick={{ fill: '#64706d', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,119,182,0.05)' }} />
              <Legend wrapperStyle={{ color: '#50615d', fontSize: 12, fontWeight: 700 }} />
              <Bar dataKey="Google Play" name="Google Play Store" fill="#2563EB" radius={[5, 5, 0, 0]} />
              <Bar dataKey="iOS Store" name="Apple App Store" fill="#16A34A" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4">
            <p className="eyebrow">Blended sentiment</p>
            <h2 className="section-title">Monthly store mood</h2>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={trendData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#64706d', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[-1, 1]} tick={{ fill: '#64706d', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ color: '#50615d', fontSize: 11, fontWeight: 700 }} />
              {summaries.map(summary => (
                <Line
                  key={summary.slug}
                  type="monotone"
                  dataKey={summary.slug}
                  name={summary.name}
                  stroke={summary.color}
                  strokeWidth={selectedOp === summary.slug || !selectedOp ? 2.5 : 1.4}
                  strokeOpacity={selectedOp && selectedOp !== summary.slug ? 0.18 : 1}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4">
            <p className="eyebrow">Heatmap</p>
            <h2 className="section-title">Last 12 months store sentiment</h2>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[760px] space-y-2">
              <div className="grid items-center gap-2" style={{ gridTemplateColumns: `170px repeat(${heatMonths.length}, minmax(54px, 1fr))` }}>
                <span />
                {heatMonths.map(month => (
                  <span key={month} className="text-center text-[0.68rem] font-black uppercase tracking-wide text-slate-400">{month.slice(0, 7)}</span>
                ))}
              </div>
              {visibleSummaries.map(summary => (
                <div key={summary.slug} className="grid items-center gap-2" style={{ gridTemplateColumns: `170px repeat(${heatMonths.length}, minmax(54px, 1fr))` }}>
                  <span className="truncate text-xs font-black text-slate-600">{summary.name}</span>
                  {heatMonths.map(month => {
                    const gp = gpHistory?.series.find(series => series.operator_slug === summary.slug && series.month === month)
                    const ios = iosHistory?.series.find(series => series.operator_slug === summary.slug && series.month === month)
                    return (
                      <HeatmapCell
                        key={month}
                        value={average([gp?.avg_sentiment, ios?.avg_sentiment])}
                        width={58}
                        height={28}
                        showValue
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Review voice</p>
              <h2 className="section-title">{activeSummary?.name ?? 'Operator'} excerpts</h2>
            </div>
            <MessageSquare size={20} className="text-[#0077b6]" />
          </div>
          <div className="space-y-5">
            {SOURCES.map(source => {
              const group = reviews?.reviews.find(review => review.operator_slug === activeSlug && review.source === source)
              return (
                <div key={source}>
                  <div className="mb-2 flex items-center justify-between border-b border-slate-900/10 pb-2">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">{sourceLabel(source)}</p>
                    <span className="text-xs font-bold text-slate-400">{(group?.top_positive.length ?? 0) + (group?.top_negative.length ?? 0)} notes</span>
                  </div>
                  {group ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-xs font-black text-emerald-700">Positive</p>
                        {group.top_positive.slice(0, 3).map((review, index) => (
                          <p key={index} className="border-b border-slate-900/10 pb-2 text-xs font-semibold leading-5 text-slate-600 last:border-b-0">{review.text}</p>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-black text-rose-700">Negative</p>
                        {group.top_negative.slice(0, 3).map((review, index) => (
                          <p key={index} className="border-b border-slate-900/10 pb-2 text-xs font-semibold leading-5 text-slate-600 last:border-b-0">{review.text}</p>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-slate-400">No review excerpts available.</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
