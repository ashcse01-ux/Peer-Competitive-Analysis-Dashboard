/** Bus-type & rating classification for Redbus SRP filters (from scraped bus_type / rating text). */

export type BusTypeBucket = 'seater' | 'sleeper' | 'semi' | 'others'

export type RatingBucket = 'above_4_5' | 'between_4_4_5' | 'below_4'

/** @deprecated Prefer RatingBucket[] multi-select; kept for older call sites. */
export type RatingFilter = 'all' | RatingBucket

export const BUS_TYPE_OPTIONS: { id: BusTypeBucket; label: string }[] = [
  { id: 'seater', label: 'Seater' },
  { id: 'sleeper', label: 'Sleeper' },
  { id: 'semi', label: 'Semi' },
  { id: 'others', label: 'Others' },
]

export const RATING_FILTER_OPTIONS: { id: RatingBucket; label: string; hint: string }[] = [
  { id: 'above_4_5', label: 'Above 4.5', hint: '> 4.5' },
  { id: 'between_4_4_5', label: '4 – 4.5', hint: 'Inclusive' },
  { id: 'below_4', label: 'Below 4', hint: '< 4' },
]

export const BUS_TYPE_IDS = BUS_TYPE_OPTIONS.map(o => o.id)
export const RATING_BUCKET_IDS = RATING_FILTER_OPTIONS.map(o => o.id)

const BUS_TYPE_LABEL: Record<BusTypeBucket, string> = Object.fromEntries(
  BUS_TYPE_OPTIONS.map(o => [o.id, o.label]),
) as Record<BusTypeBucket, string>

const RATING_LABEL: Record<RatingBucket, string> = Object.fromEntries(
  RATING_FILTER_OPTIONS.map(o => [o.id, o.label]),
) as Record<RatingBucket, string>

export function busTypeLabel(id: string) {
  return BUS_TYPE_LABEL[id as BusTypeBucket] ?? id
}

export function ratingBucketLabel(id: string) {
  return RATING_LABEL[id as RatingBucket] ?? id
}

/** Map Redbus bus_type string → Seater / Sleeper / Semi / Others. */
export function classifyBusType(busType: string | null | undefined): BusTypeBucket {
  const t = (busType || '').toLowerCase()
  const hasSeater = t.includes('seater')
  const hasSleeper = t.includes('sleeper')
  if (hasSeater && hasSleeper) return 'semi'
  if (hasSleeper) return 'sleeper'
  if (hasSeater) return 'seater'
  return 'others'
}

function ratingMatchesBucket(n: number, bucket: RatingBucket): boolean {
  if (bucket === 'above_4_5') return n > 4.5
  if (bucket === 'between_4_4_5') return n >= 4 && n <= 4.5
  if (bucket === 'below_4') return n < 4
  return true
}

/** Empty selection = all ratings. Multiple buckets match with OR. */
export function matchesRatingFilter(
  rating: string | number | null | undefined,
  selected: RatingBucket[] | RatingFilter,
): boolean {
  const buckets: RatingBucket[] = Array.isArray(selected)
    ? selected
    : selected === 'all'
      ? []
      : [selected]
  if (!buckets.length) return true
  const n = typeof rating === 'number' ? rating : parseFloat(String(rating ?? ''))
  if (Number.isNaN(n)) return false
  return buckets.some(b => ratingMatchesBucket(n, b))
}

export function matchesBusTypeFilter(
  busType: string | null | undefined,
  selected: BusTypeBucket[],
): boolean {
  if (!selected.length) return true
  return selected.includes(classifyBusType(busType))
}
