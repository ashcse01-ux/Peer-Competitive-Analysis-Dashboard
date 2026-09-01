import { useMemo } from 'react'
import { useAppStore, useGoogleReviews, useRedbus, useRedbusTags, type AppStoreEntry, type RedbusCell } from '../api'
import type { TopicLeader } from '../components/TopicChampionsBoard'
import { enrichAppStoreRow } from './storeMetrics'
import { average, operatorColor } from './insights'
import { PLAY_TOPIC_LABELS, commonPlayTopicKeys, availablePlayTopicKeys } from './playTopics'
import { GOOGLE_SEARCH_DASHBOARD } from './peerDashboardConfig'

export type ChannelLeader = {
  slug: string
  name: string
  color: string
  rating: number | null
}

function leaderByRating(
  rows: { operator_slug: string; operator_name: string; overall_rating: number | null }[],
): ChannelLeader | null {
  if (!rows.length) return null
  const best = [...rows].sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0))[0]
  return {
    slug: best.operator_slug,
    name: best.operator_name,
    color: operatorColor(best.operator_slug),
    rating: best.overall_rating,
  }
}

function playTopicLeaders(playRows: AppStoreEntry[]): TopicLeader[] {
  const summaries = playRows.map(row => {
    const rawTopics = row.play_topics ?? {}
    const e = enrichAppStoreRow(row)
    return {
      slug: e.operator_slug,
      name: e.operator_name,
      color: operatorColor(e.operator_slug),
      playTopics: e.play_topics ?? {},
      availableTopicKeys: availablePlayTopicKeys(rawTopics),
    }
  })

  const sharedKeys = commonPlayTopicKeys(summaries.map(s => s.playTopics))

  return sharedKeys.map(key => {
    let best: (typeof summaries)[0] | null = null
    let bestScore = -1
    for (const s of summaries) {
      if (!s.availableTopicKeys.includes(key)) continue
      const score = s.playTopics[key]
      if (score != null && score > bestScore) {
        bestScore = score
        best = s
      }
    }
    return {
      key,
      label: PLAY_TOPIC_LABELS[key],
      operator: best?.name ?? '—',
      slug: best?.slug ?? '',
      color: best?.color ?? '#94a3b8',
      score: bestScore >= 0 ? bestScore : null,
    }
  })
}

function freshbusTopicWins(leaders: TopicLeader[], freshbusSlug: string) {
  return leaders.filter(l => l.slug === freshbusSlug).length
}

function redbusOperatorScores(cells: RedbusCell[]) {
  const byOp = new Map<number, { slug: string; name: string; ratings: number[]; ranks: number[] }>()
  for (const c of cells) {
    if (c.overall_rating == null && c.sentiment_score == null) continue
    const cur = byOp.get(c.operator_id) ?? {
      slug: c.operator_slug,
      name: c.operator_name,
      ratings: [],
      ranks: [],
    }
    if (c.overall_rating != null) cur.ratings.push(c.overall_rating)
    if (c.competitive_rank != null) cur.ranks.push(c.competitive_rank)
    byOp.set(c.operator_id, cur)
  }
  return [...byOp.values()].map(o => ({
    slug: o.slug,
    name: o.name,
    color: operatorColor(o.slug),
    avgRating: average(o.ratings),
    avgRank: average(o.ranks),
  }))
}

export function useOverviewChannelData() {
  const { data: appData } = useAppStore()
  const { data: googleData } = useGoogleReviews()
  const { data: redbusData } = useRedbus()
  const { data: tagData } = useRedbusTags()

  return useMemo(() => {
    const playRows = (appData?.data ?? []).filter(e => e.source === 'google_play')
    const iosRows = (appData?.data ?? []).filter(e => e.source === 'ios_app_store' && !e.app_absent)
    const googleRows = googleData?.data ?? []
    const cells = redbusData?.data ?? []

    const playLeader = leaderByRating(playRows)
    const iosLeader = leaderByRating(iosRows)
    const googleLeader = leaderByRating(googleRows)
    const topicLeaders = playTopicLeaders(playRows)
    const fbTopicWins = freshbusTopicWins(topicLeaders, 'freshbus')

    const redbusOps = redbusOperatorScores(cells)
    const redbusRatingLeader = [...redbusOps].sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))[0] ?? null
    const freshbusCells = cells.filter(c => c.operator_slug === 'freshbus')
    const freshbusRouteLeads = freshbusCells.filter(c => c.competitive_rank === 1).length
    const routeCount = new Set(cells.map(c => c.route_id)).size

    const tagOperators = tagData?.operators ?? []
    const tagLeader = tagOperators[0]
    const freshbusTags = tagOperators.find(o => o.operator_slug === 'freshbus')

    const playFreshbus = playRows.find(r => r.operator_slug === 'freshbus')
    const iosFreshbus = iosRows.find(r => r.operator_slug === 'freshbus')
    const googleFreshbus = googleRows.find(r => r.operator_slug === 'freshbus')

    return {
      playLeader,
      iosLeader,
      googleLeader,
      googleRatingLabel: GOOGLE_SEARCH_DASHBOARD.ratingCaption,
      topicLeaders,
      fbTopicWins,
      redbusOps,
      redbusRatingLeader,
      freshbusRouteLeads,
      routeCount,
      tagLeader,
      freshbusTags,
      freshbusChannel: {
        playRating: playFreshbus?.overall_rating ?? null,
        iosRating: iosFreshbus?.overall_rating ?? null,
        googleRating: googleFreshbus?.overall_rating ?? null,
        redbusSentiment: average(freshbusCells.map(c => c.sentiment_score)),
        redbusRating: average(freshbusCells.map(c => c.overall_rating)),
      },
    }
  }, [appData, googleData, redbusData, tagData])
}
