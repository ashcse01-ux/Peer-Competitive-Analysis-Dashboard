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
import {
  useAppStore,
  useDailySnapshots,
  useGoogleReviews,
  type AppStoreEntry,
  type GoogleEntry,
} from '../api'
import ChartTooltip from '../components/ChartTooltip'
import DateRangeBar, { todayIso, type DateFilterValue } from '../components/DateRangeBar'
import HighestRatedCard from '../components/HighestRatedCard'
import KPICard from '../components/KPICard'
import PeerScopeLine from '../components/PeerScopeLine'
import PlayRatingMedal, { podiumRowClass, ratingRankMap, sortByPlayRating } from '../components/PlayRatingMedal'
import SectionHeader from '../components/SectionHeader'
import StarMixCell from '../components/StarMixCell'
import TopicChampionsBoard from '../components/TopicChampionsBoard'
import {
  average,
  formatIndianInstallAxis,
  formatMetric,
  formatSnapshotStamp,
  formatStarRating,
  indianDownloadAxis,
  operatorColor,
  percentSharesOneDecimal,
  sum,
} from '../lib/insights'
import type { PeerDashboardConfig } from '../lib/peerDashboardConfig'
import {
  FB_BLUE,
  FB_YELLOW,
  PLAY_TOPIC_KEYS,
  PLAY_TOPIC_LABELS,
  type PlayTopicKey,
} from '../lib/playTopics'
import { enrichAppStoreRow, estimateStarHistogram, formatDownloadsLabel, parseDownloadsRaw } from '../lib/storeMetrics'

const STAR_FILL = {
  '1★': '#dc2626',
  '2★': '#f97316',
  '3★': FB_YELLOW,
  '4★': '#4da3ff',
  '5★': FB_BLUE,
}

export type OpSummary = {
  slug: string
  name: string
  color: string
  rating: number | null
  downloads: string | null | undefined
  downloadsRaw: number | null
  reviewCount: number | null
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

function effectiveDownloadsRaw(s: OpSummary): number {
  return s.downloadsRaw ?? parseDownloadsRaw(s.downloads) ?? 0
}

function shortName(name: string) {
  return name.length > 10 ? `${name.slice(0, 9)}…` : name
}

function per10k(count: number | null | undefined, downloads: number | null | undefined) {
  if (count == null || !downloads || downloads <= 0) return 0
  return Math.round((count / downloads) * 10_000 * 10) / 10
}

function toAppStoreSummary(row: AppStoreEntry): OpSummary {
  const e = enrichAppStoreRow(row)
  const histSum = e.star_1 + e.star_2 + e.star_3 + e.star_4 + e.star_5
  const ratingsCount =
    e.ratings_count ?? (histSum > 0 ? histSum : null) ?? e.review_count ?? 0

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

function toGoogleSummary(row: GoogleEntry): OpSummary {
  const hasStars = [row.star_1, row.star_2, row.star_3, row.star_4, row.star_5].some(
    v => v != null && v > 0,
  )
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
        return { star1: h.star_1, star2: h.star_2, star3: h.star_3, star4: h.star_4, star5: h.star_5 }
      })()
  const histSum = hist.star1 + hist.star2 + hist.star3 + hist.star4 + hist.star5

  return {
    slug: row.operator_slug,
    name: row.operator_name,
    color: operatorColor(row.operator_slug),
    rating: row.overall_rating,
    downloads: null,
    downloadsRaw: null,
    reviewCount: row.review_count,
    ratingsCount: histSum || row.review_count || 0,
    ...hist,
    playTopics: {},
    cycle: row.cycle_timestamp,
    collectionDate: row.collection_date,
  }
}

function pickLatestPool<T extends { operator_slug: string; collection_date?: string | null; cycle_timestamp?: string | null }>(
  pool: T[],
  today: string,
  historyLocked: boolean,
  dateFilter: DateFilterValue,
): T[] {
  const targetDay = historyLocked ? today : dateFilter.to
  const bySlug = new Map<string, T>()

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
      bySlug.set(row.operator_slug, row)
    }
  }

  if (!historyLocked && dateFilter.from !== dateFilter.to) {
    bySlug.clear()
    for (const row of pool) {
      const day = row.collection_date || (row.cycle_timestamp || '').slice(0, 10)
      if (!day || day < dateFilter.from || day > dateFilter.to) continue
      const prev = bySlug.get(row.operator_slug)
      const prevDay = prev?.collection_date || (prev?.cycle_timestamp || '').slice(0, 10)
      if (!prev || day >= (prevDay || '')) bySlug.set(row.operator_slug, row)
    }
  }

  return [...bySlug.values()]
}

interface Props {
  config: PeerDashboardConfig
}

/** Android / iOS / Google Search peer dashboard (shared shell). */
export default function PeerStoreDashboard({ config }: Props) {
  const [selectedOp, setSelectedOp] = useState<string | null>(null)
  const { data: appData, isLoading: appLoading, isError: appError } = useAppStore()
  const { data: googleData, isLoading: googleLoading, isError: googleError } = useGoogleReviews()
  const { data: daily } = useDailySnapshots()

  const today = todayIso()
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({
    preset: 'today',
    from: today,
    to: today,
  })

  const availableDates = useMemo(() => [today], [today])
  const historyLocked = availableDates.length <= 1
  const isGoogle = config.kind === 'google_search'
  const source = config.appStoreSource

  const summaries = useMemo(() => {
    if (isGoogle) {
      const dailyRows = daily?.google_reviews ?? []
      const fallback = googleData?.data ?? []
      const pool = dailyRows.length ? dailyRows : fallback
      return pickLatestPool(pool, today, historyLocked, dateFilter)
        .map(toGoogleSummary)
        .sort((a, b) => a.name.localeCompare(b.name))
    }

    const dailyRows = (daily?.app_store ?? []).filter(e => e.source === source)
    const fallback = (appData?.data ?? []).filter(e => e.source === source)
    const pool = dailyRows.length ? dailyRows : fallback

    return pickLatestPool(pool, today, historyLocked, dateFilter)
      .map(r => toAppStoreSummary(enrichAppStoreRow(r as AppStoreEntry)))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [
    isGoogle,
    daily,
    googleData,
    appData,
    source,
    today,
    historyLocked,
    dateFilter.from,
    dateFilter.to,
  ])

  const isLoading = isGoogle ? googleLoading : appLoading
  const isError = isGoogle ? googleError : appError

  if (isLoading && !summaries.length) {
    return <div className="liquid-glass p-6 text-sm font-semibold text-theme-muted">{config.loadingMessage}</div>
  }
  if (isError && !summaries.length) {
    return <div className="liquid-glass p-6 text-sm font-semibold text-rose-600">{config.errorMessage}</div>
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
  const maxDownloads = Math.max(0, ...chartRows.map(effectiveDownloadsRaw))
  const hasDownloadMetrics =
    config.showDownloads &&
    (config.kind === 'ios_app_store'
      ? chartRows.some(s => effectiveDownloadsRaw(s) > 0)
      : chartRows.some(s => (s.downloadsRaw ?? 0) > 0))

  const downloadsBar = chartRows.map(s => ({
    name: shortName(s.name),
    fullName: s.name,
    downloads: effectiveDownloadsRaw(s),
    fill: s.color,
  }))

  const isIosDownloadsAxis = config.kind === 'ios_app_store'
  const iosAxis = indianDownloadAxis(maxDownloads)
  const playAxis = {
    domain: [0, 10_000_000] as [number, number],
    ticks: [1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000, 8_000_000, 9_000_000, 10_000_000],
    tickFormatter: (v: number) => `${Math.round(v / 1_000_000)}M+`,
  }
  const ratingLabel = config.ratingLabel

  const ratingBar = chartRows.map(s => ({
    name: shortName(s.name),
    [ratingLabel]: Number(s.rating ?? 0),
    fill: s.color,
  }))
  const reviewsBar = chartRows.map(s => ({
    name: shortName(s.name),
    reviews: s.reviewCount ?? 0,
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
              eyebrow={config.heroEyebrow}
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

        <DateRangeBar value={dateFilter} onChange={setDateFilter} availableDates={availableDates} />
      </section>

      {isAll ? (
        config.showTopicBoard ? (
          <section className="grid gap-4 xl:grid-cols-[minmax(260px,0.9fr)_minmax(0,2.1fr)]">
            <HighestRatedCard
              name={highestRated?.name}
              rating={highestRated?.rating}
              color={highestRated?.color}
              ratingCaption={config.ratingCaption}
            />
            <TopicChampionsBoard leaders={topicLeaders} />
          </section>
        ) : (
          <section className="max-w-lg">
            <HighestRatedCard
              name={highestRated?.name}
              rating={highestRated?.rating}
              color={highestRated?.color}
              ratingCaption={config.ratingCaption}
            />
          </section>
        )
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KPICard label={ratingLabel} value={formatStarRating(avgRating)} caption={visible[0]?.name} icon={<Star size={20} />} accent={FB_YELLOW} />
          <KPICard label="Star Ratings" value={totalRatings != null ? totalRatings.toLocaleString() : null} caption="People who rated" icon={<ThumbsUp size={20} />} accent={FB_BLUE} />
          <KPICard label="Text Reviews" value={totalReviews != null ? totalReviews.toLocaleString() : null} caption="Written reviews" icon={<MessageSquare size={20} />} accent={FB_BLUE} />
          {config.showDownloads ? (
            <KPICard
              label="Downloads"
              value={hasDownloadMetrics ? formatDownloadsLabel(totalDownloads) : 'Not published'}
              caption={hasDownloadMetrics ? 'Install band' : config.downloadsUnavailableNote || 'Not available'}
              icon={<Download size={20} />}
              accent={FB_YELLOW}
            />
          ) : (
            <KPICard label="Operators" value={visible.length} caption="In filter" icon={<Star size={20} />} accent={FB_YELLOW} />
          )}
        </section>
      )}

      <section className="liquid-glass chart-panel panel-shell overflow-hidden">
        <SectionHeader
          eyebrow="Operator ledger"
          title="Storefront scorecard"
          subtitle={`Sorted by ${ratingLabel} - gold, silver, bronze first - then remaining peers`}
        />
        <div className="visual-body overflow-x-auto">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th>Operator</th>
                {config.showDownloads ? <th>Downloads</th> : null}
                <th>{ratingLabel}</th>
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
                    {config.showDownloads ? (
                      <td className="font-semibold tabular-nums">
                        {s.downloadsRaw ? (s.downloads ?? formatDownloadsLabel(s.downloadsRaw)) : 'Not published'}
                      </td>
                    ) : null}
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
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {config.showDownloads ? (
          <div className="liquid-glass chart-panel panel-shell">
            <SectionHeader
              eyebrow="Scale"
              title="Total downloads"
              subtitle={
                hasDownloadMetrics
                  ? 'Install band from store listing - larger apps naturally collect more ratings'
                  : config.downloadsUnavailableNote
              }
            />
            <div className="visual-body">
              {hasDownloadMetrics ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={downloadsBar} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid className="chart-grid" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                    <YAxis
                      domain={isIosDownloadsAxis ? iosAxis.domain : playAxis.domain}
                      ticks={isIosDownloadsAxis ? iosAxis.ticks : playAxis.ticks}
                      tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                      width={isIosDownloadsAxis ? 44 : 52}
                      tickFormatter={isIosDownloadsAxis ? formatIndianInstallAxis : playAxis.tickFormatter}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="downloads" name="Downloads" radius={[8, 8, 0, 0]}>
                      {downloadsBar.map(row => <Cell key={row.fullName} fill={row.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 px-4 text-center">
                  <p className="text-sm font-bold text-theme-primary">Download data not available</p>
                  <p className="max-w-md text-sm text-theme-secondary">{config.downloadsUnavailableNote}</p>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {chartRows.map(s => (
                      <span key={s.slug} className="control-chip px-3 text-xs font-bold">
                        {s.name}: Not published
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className={`liquid-glass chart-panel panel-shell ${!config.showDownloads ? '' : ''}`}>
          <SectionHeader
            eyebrow="Quality"
            title={ratingLabel}
            subtitle="Average star score out of 5 - size-independent quality signal"
          />
          <div className="visual-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ratingBar} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid className="chart-grid" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 5]} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey={ratingLabel} radius={[8, 8, 0, 0]}>
                  {ratingBar.map(row => <Cell key={row.name} fill={row.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`liquid-glass chart-panel panel-shell ${!config.showDownloads ? 'xl:col-span-1' : ''}`}>
          <SectionHeader eyebrow="Volume" title="Total reviews" subtitle="Written public reviews" />
          <div className="visual-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={reviewsBar} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid className="chart-grid" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="reviews" name="Reviews" radius={[8, 8, 0, 0]}>
                  {reviewsBar.map(row => <Cell key={row.name} fill={row.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {config.showNormalizedVolume && hasDownloadMetrics ? (
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
        ) : null}

        <div className={`liquid-glass chart-panel panel-shell xl:col-span-2 ${!config.showDownloads && !config.showNormalizedVolume ? '' : ''}`}>
          <SectionHeader
            eyebrow="Sentiment shape"
            title="Star mix - share of all ratings"
            subtitle="% of each operator's ratings at 1-5 stars - fairer than raw counts when bases differ"
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

      {config.showTopicBoard ? (
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
      ) : null}
    </div>
  )
}
