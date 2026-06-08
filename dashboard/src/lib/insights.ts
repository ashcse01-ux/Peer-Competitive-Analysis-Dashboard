export const OPERATOR_COLOR_MAP: Record<string, string> = {
  freshbus: '#2563EB',
  neugo: '#F97316',
  flixbus: '#16A34A',
  zingbus: '#9333EA',
  leafy: '#94A3B8',
  intrcity: '#0D9488',
}

export const OPERATOR_COLORS = Object.values(OPERATOR_COLOR_MAP)
export const NEON_OPERATOR_COLORS = OPERATOR_COLORS

export const TAG_COLORS = [
  '#2563EB',
  '#F97316',
  '#9333EA',
  '#16A34A',
  '#0D9488',
  '#94A3B8',
  '#0077FF',
  '#00D4FF',
  '#FFB000',
]

export const SOURCE_LABELS: Record<string, string> = {
  google_play: 'Google Play Store',
  ios_app_store: 'Apple App Store',
  google_reviews: 'Google Search Reviews',
  redbus_overall: 'Redbus Reviews',
}

const NAME_TO_SLUG: Record<string, string> = {
  FreshBus: 'freshbus',
  Neugo: 'neugo',
  FlixBus: 'flixbus',
  Zingbus: 'zingbus',
  Leafy: 'leafy',
  'IntrCity SmartBus': 'intrcity',
}

export function operatorColor(slug: string): string {
  return OPERATOR_COLOR_MAP[slug] ?? '#64748B'
}

export function operatorColorByName(name: string): string {
  const slug = NAME_TO_SLUG[name]
  return slug ? operatorColor(slug) : '#64748B'
}

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export function asNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function average(values: Array<number | null | undefined>) {
  const nums = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (!nums.length) return null
  return nums.reduce((sum, value) => sum + value, 0) / nums.length
}

export function sum(values: Array<number | null | undefined>) {
  const nums = values.filter((value): value is number => value != null && Number.isFinite(value))
  return nums.reduce((total, value) => total + value, 0)
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function sentimentToFive(value: number | null | undefined) {
  if (value == null) return null
  return ((clamp(value, -1, 1) + 1) / 2) * 5
}

export function formatMetric(value: number | string | null | undefined, digits = 1) {
  const numeric = asNumber(value)
  if (numeric == null) return 'No data'
  return numeric.toFixed(digits)
}

export function formatStarRating(value: number | null | undefined, digits = 1) {
  const numeric = asNumber(value)
  if (numeric == null) return 'No data'
  return `${numeric.toFixed(digits)} ★`
}

export function formatCompact(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'No data'
  return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function formatReviewCount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'No reviews'
  return `${value.toLocaleString('en-IN')} reviews`
}

export function formatDelta(delta: number | null | undefined, digits = 2) {
  if (delta == null || !Number.isFinite(delta)) return null
  const sign = delta >= 0 ? '+' : '-'
  return `${sign}${Math.abs(delta).toFixed(digits)}`
}

export function deltaTone(delta: number | null | undefined) {
  if (delta == null) return 'neutral'
  if (delta > 0) return 'positive'
  if (delta < 0) return 'negative'
  return 'neutral'
}

export function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('')
}

export function sourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source.replace(/_/g, ' ')
}

export function rankTone(rank: number | null | undefined) {
  if (rank == null) return 'muted'
  if (rank <= 2) return 'good'
  if (rank <= 4) return 'watch'
  return 'risk'
}

export function scoreBand(value: number | null | undefined, max = 5) {
  if (value == null) return 'No data'
  const ratio = value / max
  if (ratio >= 0.84) return 'Excellent'
  if (ratio >= 0.74) return 'Good'
  if (ratio >= 0.62) return 'Average'
  return 'Needs work'
}

export function latestTimestamp(values: Array<string | null | undefined>) {
  const dates = values
    .map(value => value ? new Date(value).getTime() : NaN)
    .filter(Number.isFinite)
  if (!dates.length) return null
  return new Date(Math.max(...dates)).toLocaleString()
}

export function pct(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return 'No data'
  return `${(value * 100).toFixed(digits)}%`
}
