/**
 * SRP analytical layer — compute Day/Week/Month averages from raw snapshots only.
 * Charts and tables should import from here; never store derived averages in DB.
 */
import { matchTrackedPeer } from './marketplaceConfig'

export const SRP_SLOT_KEYS = ['05:00', '11:00', '17:00', '23:00'] as const
export type SrpSlotKey = (typeof SRP_SLOT_KEYS)[number]

export type WeekBucket = 1 | 2 | 3 | 4

export interface SrpSlotSnapshot {
  srp: number | null
  rating: number | null
  /** Cumulative review count at scrape time — never sum across slots of same service/day. */
  ratingCount: number | null
}

export type SrpSnapshotGrid = Record<string, Record<SrpSlotKey, SrpSlotSnapshot>>

export interface SrpServiceLike {
  serviceId: string
  snapshotsByDate: SrpSnapshotGrid
}

export interface SrpObservation {
  date: string
  slot: SrpSlotKey
  srp: number
}

export interface RatingPoint {
  date: string
  slot: SrpSlotKey
  rating: number
  ratingCount: number
}

export function weekBucketForDay(dayOfMonth: number): WeekBucket {
  if (dayOfMonth <= 7) return 1
  if (dayOfMonth <= 14) return 2
  if (dayOfMonth <= 21) return 3
  return 4
}

export function weekBucketLabel(bucket: WeekBucket): string {
  const labels: Record<WeekBucket, string> = {
    1: 'Week 1 Avg',
    2: 'Week 2 Avg',
    3: 'Week 3 Avg',
    4: 'Week 4 Avg',
  }
  return labels[bucket]
}

export function weekBucketRangeLabel(bucket: WeekBucket): string {
  const labels: Record<WeekBucket, string> = {
    1: '1–7',
    2: '8–14',
    3: '15–21',
    4: '22–EOM',
  }
  return labels[bucket]
}

export function parseIsoDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return { year: y, month: m, day: d }
}

export function datesInRange(startStr: string, endStr: string, maxDays = 31): string[] {
  if (!startStr || !endStr) return []
  const start = new Date(`${startStr}T12:00:00`)
  const end = new Date(`${endStr}T12:00:00`)
  const dates: string[] = []
  const current = new Date(start)
  let safety = 0
  while (current <= end && safety < maxDays) {
    dates.push(current.toISOString().slice(0, 10))
    current.setDate(current.getDate() + 1)
    safety++
  }
  return dates
}

export function canonicalOperatorId(scrapedName: string): string {
  const peer = matchTrackedPeer(scrapedName)
  return peer?.id ?? scrapedName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export function canonicalOperatorDisplay(scrapedName: string): string {
  const peer = matchTrackedPeer(scrapedName)
  return peer?.label ?? scrapedName
}

export function meanOfValues(values: number[]): number | null {
  if (!values.length) return null
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

export function snapshotAt(
  grid: SrpSnapshotGrid,
  date: string,
  slot: SrpSlotKey,
): SrpSlotSnapshot | null {
  return grid[date]?.[slot] ?? null
}

export function srpAt(grid: SrpSnapshotGrid, date: string, slot: SrpSlotKey): number | null {
  const v = snapshotAt(grid, date, slot)?.srp
  return v != null && Number.isFinite(v) ? v : null
}

/** Collect every valid SRP observation for a service within dates (flat list). */
export function collectSrpObservations(
  service: SrpServiceLike,
  dates: string[],
  slotFilter?: SrpSlotKey,
): SrpObservation[] {
  const out: SrpObservation[] = []
  for (const date of dates) {
    const slots = slotFilter ? [slotFilter] : SRP_SLOT_KEYS
    for (const slot of slots) {
      const srp = srpAt(service.snapshotsByDate, date, slot)
      if (srp != null) out.push({ date, slot, srp })
    }
  }
  return out
}

/** @deprecated use collectSrpObservations with optional slot filter */
export function observationsForService(
  service: SrpServiceLike,
  dates: string[],
  slotFilter?: SrpSlotKey,
): SrpObservation[] {
  return collectSrpObservations(service, dates, slotFilter)
}

export function averageSrpForService(
  service: SrpServiceLike,
  dates: string[],
  slotFilter?: SrpSlotKey,
): number | null {
  const obs = collectSrpObservations(service, dates, slotFilter)
  return meanOfValues(obs.map(o => o.srp))
}

/** Collect observations for a single calendar day. */
export function collectDayObservations(service: SrpServiceLike, date: string): number[] {
  return SRP_SLOT_KEYS.map(slot => srpAt(service.snapshotsByDate, date, slot)).filter(
    (v): v is number => v != null,
  )
}

/** Day Avg = mean of valid snapshots that day; missing slots excluded (never 0). */
export function dayAvg(service: SrpServiceLike, date: string): number | null {
  return meanOfValues(collectDayObservations(service, date))
}

export function dayCoverage(service: SrpServiceLike, date: string): { available: number; total: number } {
  const available = collectDayObservations(service, date).length
  return { available, total: SRP_SLOT_KEYS.length }
}

/** Week Avg = mean of ALL valid SRP observations in the week bucket (not mean of daily avgs). */
export function weekAvg(service: SrpServiceLike, dates: string[], bucket: WeekBucket): number | null {
  const obs = collectSrpObservations(service, dates).filter(
    o => weekBucketForDay(parseIsoDate(o.date).day) === bucket,
  )
  return meanOfValues(obs.map(o => o.srp))
}

/** Month Avg = mean of all valid SRP observations in the selected date range. */
export function monthAvg(service: SrpServiceLike, dates: string[]): number | null {
  const obs = collectSrpObservations(service, dates)
  return meanOfValues(obs.map(o => o.srp))
}

export function weekAvgMany(services: SrpServiceLike[], dates: string[], bucket: WeekBucket): number | null {
  const all = services.flatMap(s =>
    collectSrpObservations(s, dates)
      .filter(o => weekBucketForDay(parseIsoDate(o.date).day) === bucket)
      .map(o => o.srp),
  )
  return meanOfValues(all)
}

export function monthAvgMany(services: SrpServiceLike[], dates: string[]): number | null {
  const all = services.flatMap(s => collectSrpObservations(s, dates).map(o => o.srp))
  return meanOfValues(all)
}

export function dayAvgMany(services: SrpServiceLike[], date: string): number | null {
  const all = services.flatMap(s => collectDayObservations(s, date))
  return meanOfValues(all)
}

const SLOT_ORDER: Record<SrpSlotKey, number> = { '05:00': 0, '11:00': 1, '17:00': 2, '23:00': 3 }

function collectRatingPoints(service: SrpServiceLike, dates: string[]): RatingPoint[] {
  const points: RatingPoint[] = []
  for (const date of dates) {
    for (const slot of SRP_SLOT_KEYS) {
      const snap = snapshotAt(service.snapshotsByDate, date, slot)
      if (snap?.rating != null && snap.ratingCount != null && snap.ratingCount > 0) {
        points.push({ date, slot, rating: snap.rating, ratingCount: snap.ratingCount })
      }
    }
  }
  return points
}

function latestRatingPoint(
  points: RatingPoint[],
  predicate: (p: RatingPoint) => boolean,
): RatingPoint | null {
  const filtered = points.filter(predicate)
  if (!filtered.length) return null
  filtered.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return SLOT_ORDER[b.slot] - SLOT_ORDER[a.slot]
  })
  return filtered[filtered.length - 1]
}

/** Prefer 23:00; else latest snapshot that day. Rating count is cumulative — use latest only. */
export function latestRatingForDay(service: SrpServiceLike, date: string): RatingPoint | null {
  const points = collectRatingPoints(service, [date])
  return latestRatingPoint(points, () => true)
}

export function latestRatingForWeek(
  service: SrpServiceLike,
  dates: string[],
  bucket: WeekBucket,
): RatingPoint | null {
  const points = collectRatingPoints(service, dates)
  return latestRatingPoint(points, p => weekBucketForDay(parseIsoDate(p.date).day) === bucket)
}

export function latestRatingInRange(service: SrpServiceLike, dates: string[]): RatingPoint | null {
  return latestRatingPoint(collectRatingPoints(service, dates), () => true)
}

/**
 * Weighted Avg Rating = Σ(rating × ratingCount) / Σ(ratingCount)
 * Each service contributes its latest-in-range snapshot (not 4× same reviews).
 */
export function weightedAvgRatingFromServices(
  services: Array<{ rating: number | null; ratingCount: number | null }>,
): number | null {
  let weighted = 0
  let totalWeight = 0
  for (const s of services) {
    if (s.rating == null || s.ratingCount == null || s.ratingCount <= 0) continue
    weighted += s.rating * s.ratingCount
    totalWeight += s.ratingCount
  }
  if (!totalWeight) return null
  return Math.round((weighted / totalWeight) * 100) / 100
}

export function latestRatingMetaForServices(services: SrpServiceLike[], dates: string[]) {
  const latestPerService = services
    .map(s => latestRatingInRange(s, dates))
    .filter((p): p is RatingPoint => p != null)
  return {
    avgRating: weightedAvgRatingFromServices(
      latestPerService.map(p => ({ rating: p.rating, ratingCount: p.ratingCount })),
    ),
    /** Sum of latest cumulative counts per distinct service listing (not summed across snapshots). */
    ratingCount: latestPerService.length
      ? latestPerService.reduce((sum, p) => sum + p.ratingCount, 0)
      : null,
  }
}

export function formatRankCell(value: number | null): string {
  if (value == null) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function formatHeaderDate(dateStr: string) {
  const { month, day } = parseIsoDate(dateStr)
  return `${month}/${day}`
}

export function datesInWeekBucket(dates: string[], bucket: WeekBucket): string[] {
  return dates.filter(d => weekBucketForDay(parseIsoDate(d).day) === bucket)
}

export function formatDateColumnLabel(dateStr: string) {
  const { month, day } = parseIsoDate(dateStr)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${day} ${months[month - 1] ?? month}`
}

/** Ultra-compact date for dense table headers — e.g. 31/8 */
export function formatDateHeaderShort(dateStr: string) {
  const { month, day } = parseIsoDate(dateStr)
  return `${day}/${month}`
}

export function formatDateDayOfWeek(dateStr: string): string {
  const { year, month, day } = parseIsoDate(dateStr)
  const d = new Date(Date.UTC(year, month - 1, day))
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] ?? ''
}

export function formatSnapshotSlotShort(slot: SrpSlotKey): string {
  const h = Number.parseInt(slot.split(':')[0] ?? '0', 10)
  if (h === 5) return '5am'
  if (h === 11) return '11am'
  if (h === 17) return '5pm'
  return '11pm'
}

export function slotColumnTitle(date: string, slot: SrpSlotKey) {
  return `${formatDateColumnLabel(date)} · ${slot}`
}
