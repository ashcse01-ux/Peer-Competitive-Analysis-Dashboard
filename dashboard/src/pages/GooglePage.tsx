import React, { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, MessageSquare, Search, Star } from 'lucide-react'
import { useGoogleReviews, type GoogleEntry } from '../api'
import ChartTooltip from '../components/ChartTooltip'
import KPICard from '../components/KPICard'
import SectionHeader from '../components/SectionHeader'
import {
  average,
  cx,
  formatMetric,
  formatStarRating,
  latestTimestamp,
  operatorColor,
  sum,
} from '../lib/insights'
import { FB_BLUE, FB_YELLOW } from '../lib/playTopics'
import { estimateStarHistogram } from '../lib/storeMetrics'

export default function GooglePage() {
  const [selectedOp, setSelectedOp] = useState<string | null>(null)
  const { data: googleData, isError, isLoading } = useGoogleReviews()

  const summaries = useMemo(() => {
    return (googleData?.data ?? []).map((row: GoogleEntry) => {
      const hasStars = [row.star_1, row.star_2, row.star_3, row.star_4, row.star_5].some(v => v != null && v > 0)
      const hist = hasStars
        ? {
            star1: row.star_1 ?? 0,
            star2: row.star_2 ?? 0,
            star3: row.star_3 ?? 0,
            star4: row.star_4 ?? 0,
            star5: row.star_5 ?? 0,
          }
        : (() => {
            const h = estimateStarHistogram(row.overall_rating, row.review_count)
            return {
              star1: h.star_1,
              star2: h.star_2,
              star3: h.star_3,
              star4: h.star_4,
              star5: h.star_5,
            }
          })()
      return {
        slug: row.operator_slug,
        name: row.operator_name,
        color: operatorColor(row.operator_slug),
        rating: row.overall_rating,
        reviewCount: row.review_count,
        ...hist,
        cycle: row.cycle_timestamp,
      }
    })
  }, [googleData])

  if (isLoading) {
    return <div className="liquid-glass p-6 text-sm font-semibold text-theme-muted">Loading Google Search ratings…</div>
  }
  if (isError && !summaries.length) {
    return <div className="liquid-glass p-6 text-sm font-semibold text-rose-600">Google Search data could not be loaded.</div>
  }

  const visible = selectedOp ? summaries.filter(s => s.slug === selectedOp) : summaries
  const avgRating = average(summaries.map(s => s.rating))
  const totalReviews = sum(summaries.map(s => s.reviewCount))
  const lastUpdated = latestTimestamp(summaries.map(s => s.cycle))

  const ratingBar = visible.map(s => ({ name: s.name, rating: s.rating ?? 0 }))
  const reviewsBar = visible.map(s => ({ name: s.name, reviews: s.reviewCount ?? 0 }))
  const starBar = visible.map(s => ({
    name: s.name,
    '1★': s.star1,
    '2★': s.star2,
    '3★': s.star3,
    '4★': s.star4,
    '5★': s.star5,
  }))

  return (
    <div className="page-section">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <SectionHeader
            eyebrow="Google Search"
            title="Local / Knowledge Panel ratings"
            subtitle="FreshBus vs peers — Google Search rating, review volume and 1–5★ mix."
          />
        </div>
        <span className="control-chip inline-flex items-center gap-2 px-4 text-sm font-bold">
          <Activity size={16} />
          {lastUpdated ?? 'Awaiting daily 10 AM sync'}
        </span>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KPICard
          label="Google Search Rating"
          value={formatStarRating(avgRating)}
          caption="Average across peers"
          icon={<Star size={20} />}
          accent={FB_YELLOW}
        />
        <KPICard
          label="Total Reviews"
          value={totalReviews != null ? totalReviews.toLocaleString() : null}
          caption="All operators"
          icon={<MessageSquare size={20} />}
          accent={FB_BLUE}
        />
        <KPICard
          label="Operators tracked"
          value={summaries.length}
          caption="Google Knowledge Panel"
          icon={<Search size={20} />}
          accent={FB_YELLOW}
        />
      </section>

      <section className="glass-panel p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedOp(null)}
            className={cx('control-chip px-4 text-sm font-black', !selectedOp && 'control-chip-active')}
          >
            All
          </button>
          {summaries.map(s => (
            <button
              key={s.slug}
              type="button"
              onClick={() => setSelectedOp(s.slug === selectedOp ? null : s.slug)}
              className={cx(
                'control-chip inline-flex items-center gap-2 px-4 text-sm font-black',
                selectedOp === s.slug && 'control-chip-active',
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="glass-panel p-4 sm:p-5">
          <SectionHeader eyebrow="Quality" title="Google Search rating" subtitle="Knowledge Panel average score out of 5" />
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ratingBar} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 5]} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="rating" name="Rating" fill={FB_YELLOW} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel p-4 sm:p-5">
          <SectionHeader eyebrow="Volume" title="Total reviews" subtitle="Google review count from Search" />
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={reviewsBar} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="reviews" name="Reviews" fill={FB_BLUE} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel p-4 sm:p-5 xl:col-span-2">
          <SectionHeader eyebrow="Sentiment shape" title="Star mix" subtitle="1–5★ distribution across Google reviews" />
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={starBar} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
              <Bar dataKey="1★" stackId="stars" fill="#dc2626" />
              <Bar dataKey="2★" stackId="stars" fill="#f97316" />
              <Bar dataKey="3★" stackId="stars" fill={FB_YELLOW} />
              <Bar dataKey="4★" stackId="stars" fill="#4da3ff" />
              <Bar dataKey="5★" stackId="stars" fill={FB_BLUE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="glass-panel overflow-x-auto p-4 sm:p-5">
        <SectionHeader eyebrow="Operator ledger" title="Search scorecard" />
        <table className="data-table mt-3 min-w-[640px]">
          <thead>
            <tr>
              <th>Operator</th>
              <th>App Rating</th>
              <th>Reviews</th>
              <th>1★</th>
              <th>2★</th>
              <th>3★</th>
              <th>4★</th>
              <th>5★</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(s => (
              <tr key={s.slug}>
                <td className="font-bold text-theme-primary">{s.name}</td>
                <td>{formatMetric(s.rating, 2)}</td>
                <td>{s.reviewCount?.toLocaleString() ?? '—'}</td>
                <td>{s.star1.toLocaleString()}</td>
                <td>{s.star2.toLocaleString()}</td>
                <td>{s.star3.toLocaleString()}</td>
                <td>{s.star4.toLocaleString()}</td>
                <td>{s.star5.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
