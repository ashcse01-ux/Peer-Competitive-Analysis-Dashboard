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
import { Activity, Download, MessageSquare, Smartphone, Star } from 'lucide-react'
import { useAppStore, type AppStoreEntry } from '../api'
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
import { enrichAppStoreRow } from '../lib/storeMetrics'

const SOURCE = 'ios_app_store'

export default function AppleStorePage() {
  const [selectedOp, setSelectedOp] = useState<string | null>(null)
  const { data: appData, isLoading, isError } = useAppStore()

  const summaries = useMemo(() => {
    return (appData?.data ?? [])
      .filter((e: AppStoreEntry) => e.source === SOURCE)
      .map(enrichAppStoreRow)
      .map(row => ({
        slug: row.operator_slug,
        name: row.operator_name,
        color: operatorColor(row.operator_slug),
        rating: row.overall_rating,
        downloads: row.downloads,
        reviewCount: row.review_count,
        star1: row.star_1,
        star2: row.star_2,
        star3: row.star_3,
        star4: row.star_4,
        star5: row.star_5,
        cycle: row.cycle_timestamp,
      }))
  }, [appData])

  if (isLoading) {
    return <div className="liquid-glass p-6 text-sm font-semibold text-theme-muted">Loading iOS App Store metrics…</div>
  }
  if (isError && !summaries.length) {
    return <div className="liquid-glass p-6 text-sm font-semibold text-rose-600">Apple App Store data could not be loaded.</div>
  }

  const visible = selectedOp ? summaries.filter(s => s.slug === selectedOp) : summaries
  const avgRating = average(summaries.map(s => s.rating))
  const totalReviews = sum(summaries.map(s => s.reviewCount))
  const lastUpdated = latestTimestamp(summaries.map(s => s.cycle))

  const ratingBar = visible.map(s => ({ name: s.name, rating: s.rating ?? 0 }))
  const reviewsBar = visible.map(s => ({ name: s.name, reviews: s.reviewCount ?? 0 }))
  const downloadsBar = visible.map(s => ({
    name: s.name,
    downloads: s.downloads ? 1 : 0,
    label: s.downloads ?? 'Not published',
  }))
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
            eyebrow="Apple App Store"
            title="iOS peer ratings, reviews & star mix"
            subtitle="FreshBus vs peers on iOS — downloads are not published by Apple publicly."
          />
        </div>
        <span className="control-chip inline-flex items-center gap-2 px-4 text-sm font-bold">
          <Activity size={16} />
          {lastUpdated ?? 'Awaiting daily 10 AM sync'}
        </span>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label="Total Downloads"
          value="Not published"
          caption="Apple does not expose installs"
          icon={<Download size={20} />}
          accent={FB_BLUE}
        />
        <KPICard
          label="App Rating"
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
          caption="iOS apps"
          icon={<Smartphone size={20} />}
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
          <SectionHeader eyebrow="Scale" title="Total downloads" subtitle="Apple does not publish install counts publicly" />
          <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-bold text-theme-muted">Apple App Store does not publish download counts.</p>
            <p className="max-w-sm text-xs text-theme-muted">
              Chart reserved for parity with Play Store. Rating & review bars below use live iTunes data.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {downloadsBar.map(d => (
                <span key={d.name} className="control-chip px-3 text-xs font-bold">{d.name}: {d.label}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-panel p-4 sm:p-5">
          <SectionHeader eyebrow="Quality" title="App Rating" subtitle="Average star score out of 5" />
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ratingBar} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 5]} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="rating" name="App Rating" fill={FB_YELLOW} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel p-4 sm:p-5">
          <SectionHeader eyebrow="Volume" title="Total reviews" subtitle="Written App Store reviews" />
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

        <div className="glass-panel p-4 sm:p-5">
          <SectionHeader eyebrow="Sentiment shape" title="Star mix" subtitle="1–5★ distribution across sampled reviews" />
          <ResponsiveContainer width="100%" height={300}>
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
        <SectionHeader eyebrow="Operator ledger" title="Storefront scorecard" />
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
