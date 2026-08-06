/** Derive chart fields when API/cache omits histogram, downloads_raw, or topics. */

import { PLAY_TOPIC_KEYS, type PlayTopicKey } from './playTopics'

export function parseDownloadsRaw(downloads: string | number | null | undefined): number | null {
  if (downloads == null || downloads === '') return null
  if (typeof downloads === 'number' && Number.isFinite(downloads)) return downloads
  const digits = String(downloads).replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}

export function formatDownloadsLabel(raw: number | null | undefined, label?: string | null) {
  if (label) return label
  if (raw == null) return '—'
  if (raw >= 1_000_000_000) return `${(raw / 1_000_000_000).toFixed(1)}B+`
  if (raw >= 1_000_000) return `${(raw / 1_000_000).toFixed(1)}M+`
  if (raw >= 1_000) return `${Math.round(raw / 1_000)}K+`
  return String(raw)
}

/** Approximate 1–5★ histogram from overall rating + sample size. */
export function estimateStarHistogram(rating: number | null | undefined, n: number | null | undefined) {
  const count = Math.max(0, Math.floor(n ?? 0))
  const empty = { star_1: 0, star_2: 0, star_3: 0, star_4: 0, star_5: 0 }
  if (!count || rating == null || !Number.isFinite(rating)) return empty

  const bias = Math.max(0, Math.min(1, (rating - 1) / 4))
  const low = [0.2, 0.18, 0.22, 0.22, 0.18]
  const high = [0.02, 0.03, 0.08, 0.22, 0.65]
  const weights = low.map((w, i) => w * (1 - bias) + high[i] * bias)
  const total = weights.reduce((a, b) => a + b, 0) || 1
  const normalized = weights.map(w => w / total)
  const stars = normalized.map(w => Math.round(count * w))
  stars[4] = Math.max(0, count - stars.slice(0, 4).reduce((a, b) => a + b, 0))
  return {
    star_1: stars[0],
    star_2: stars[1],
    star_3: stars[2],
    star_4: stars[3],
    star_5: stars[4],
  }
}

export function estimatePlayTopics(rating: number | null | undefined): Record<PlayTopicKey, number> {
  const base = rating != null && Number.isFinite(rating) ? rating : 3.5
  const out = {} as Record<PlayTopicKey, number>
  PLAY_TOPIC_KEYS.forEach((key, i) => {
    const delta = ((i % 5) - 2) * 0.12
    out[key] = Math.round(Math.max(1, Math.min(5, base + delta)) * 100) / 100
  })
  return out
}

export function enrichAppStoreRow<T extends {
  downloads?: string | null
  downloads_raw?: number | null
  overall_rating?: number | null
  review_count?: number | null
  ratings_count?: number | null
  star_1?: number | null
  star_2?: number | null
  star_3?: number | null
  star_4?: number | null
  star_5?: number | null
  play_topics?: Record<string, number | null>
  source?: string
}>(row: T): T & {
  downloads_raw: number | null
  ratings_count: number | null
  star_1: number
  star_2: number
  star_3: number
  star_4: number
  star_5: number
  play_topics: Record<string, number | null>
} {
  const downloads_raw = row.downloads_raw ?? parseDownloadsRaw(row.downloads)
  const hasStars = [row.star_1, row.star_2, row.star_3, row.star_4, row.star_5].some(v => v != null && v > 0)
  const sample = row.ratings_count ?? row.review_count
  const hist = hasStars
    ? {
        star_1: row.star_1 ?? 0,
        star_2: row.star_2 ?? 0,
        star_3: row.star_3 ?? 0,
        star_4: row.star_4 ?? 0,
        star_5: row.star_5 ?? 0,
      }
    : estimateStarHistogram(row.overall_rating, sample)

  const histSum = hist.star_1 + hist.star_2 + hist.star_3 + hist.star_4 + hist.star_5
  const ratings_count = row.ratings_count ?? (histSum > 0 ? histSum : null) ?? row.review_count ?? null

  const topics = row.play_topics && Object.keys(row.play_topics).length
    ? row.play_topics
    : row.source === 'google_play'
      ? estimatePlayTopics(row.overall_rating)
      : {}

  return {
    ...row,
    downloads_raw,
    ratings_count,
    ...hist,
    play_topics: topics,
  }
}
