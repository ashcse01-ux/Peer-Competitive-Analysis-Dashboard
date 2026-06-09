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
import { Activity, Apple, Gauge, MessageSquare, Star, TrendingUp } from 'lucide-react'
import { useAppStore, useHistory, useTopReviews, type AppStoreEntry } from '../api'
import ChartTooltip from '../components/ChartTooltip'
import HeatmapCell from '../components/HeatmapCell'
import KPICard from '../components/KPICard'
import ReviewClassificationPanel from '../components/ReviewClassificationPanel'
import SectionHeader from '../components/SectionHeader'
import { tip } from '../lib/metricGlossary'
import {
  average,
  cx,
  formatDelta,
  formatMetric,
  formatStarRating,
  getInitials,
  latestTimestamp,
  operatorColor,
} from '../lib/insights'

const SOURCE = 'ios_app_store'

function iosEntries(entries: AppStoreEntry[]) {
  return entries.filter(e => e.source === SOURCE)
}

function summarize(entries: AppStoreEntry[]) {
  const slugs = [...new Set(entries.map(e => e.operator_slug))]
  const summaries = slugs.map(slug => {
    const row = entries.find(e => e.operator_slug === slug)
    return {
      slug,
      name: row?.operator_name ?? slug,
      color: operatorColor(slug),
      rating: row?.overall_rating,
      sentiment: row?.sentiment_score,
      momentum: row?.rating_delta_mom,
      downloads: row?.downloads,
      reviewCount: row?.review_count,
      isStale: row?.is_stale ?? false,
    }
  })
  const leaderRating = Math.max(...summaries.map(s => s.rating ?? 0))
  return summaries.map(s => ({
    ...s,
    gap: s.rating != null ? s.rating - leaderRating : null,
  }))
}

export default function AppleStorePage() {
  const [selectedOp, setSelectedOp] = useState<string | null>(null)
  const { data: appData, isLoading, isError } = useAppStore()
  const { data: iosHistory } = useHistory(SOURCE)
  const entries = iosEntries(appData?.data ?? [])
  const summaries = useMemo(() => summarize(entries), [entries])
  const activeSlug = selectedOp ?? summaries[0]?.slug ?? null
  const { data: reviews } = useTopReviews(activeSlug ?? undefined, SOURCE)

  if (isLoading) return <div className="glass-panel p-6 text-sm font-semibold text-slate-600 dark:text-slate-400">Loading iOS App Store metrics…</div>
  if (isError) return <div className="glass-panel p-6 text-sm font-semibold text-rose-600">Apple App Store data could not be loaded.</div>

  const visible = selectedOp ? summaries.filter(s => s.slug === selectedOp) : summaries
  const avgRating = average(summaries.map(s => s.rating))
  const best = [...summaries].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0]
  const moodLeader = [...summaries].sort((a, b) => (b.sentiment ?? -2) - (a.sentiment ?? -2))[0]
  const totalReviews = summaries.reduce((n, s) => n + (s.reviewCount ?? 0), 0)
  const lastUpdated = latestTimestamp(entries.map(e => e.cycle_timestamp))

  const ratingBarData = summaries.map(s => ({ name: s.name, rating: s.rating }))
  const months = [...new Set((iosHistory?.series ?? []).map(s => s.month))].sort()
  const trendData = months.map(month => {
    const row: Record<string, string | number | null> = { month: month.slice(0, 7) }
    summaries.forEach(s => {
      const pt = iosHistory?.series.find(x => x.operator_slug === s.slug && x.month === month)
      row[s.slug] = pt?.avg_sentiment ?? null
    })
    return row
  })
  const heatMonths = months.slice(-12)
  const activeName = summaries.find(s => s.slug === activeSlug)?.name

  return (
    <div className="page-section">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <SectionHeader
            eyebrow="iOS App Reviews"
            title="iOS app ratings, reviews & topic classification"
            subtitle="Same 15 review topics as Android — compare iOS passenger voice."
            eyebrowTip={tip('appleStore')}
            titleTip={tip('reviewClassification')}
          />
        </div>
        <span className="control-chip inline-flex items-center gap-2 px-4 text-sm font-bold">
          <Activity size={16} />
          {lastUpdated ?? 'Awaiting monthly refresh'}
        </span>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KPICard label="Average Rating" value={formatStarRating(avgRating)} tip={tip('avgRating')} caption="All operators" icon={<Star size={20} />} accent="#16A34A" />
        <KPICard label="Highest Rated" value={best?.name ?? null} tip={tip('rank')} caption={formatStarRating(best?.rating)} icon={<Gauge size={20} />} accent="#2563EB" />
        <KPICard label="Best Review Mood" value={moodLeader?.name ?? null} tip={tip('mood')} caption={formatMetric(moodLeader?.sentiment, 2)} icon={<TrendingUp size={20} />} accent="#F97316" />
      </section>

      <section className="glass-panel p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSelectedOp(null)} className={cx('control-chip px-4 text-sm font-black', !selectedOp && 'control-chip-active')}>All</button>
          {summaries.map(s => (
            <button key={s.slug} type="button" onClick={() => setSelectedOp(s.slug === selectedOp ? null : s.slug)} className={cx('control-chip inline-flex items-center gap-2 px-4 text-sm font-black', selectedOp === s.slug && 'control-chip-active')}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(s => (
            <article key={s.slug} className="rounded-lg border border-slate-900/10 bg-white/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="truncate text-sm font-black text-theme-primary">{s.name}</p>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ backgroundColor: s.color }}>{getInitials(s.name)}</span>
              </div>
              {s.downloads && <p className="mt-1 text-xs font-bold text-slate-600 dark:text-slate-400">{s.downloads} downloads</p>}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-lg font-black">{formatMetric(s.rating, 2)}</p><p className="text-[0.68rem] font-bold uppercase text-slate-600 dark:text-slate-400">Rating</p></div>
                <div><p className="text-lg font-black">{formatMetric(s.sentiment, 2)}</p><p className="text-[0.68rem] font-bold uppercase text-slate-600 dark:text-slate-400">Mood</p></div>
                <div><p className={cx('text-lg font-black', (s.gap ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{formatDelta(s.gap) ?? '—'}</p><p className="text-[0.68rem] font-bold uppercase text-slate-600 dark:text-slate-400">Gap</p></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <ReviewClassificationPanel source={SOURCE} title="Apple App Store" selectedSlug={selectedOp} />

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="glass-panel p-4 sm:p-5">
          <SectionHeader eyebrow="Ratings" title="Apple App Store leaderboard" titleTip={tip('avgRating')} />
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ratingBarData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 5]} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="rating" name="Rating" fill="#16A34A" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-panel p-4 sm:p-5">
          <SectionHeader eyebrow="Trend" title="Monthly review mood" titleTip={tip('mood')} />
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[-1, 1]} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
              {summaries.map(s => (
                <Line key={s.slug} type="monotone" dataKey={s.slug} name={s.name} stroke={s.color} strokeWidth={2.5} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-1">
        <div className="glass-panel p-4 sm:p-5">
          <SectionHeader eyebrow="Heatmap" title="Last 12 months rating" titleTip={tip('heatmap')} />
          <div className="overflow-x-auto">
            <div className="min-w-[760px] space-y-2">
              <div className="grid items-center gap-2" style={{ gridTemplateColumns: `170px repeat(${heatMonths.length}, minmax(54px, 1fr))` }}>
                <span />
                {heatMonths.map(m => <span key={m} className="text-center text-[0.68rem] font-black uppercase text-theme-primary">{m.slice(0, 7)}</span>)}
              </div>
              {visible.map(s => (
                <div key={s.slug} className="grid items-center gap-2" style={{ gridTemplateColumns: `170px repeat(${heatMonths.length}, minmax(54px, 1fr))` }}>
                  <span className="truncate text-xs font-black text-theme-primary">{s.name}</span>
                  {heatMonths.map(m => {
                    const pt = iosHistory?.series.find(x => x.operator_slug === s.slug && x.month === m)
                    return <HeatmapCell key={m} value={pt?.avg_rating ?? null} min={1} max={5} width={58} height={28} showValue />
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
