import React, { FormEvent, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, AlertTriangle, Calendar, Gauge, Search, Star, TrendingUp, X } from 'lucide-react'
import { useGoogleReviews, useHistory, type GoogleEntry } from '../api'
import ChartTooltip from '../components/ChartTooltip'
import HeatmapCell from '../components/HeatmapCell'
import KPICard from '../components/KPICard'
import ReviewClassificationPanel from '../components/ReviewClassificationPanel'
import SectionHeader from '../components/SectionHeader'
import { tip } from '../lib/metricGlossary'
import {
  operatorColor,
  average,
  cx,
  formatDelta,
  formatMetric,
  getInitials,
  latestTimestamp,
} from '../lib/insights'

export default function GooglePage() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [appliedFrom, setAppliedFrom] = useState<string | undefined>()
  const [appliedTo, setAppliedTo] = useState<string | undefined>()
  const [prevData, setPrevData] = useState<{ data: GoogleEntry[] } | null>(null)
  const [selectedOp, setSelectedOp] = useState<string | null>(null)

  const { data: googleData, isError, isLoading } = useGoogleReviews(appliedFrom, appliedTo)
  const { data: history } = useHistory('google_reviews')

  const displayData = isError ? prevData : (googleData ?? prevData)

  const entries = useMemo(() => displayData?.data ?? [], [displayData])
  const visibleEntries = selectedOp ? entries.filter(entry => entry.operator_slug === selectedOp) : entries
  const operators = entries.map((entry) => ({
    slug: entry.operator_slug,
    name: entry.operator_name,
    color: operatorColor(entry.operator_slug),
  }))

  const handleApplyFilter = (event?: FormEvent) => {
    event?.preventDefault()
    setPrevData(googleData ?? prevData)
    setAppliedFrom(fromDate || undefined)
    setAppliedTo(toDate || undefined)
  }

  const handleClearFilter = () => {
    setFromDate('')
    setToDate('')
    setAppliedFrom(undefined)
    setAppliedTo(undefined)
  }

  if (isLoading && !displayData) return <div className="glass-panel p-6 text-sm font-semibold text-slate-600 dark:text-slate-400">Loading Google reviews...</div>

  const avgRating = average(entries.map(entry => entry.overall_rating))
  const avgSentiment = average(entries.map(entry => entry.sentiment_score))
  const ratingLeader = [...entries].sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0))[0]
  const fastestRiser = [...entries].sort((a, b) => (b.rating_delta_mom ?? -99) - (a.rating_delta_mom ?? -99))[0]
  const riskCount = entries.filter(entry => (entry.rating_delta_mom ?? 0) < 0).length
  const lastUpdated = latestTimestamp(entries.map(entry => entry.cycle_timestamp))
  const appliedLabel = [appliedFrom, appliedTo].filter(Boolean).join(' to ')

  const ratingData = visibleEntries
    .sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0))
    .map(entry => ({
      name: entry.operator_name,
      rating: entry.overall_rating ?? null,
      delta: entry.rating_delta_mom ?? null,
      color: operators.find(operator => operator.slug === entry.operator_slug)?.color ?? '#0077b6',
    }))

  const allMonths = [...new Set((history?.series ?? []).map(series => series.month))].sort()
  const trendData = allMonths.map(month => {
    const row: Record<string, string | number | null> = { month: month.slice(0, 7) }
    entries.forEach(entry => {
      const point = history?.series.find(series => series.operator_slug === entry.operator_slug && series.month === month)
      row[entry.operator_slug] = point?.avg_sentiment ?? null
    })
    return row
  })
  const heatMonths = allMonths.slice(-12)

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <SectionHeader
            eyebrow="Google Search Reviews"
            title="Local reputation, review topics & sentiment risk"
            subtitle="Star ratings plus 15 classified review topics for every operator."
            eyebrowTip={tip('googleSearch')}
            titleTip={tip('reviewClassification')}
          />
        </div>

        <form onSubmit={handleApplyFilter} className="glass-panel flex flex-wrap items-end gap-3 p-3">
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
              <Calendar size={13} />
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={event => setFromDate(event.target.value)}
              className="h-10 rounded-full border border-slate-900/10 bg-white/80 px-3 text-sm font-bold text-[#14211f] outline-none transition focus:border-[#0077b6]"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
              <Calendar size={13} />
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={event => setToDate(event.target.value)}
              className="h-10 rounded-full border border-slate-900/10 bg-white/80 px-3 text-sm font-bold text-[#14211f] outline-none transition focus:border-[#0077b6]"
            />
          </div>
          <button type="submit" className="icon-button" aria-label="Apply date filter" title="Apply date filter">
            <Search size={17} />
          </button>
          <button type="button" onClick={handleClearFilter} className="icon-button" aria-label="Clear date filter" title="Clear date filter">
            <X size={17} />
          </button>
        </form>
      </section>

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedOp(null)}
          className={cx('control-chip inline-flex items-center px-4 text-sm font-black', selectedOp === null && 'control-chip-active')}
        >
          All operators
        </button>
        {operators.map(operator => (
          <button
            key={operator.slug}
            type="button"
            onClick={() => setSelectedOp(selectedOp === operator.slug ? null : operator.slug)}
            className={cx('control-chip inline-flex items-center gap-2 px-4 text-sm font-black', selectedOp === operator.slug && 'control-chip-active')}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: operator.color }} />
            {operator.name}
          </button>
        ))}
        {appliedLabel && (
          <span className="control-chip inline-flex items-center gap-2 px-4 text-sm font-bold">
            <Calendar size={16} />
            {appliedLabel}
          </span>
        )}
        {lastUpdated && (
          <span className="control-chip inline-flex items-center gap-2 px-4 text-sm font-bold">
            <Activity size={16} />
            {lastUpdated}
          </span>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard label="Avg Rating" value={formatMetric(avgRating, 2)} tip={tip('avgRating')} caption="Google locations" icon={<Star size={20} />} accent="#0077b6" />
        <KPICard label="Avg Sentiment" value={formatMetric(avgSentiment, 2)} tip={tip('sentiment')} caption="Review text mood" icon={<Gauge size={20} />} accent="#00a676" />
        <KPICard label="Fastest Riser" value={fastestRiser?.operator_name ?? null} delta={fastestRiser?.rating_delta_mom} tip={tip('fastestRiser')} caption={formatMetric(fastestRiser?.overall_rating, 1)} icon={<TrendingUp size={20} />} accent="#ffb000" />
        <KPICard label="Risk Signals" value={riskCount} tip={tip('riskSignals')} caption="Negative MoM operators" icon={<AlertTriangle size={20} />} accent="#f45d48" />
      </section>

      <ReviewClassificationPanel source="google_reviews" title="Google Search" selectedSlug={selectedOp} />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4">
            <p className="eyebrow">Current rating</p>
            <h2 className="section-title">Google review leaderboard</h2>
          </div>
          <ResponsiveContainer width="100%" height={330}>
            <BarChart layout="vertical" data={ratingData} margin={{ top: 8, right: 14, left: 18, bottom: 0 }}>
              <CartesianGrid className="chart-grid" horizontal={false} />
              <XAxis type="number" domain={[0, 5]} tick={{ fill: '#334155', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={132} tick={{ fill: '#0f172a', fontSize: 12, fontWeight: 800 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,119,182,0.05)' }} />
              <Bar dataKey="rating" name="Rating" radius={[0, 5, 5, 0]}>
                {ratingData.map(row => (
                  <Cell key={row.name} fill={row.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4">
            <p className="eyebrow">Sentiment trend</p>
            <h2 className="section-title">Monthly Google review mood</h2>
          </div>
          <ResponsiveContainer width="100%" height={330}>
            <LineChart data={trendData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#334155', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[-1, 1]} tick={{ fill: '#334155', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ color: '#334155', fontSize: 11, fontWeight: 700 }} />
              {operators.map(operator => (
                <Line
                  key={operator.slug}
                  type="monotone"
                  dataKey={operator.slug}
                  name={operator.name}
                  stroke={operator.color}
                  strokeWidth={selectedOp === operator.slug || !selectedOp ? 2.5 : 1.4}
                  strokeOpacity={selectedOp && selectedOp !== operator.slug ? 0.18 : 1}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-1">
        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4">
            <p className="eyebrow">Heatmap</p>
            <h2 className="section-title">Last 12 months Google rating</h2>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[760px] space-y-2">
              <div className="grid items-center gap-2" style={{ gridTemplateColumns: `170px repeat(${heatMonths.length}, minmax(54px, 1fr))` }}>
                <span />
                {heatMonths.map(month => (
                  <span key={month} className="text-center text-[0.68rem] font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">{month.slice(0, 7)}</span>
                ))}
              </div>
              {visibleEntries.map(entry => (
                <div key={entry.operator_slug} className="grid items-center gap-2" style={{ gridTemplateColumns: `170px repeat(${heatMonths.length}, minmax(54px, 1fr))` }}>
                  <span className="truncate text-xs font-black text-slate-800 dark:text-slate-200">{entry.operator_name}</span>
                  {heatMonths.map(month => {
                    const point = history?.series.find(series => series.operator_slug === entry.operator_slug && series.month === month)
                    return <HeatmapCell key={month} value={point?.avg_rating ?? null} min={1} max={5} width={58} height={28} showValue />
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
