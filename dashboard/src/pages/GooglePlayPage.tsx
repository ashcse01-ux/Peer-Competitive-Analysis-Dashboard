import React, { useMemo, useState } from 'react'
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
import { Download, MessageSquare, Star, ThumbsUp } from 'lucide-react'
import { useAppStore, useDailySnapshots, type AppStoreEntry } from '../api'
import ChartTooltip from '../components/ChartTooltip'
import DateRangeBar, { todayIso, type DateFilterValue } from '../components/DateRangeBar'
import HighestRatedCard from '../components/HighestRatedCard'
import KPICard from '../components/KPICard'
import SectionHeader from '../components/SectionHeader'
import StarMixCell from '../components/StarMixCell'
import PeerScopeLine from '../components/PeerScopeLine'
import PlayRatingMedal, { podiumRowClass, ratingRankMap, sortByPlayRating } from '../components/PlayRatingMedal'
import TopicChampionsBoard from '../components/TopicChampionsBoard'
import {
  average,
  formatMetric,
  formatSnapshotStamp,
  formatStarRating,
  operatorColor,
  percentSharesOneDecimal,
  sum,
} from '../lib/insights'
import {
  FB_BLUE,
  FB_YELLOW,
  PLAY_TOPIC_KEYS,
  PLAY_TOPIC_LABELS,
  type PlayTopicKey,
} from '../lib/playTopics'
import { enrichAppStoreRow, formatDownloadsLabel } from '../lib/storeMetrics'

const SOURCE = 'google_play'
const STAR_FILL = {
  '1★': '#dc2626',
  '2★': '#f97316',
  '3★': FB_YELLOW,
  '4★': '#4da3ff',
  '5★': FB_BLUE,
}

type OpSummary = {
  slug: string
  name: string
  color: string
  rating: number | null
  downloads: string | null | undefined
  downloadsRaw: number | null
  /** Written text reviews (Play: reviews) */
  reviewCount: number | null
  /** People who left a star (Play: ratings / histogram sum) */
  ratingsCount: number
  star1: number
  star2: number
  star3: number
  star4: number
  star5: number
  playTopics: Record<string, number | null>
  cycle: string | null | undefined
  collectionDate: string | null | undefined
}

function shortName(name: string) {
  return name.length > 10 ? `${name.slice(0, 9)}…` : name
}

function per10k(count: number | null | undefined, downloads: number | null | undefined) {
  if (count == null || !downloads || downloads <= 0) return 0
  return Math.round((count / downloads) * 10_000 * 10) / 10
}

function toSummary(row: AppStoreEntry): OpSummary {
  const e = enrichAppStoreRow(row)
  const histSum = e.star_1 + e.star_2 + e.star_3 + e.star_4 + e.star_5
  const ratingsCount =
    e.ratings_count
    ?? (histSum > 0 ? histSum : null)
    ?? e.review_count
    ?? 0

  return {
    slug: e.operator_slug,
    name: e.operator_name,
    color: operatorColor(e.operator_slug),
    rating: e.overall_rating,
    downloads: e.downloads,
    downloadsRaw: e.downloads_raw,
    reviewCount: e.review_count,
    ratingsCount: Number(ratingsCount) || histSum,
    star1: e.star_1,
    star2: e.star_2,
    star3: e.star_3,
    star4: e.star_4,
    star5: e.star_5,
    playTopics: e.play_topics ?? {},
    cycle: e.cycle_timestamp,
    collectionDate: e.collection_date,
  }
}

export default function GooglePlayPage() {
  const [selectedOp, setSelectedOp] = useState<string | null>(null)
  const { data: appData, isLoading, isError } = useAppStore()
  const { data: daily } = useDailySnapshots()

  const today = todayIso()
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({
    preset: 'today',
    from: today,
    to: today,
  })

  // Calendar unlocks only as real daily scrapes land going forward.
  // Past days stay locked — no historical fetch before the scrape program.
  const availableDates = useMemo(() => [today], [today])

  const summaries = useMemo(() => {
    const dailyRows = (daily?.app_store ?? []).filter(e => e.source === SOURCE)
    const fallback = (appData?.data ?? []).filter(e => e.source === SOURCE)
    const pool = dailyRows.length ? dailyRows : fallback

    // History locked: always latest / today snapshot until scrapes accumulate
    const historyLocked = availableDates.length <= 1
    const targetDay = historyLocked ? today : dateFilter.to

    const bySlug = new Map<string, AppStoreEntry>()
    for (const row of pool) {
      const day = row.collection_date || (row.cycle_timestamp || '').slice(0, 10)
      if (historyLocked) {
        const prev = bySlug.get(row.operator_slug)
        if (!prev) {
          bySlug.set(row.operator_slug, row)
          continue
        }
        const prevDay = prev.collection_date || (prev.cycle_timestamp || '').slice(0, 10)
        if ((day || '') >= (prevDay || '')) bySlug.set(row.operator_slug, row)
        continue
      }
      if (day === targetDay || (!day && targetDay === today)) {
        bySlug.set(row.operator_slug, enrichAppStoreRow(row))
      }
    }

    // If range filter with history: use latest day in range per operator
    if (!historyLocked && dateFilter.from !== dateFilter.to) {
      bySlug.clear()
      for (const row of pool) {
        const day = row.collection_date || (row.cycle_timestamp || '').slice(0, 10)
        if (!day || day < dateFilter.from || day > dateFilter.to) continue
        const prev = bySlug.get(row.operator_slug)
        const prevDay = prev?.collection_date || (prev?.cycle_timestamp || '').slice(0, 10)
        if (!prev || (day >= (prevDay || ''))) bySlug.set(row.operator_slug, row)
      }
    }

    return [...bySlug.values()].map(toSummary).sort((a, b) => a.name.localeCompare(b.name))
  }, [appData, daily, dateFilter.from, dateFilter.to, availableDates.length, today])

  if (isLoading && !summaries.length) {
    return <div className="liquid-glass p-6 text-sm font-semibold text-theme-muted">Loading Google Play metrics…</div>
  }
  if (isError && !summaries.length) {
    return <div className="liquid-glass p-6 text-sm font-semibold text-rose-600">Google Play data could not be loaded.</div>
  }

  const visible = selectedOp ? summaries.filter(s => s.slug === selectedOp) : summaries
  const isAll = selectedOp == null
  const highestRated = [...summaries].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0]

  const topicLeaders = PLAY_TOPIC_KEYS.map(key => {
    let best: OpSummary | null = null
    let bestScore = -1
    for (const s of summaries) {
      const score = s.playTopics[key]
      if (score != null && score > bestScore) {
        bestScore = score
        best = s
      }
    }
    return {
      key,
      label: PLAY_TOPIC_LABELS[key as PlayTopicKey],
      operator: best?.name ?? '—',
      slug: best?.slug ?? '',
      color: best?.color ?? '#94a3b8',
      score: bestScore >= 0 ? bestScore : null,
    }
  })

  const avgRating = average(visible.map(s => s.rating))
  const totalReviews = sum(visible.map(s => s.reviewCount))
  const totalDownloads = sum(visible.map(s => s.downloadsRaw))
  const totalRatings = sum(visible.map(s => s.ratingsCount))
  const snapshotLabel = formatSnapshotStamp(dateFilter.to, visible.map(s => s.cycle))

  const chartRows = sortByPlayRating(visible)

  const downloadsBar = chartRows.map(s => ({
    name: shortName(s.name),
    fullName: s.name,
    downloads: s.downloadsRaw ?? 0,
    fill: s.color,
  }))
  const ratingBar = chartRows.map(s => ({
    name: shortName(s.name),
    'App Rating': Number(s.rating ?? 0),
    fill: s.color,
  }))
  const normalizedVolume = chartRows.map(s => ({
    name: shortName(s.name),
    fullName: s.name,
    'Ratings / 10k downloads': per10k(s.ratingsCount, s.downloadsRaw),
    'Reviews / 10k downloads': per10k(s.reviewCount, s.downloadsRaw),
    fill: s.color,
  }))
  const starShare = chartRows.map(s => {
    const p = percentSharesOneDecimal([s.star1, s.star2, s.star3, s.star4, s.star5])
    return {
      name: shortName(s.name),
      '1★': p[0],
      '2★': p[1],
      '3★': p[2],
      '4★': p[3],
      '5★': p[4],
    }
  })
  const topicBar = PLAY_TOPIC_KEYS.map(key => {
    const row: Record<string, string | number | null> = { topic: PLAY_TOPIC_LABELS[key] }
    visible.forEach(s => {
      const val = s.playTopics[key]
      row[s.slug] = val != null ? Number(val) : null
    })
    return row
  })

  const ratingRanks = ratingRankMap(summaries)
  const tableRows = sortByPlayRating(visible)

  return (
    <div className="page-section">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <SectionHeader
              variant="hero"
              divider={false}
              eyebrow="Google Play Store - Android"
              title="Peer competitive analysis"
              subtitleNode={
                <PeerScopeLine
                  peers={summaries}
                  selectedSlug={selectedOp}
                  onSelect={setSelectedOp}
                  className="hero-lede"
                />
              }
            />
          </div>
          <span className="liquid-chip snapshot-chip inline-flex items-center gap-2 px-4 py-2.5">
            {snapshotLabel}
          </span>
        </div>

        <DateRangeBar
          value={dateFilter}
          onChange={setDateFilter}
          availableDates={availableDates}
        />
      </section>

      {isAll ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(260px,0.9fr)_minmax(0,2.1fr)]">
          <HighestRatedCard
            name={highestRated?.name}
            rating={highestRated?.rating}
            color={highestRated?.color}
          />
          <TopicChampionsBoard leaders={topicLeaders} />
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KPICard label="App Rating" value={formatStarRating(avgRating)} caption={visible[0]?.name} icon={<Star size={20} />} accent={FB_YELLOW} />
          <KPICard label="Star Ratings" value={totalRatings != null ? totalRatings.toLocaleString() : null} caption="People who rated" icon={<ThumbsUp size={20} />} accent={FB_BLUE} />
          <KPICard label="Text Reviews" value={totalReviews != null ? totalReviews.toLocaleString() : null} caption="Written reviews" icon={<MessageSquare size={20} />} accent={FB_BLUE} />
          <KPICard label="Downloads" value={formatDownloadsLabel(totalDownloads)} icon={<Download size={20} />} accent={FB_YELLOW} />
        </section>
      )}

      <section className="liquid-glass chart-panel panel-shell overflow-hidden">
        <SectionHeader
          eyebrow="Operator ledger"
          title="Storefront scorecard"
          subtitle="Sorted by App Rating - gold, silver, bronze first - then remaining peers"
        />
        <div className="visual-body overflow-x-auto">
          <table className="data-table min-w-[820px]">
            <thead>
              <tr>
                <th>Operator</th>
                <th>Downloads</th>
                <th>App Rating</th>
                <th>Ratings</th>
                <th>Reviews</th>
                <th>Star mix</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(s => {
                const medalRank = ratingRanks.get(s.slug)
                return (
                <tr key={s.slug} className={podiumRowClass(medalRank)}>
                  <td>
                    <span className="inline-flex items-center gap-2.5 font-bold text-theme-primary">
                      <span className="flex w-6 shrink-0 items-center justify-center">
                        {medalRank ? (
                          <PlayRatingMedal rank={medalRank} />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-black/10 dark:bg-white/15" aria-hidden />
                        )}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </span>
                    </span>
                  </td>
                  <td className="font-semibold tabular-nums">{s.downloads ?? formatDownloadsLabel(s.downloadsRaw)}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 font-extrabold tabular-nums" style={{ color: FB_BLUE }}>
                      {formatMetric(s.rating, 2)}
                      <span style={{ color: FB_YELLOW }}>★</span>
                    </span>
                  </td>
                  <td className="tabular-nums font-semibold">{s.ratingsCount.toLocaleString()}</td>
                  <td className="tabular-nums font-semibold">{s.reviewCount?.toLocaleString() ?? '—'}</td>
                  <td>
                    <StarMixCell stars={[s.star1, s.star2, s.star3, s.star4, s.star5]} />
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="liquid-glass chart-panel panel-shell">
          <SectionHeader
            eyebrow="Scale"
            title="Total downloads"
            subtitle="Install band from Play Store - larger apps naturally collect more ratings"
          />
          <div className="visual-body">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={downloadsBar} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis
                domain={[0, 10_000_000]}
                ticks={[1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000, 8_000_000, 9_000_000, 10_000_000]}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
                width={52}
                tickFormatter={(v: number) => `${Math.round(v / 1_000_000)}M+`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="downloads" name="Downloads" radius={[8, 8, 0, 0]}>
                {downloadsBar.map(row => <Cell key={row.fullName} fill={row.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>

        <div className="liquid-glass chart-panel panel-shell">
          <SectionHeader
            eyebrow="Quality"
            title="App Rating"
            subtitle="Average star score out of 5 - size-independent quality signal"
          />
          <div className="visual-body">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ratingBar} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 5]} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="App Rating" radius={[8, 8, 0, 0]}>
                {ratingBar.map(row => <Cell key={row.name} fill={row.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>

        <div className="liquid-glass chart-panel panel-shell xl:col-span-2">
          <SectionHeader
            eyebrow="Fair compare"
            title="Ratings & reviews per 10k downloads"
            subtitle="Normalizes for install size - apps with more downloads naturally get more 5-star votes"
          />
          <div className="visual-body">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={normalizedVolume} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
              <Bar dataKey="Ratings / 10k downloads" fill={FB_BLUE} radius={[6, 6, 0, 0]} />
              <Bar dataKey="Reviews / 10k downloads" fill={FB_YELLOW} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>

        <div className="liquid-glass chart-panel panel-shell xl:col-span-2">
          <SectionHeader
            eyebrow="Sentiment shape"
            title="Star mix - share of all ratings"
            subtitle="% of each operator's ratings at 1-5 stars - fairer than raw counts when download bases differ"
          />
          <div className="visual-body">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={starShare} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
              {(['1★', '2★', '3★', '4★', '5★'] as const).map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="share"
                  fill={STAR_FILL[key]}
                  radius={i === 4 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="liquid-glass chart-panel panel-shell">
        <SectionHeader
          eyebrow="Play topics"
          title="Review topic scores"
          subtitle="Booking, UI, support, transport, value, pricing, navigation, entertainment & performance"
        />
        <div className="visual-body">
        <ResponsiveContainer width="100%" height={420}>
          <BarChart data={topicBar} margin={{ top: 16, right: 12, left: 0, bottom: 52 }}>
            <CartesianGrid className="chart-grid" vertical={false} />
            <XAxis
              dataKey="topic"
              interval={0}
              angle={-28}
              textAnchor="end"
              height={74}
              tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis domain={[0, 5]} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
            {visible.map(s => (
              <Bar key={s.slug} dataKey={s.slug} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}
