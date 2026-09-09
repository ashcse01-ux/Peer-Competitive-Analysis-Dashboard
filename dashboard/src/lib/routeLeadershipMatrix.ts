import type { RedbusSrpEntry, RedbusTagOperator } from '../api'
import { displayOperatorName, isFreshBus } from './marketplaceConfig'
import { redbusRouteKey, redbusSrpRouteLabel } from './redbusRoutes'

/** Peers need this many services to qualify as an official benchmark. */
export const MIN_SERVICES_FOR_OFFICIAL_RANK = 3

export type MatrixDimId =
  | 'srp'
  | 'rating'
  | 'avgReviews'
  | 'occupancy'
  | 'punctuality'
  | 'driving'
  | 'seat_comfort'
  | 'staff_behavior'
  | 'cleanliness'
  | 'ac'
  | 'rest_stop_hygiene'
  | 'live_tracking'

export type ConfidenceLevel = 'limited' | 'moderate' | 'high' | 'insufficient'

export interface MatrixColumn {
  id: MatrixDimId
  label: string
  /** Counts toward FreshBus Leadership X/11 */
  counted: boolean
  /** Competitive ranked column vs supporting value-only */
  competitive: boolean
  format: 'srp' | 'rating' | 'reviews' | 'occupancy' | 'score'
  direction?: 'higher' | 'lower'
  tagId?: string
}

export const LEADERSHIP_COLUMNS: MatrixColumn[] = [
  { id: 'srp', label: 'SRP', counted: true, competitive: true, format: 'srp', direction: 'lower' },
  {
    id: 'rating',
    label: 'Rating',
    counted: true,
    competitive: true,
    format: 'rating',
    direction: 'higher',
  },
  {
    id: 'avgReviews',
    label: 'Avg Total No. of Ratings',
    counted: false,
    competitive: false,
    format: 'reviews',
  },
  {
    id: 'occupancy',
    label: 'Occupancy %',
    counted: true,
    competitive: true,
    format: 'occupancy',
    direction: 'higher',
  },
]

export const LEADERSHIP_DIM_COUNT = LEADERSHIP_COLUMNS.filter(c => c.counted).length

export interface OperatorStanding {
  operator: string
  name: string
  isFreshBus: boolean
  value: number
  serviceCount: number
  confidence: ConfidenceLevel
  /** Rank among official (3+) peers only */
  officialRank: number | null
  /**
   * Rank among official peers + FreshBus (always retained).
   * Used for FreshBus medals / main-table position.
   */
  displayRank: number | null
  insufficientSample: boolean
  status: 'Official' | 'Insufficient sample' | 'Focal'
}

export interface DimensionStanding {
  officialLeader: OperatorStanding | null
  freshbus: OperatorStanding | null
  /** FreshBus is #1 among official peers + itself */
  freshbusIsLeader: boolean
  rankings: OperatorStanding[]
  supportingValue: number | null
}

export interface RouteLeadershipRow {
  routeKey: string
  routeLabel: string
  freshbusLeadWins: number
  /** True when FreshBus has any counted KPI with limited sample on this route */
  freshbusLimitedSample: boolean
  dimensions: Record<MatrixDimId, DimensionStanding>
}

function parseRating(raw: string | null | undefined): number | null {
  if (!raw || raw === '0') return null
  const n = parseFloat(String(raw))
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseReviews(raw: string | null | undefined): number | null {
  if (!raw) return null
  const n = Number(String(raw).replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function serviceAvgSrp(row: RedbusSrpEntry): number | null {
  const slots = Object.values(row.snapshots || {})
    .map(Number)
    .filter(n => Number.isFinite(n) && n > 0)
  return mean(slots)
}

function routeKeyFromLabel(routeLabel: string): string | null {
  const m = routeLabel.match(/^(.+?)\s*→\s*(.+)$/)
  if (!m) return null
  return redbusRouteKey(m[1].trim(), m[2].trim())
}

function normalizeOp(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function matchTagOperator(
  srpName: string,
  tagOperators: RedbusTagOperator[],
): RedbusTagOperator | undefined {
  if (!tagOperators.length) return undefined
  if (isFreshBus(srpName)) return tagOperators.find(t => isFreshBus(t.operator_name))
  const n = normalizeOp(srpName)
  return (
    tagOperators.find(t => normalizeOp(t.operator_name) === n) ||
    tagOperators.find(t => {
      const tn = normalizeOp(t.operator_name)
      return n.includes(tn) || tn.includes(n)
    })
  )
}

function displayName(operator: string): string {
  return isFreshBus(operator) ? 'FreshBus' : displayOperatorName(operator)
}

export function confidenceFor(serviceCount: number, fresh: boolean): ConfidenceLevel {
  if (serviceCount <= 2) return fresh ? 'limited' : 'insufficient'
  if (serviceCount <= 4) return 'moderate'
  return 'high'
}

export function confidenceLabel(level: ConfidenceLevel): string {
  switch (level) {
    case 'limited':
      return 'Limited data'
    case 'moderate':
      return 'Moderate confidence'
    case 'high':
      return 'High confidence'
    case 'insufficient':
      return 'Insufficient sample'
  }
}

function sortByValue<T extends { value: number; operator: string }>(
  list: T[],
  direction: 'higher' | 'lower',
): T[] {
  return [...list].sort((a, b) => {
    if (direction === 'lower') return a.value - b.value || a.operator.localeCompare(b.operator)
    return b.value - a.value || a.operator.localeCompare(b.operator)
  })
}

interface OpAgg {
  operator: string
  serviceCount: number
  srps: number[]
  ratings: number[]
  reviews: number[]
  occ: number[]
}

function aggregateByRoute(rows: RedbusSrpEntry[]) {
  const byRoute = new Map<string, Map<string, OpAgg>>()
  for (const row of rows) {
    const routeLabel = row.route?.trim()
    if (!routeLabel) continue
    if (!byRoute.has(routeLabel)) byRoute.set(routeLabel, new Map())
    const ops = byRoute.get(routeLabel)!
    if (!ops.has(row.operator)) {
      ops.set(row.operator, {
        operator: row.operator,
        serviceCount: 0,
        srps: [],
        ratings: [],
        reviews: [],
        occ: [],
      })
    }
    const agg = ops.get(row.operator)!
    agg.serviceCount += 1
    const srp = serviceAvgSrp(row)
    if (srp != null) agg.srps.push(srp)
    const rating = parseRating(row.rating)
    if (rating != null) agg.ratings.push(rating)
    const reviews = parseReviews(row.reviews)
    if (reviews != null) agg.reviews.push(reviews)
    if (row.occupancy_pct != null && Number.isFinite(Number(row.occupancy_pct))) {
      agg.occ.push(Number(row.occupancy_pct))
    }
  }
  return byRoute
}

function tagScore100(tagOp: RedbusTagOperator, tagId: string): number | null {
  const hit = tagOp.tags.find(t => t.tag_id === tagId)
  if (!hit || !Number.isFinite(hit.score)) return null
  return Math.round(Math.min(5, Math.max(0, hit.score)) * 20)
}

interface MetricCandidate {
  operator: string
  value: number
  serviceCount: number
}

function toStanding(
  c: MetricCandidate,
  extras: Partial<Pick<OperatorStanding, 'officialRank' | 'displayRank' | 'status'>>,
): OperatorStanding {
  const fresh = isFreshBus(c.operator)
  const insufficient = !fresh && c.serviceCount < MIN_SERVICES_FOR_OFFICIAL_RANK
  let status: OperatorStanding['status'] = 'Official'
  if (fresh && c.serviceCount < MIN_SERVICES_FOR_OFFICIAL_RANK) status = 'Focal'
  else if (insufficient) status = 'Insufficient sample'

  return {
    operator: c.operator,
    name: displayName(c.operator),
    isFreshBus: fresh,
    value: c.value,
    serviceCount: c.serviceCount,
    confidence: confidenceFor(c.serviceCount, fresh),
    officialRank: extras.officialRank ?? null,
    displayRank: extras.displayRank ?? null,
    insufficientSample: insufficient,
    status: extras.status ?? status,
  }
}

function buildCompetitiveStanding(
  candidates: MetricCandidate[],
  direction: 'higher' | 'lower',
): DimensionStanding {
  const valid = candidates.filter(c => Number.isFinite(c.value))
  if (!valid.length) {
    return {
      officialLeader: null,
      freshbus: null,
      freshbusIsLeader: false,
      rankings: [],
      supportingValue: null,
    }
  }

  const eligible = sortByValue(
    valid.filter(c => c.serviceCount >= MIN_SERVICES_FOR_OFFICIAL_RANK),
    direction,
  )
  const insufficientPeers = sortByValue(
    valid.filter(c => !isFreshBus(c.operator) && c.serviceCount < MIN_SERVICES_FOR_OFFICIAL_RANK),
    direction,
  )
  const freshbusCand = valid.find(c => isFreshBus(c.operator)) ?? null

  const officialRank = new Map<string, number>()
  eligible.forEach((c, i) => officialRank.set(c.operator, i + 1))

  // FreshBus position pool: all official peers + FreshBus (always retained)
  const positionPool: MetricCandidate[] = [...eligible]
  if (freshbusCand && !eligible.some(c => isFreshBus(c.operator))) {
    positionPool.push(freshbusCand)
  }
  const sortedPosition = sortByValue(positionPool, direction)
  const displayRank = new Map<string, number>()
  sortedPosition.forEach((c, i) => displayRank.set(c.operator, i + 1))

  const officialLeaderCand = eligible[0] ?? null
  const officialLeader = officialLeaderCand
    ? toStanding(officialLeaderCand, {
        officialRank: 1,
        displayRank: displayRank.get(officialLeaderCand.operator) ?? 1,
        status: 'Official',
      })
    : null

  const freshbus = freshbusCand
    ? toStanding(freshbusCand, {
        officialRank: officialRank.get(freshbusCand.operator) ?? null,
        displayRank: displayRank.get(freshbusCand.operator) ?? null,
      })
    : null

  const freshbusIsLeader = Boolean(freshbus && freshbus.displayRank === 1)

  const rankings: OperatorStanding[] = []
  for (const c of eligible) {
    rankings.push(
      toStanding(c, {
        officialRank: officialRank.get(c.operator)!,
        displayRank: displayRank.get(c.operator) ?? officialRank.get(c.operator)!,
        status: 'Official',
      }),
    )
  }
  // FreshBus with limited sample: inject into rankings by display order
  if (freshbus && freshbus.status === 'Focal') {
    const insertAt = sortedPosition.findIndex(c => isFreshBus(c.operator))
    const row = toStanding(freshbusCand!, {
      officialRank: null,
      displayRank: freshbus.displayRank,
      status: 'Focal',
    })
    if (insertAt <= 0) rankings.unshift(row)
    else if (insertAt >= rankings.length) rankings.push(row)
    else rankings.splice(insertAt, 0, row)
  }
  for (const c of insufficientPeers) {
    rankings.push(
      toStanding(c, {
        officialRank: null,
        displayRank: null,
        status: 'Insufficient sample',
      }),
    )
  }

  return {
    officialLeader,
    freshbus,
    freshbusIsLeader,
    rankings,
    supportingValue: null,
  }
}

function emptyStanding(): DimensionStanding {
  return {
    officialLeader: null,
    freshbus: null,
    freshbusIsLeader: false,
    rankings: [],
    supportingValue: null,
  }
}

export function buildRouteLeadershipMatrix(
  rows: RedbusSrpEntry[],
  tagOperators: RedbusTagOperator[] = [],
): RouteLeadershipRow[] {
  const byRoute = aggregateByRoute(rows)
  const out: RouteLeadershipRow[] = []

  for (const [routeLabel, opsMap] of byRoute.entries()) {
    const operators = [...opsMap.values()]
    if (!operators.some(o => isFreshBus(o.operator))) continue

    const routeKey = routeKeyFromLabel(routeLabel) ?? routeLabel
    const dimensions = {} as Record<MatrixDimId, DimensionStanding>

    const srpCandidates: MetricCandidate[] = operators
      .map(o => ({ operator: o.operator, value: mean(o.srps), serviceCount: o.serviceCount }))
      .filter((o): o is MetricCandidate => o.value != null)

    const ratingCandidates: MetricCandidate[] = operators
      .map(o => ({ operator: o.operator, value: mean(o.ratings), serviceCount: o.serviceCount }))
      .filter((o): o is MetricCandidate => o.value != null)

    const occCandidates: MetricCandidate[] = operators
      .map(o => ({ operator: o.operator, value: mean(o.occ), serviceCount: o.serviceCount }))
      .filter((o): o is MetricCandidate => o.value != null)

    dimensions.srp = buildCompetitiveStanding(srpCandidates, 'lower')
    dimensions.rating = buildCompetitiveStanding(ratingCandidates, 'higher')
    dimensions.occupancy = buildCompetitiveStanding(occCandidates, 'higher')

    const fbAgg = operators.find(o => isFreshBus(o.operator))
    const fbReviews = fbAgg ? mean(fbAgg.reviews) : null
    dimensions.avgReviews = {
      officialLeader: null,
      freshbus: null,
      freshbusIsLeader: false,
      rankings: [],
      supportingValue: fbReviews,
    }

    for (const col of LEADERSHIP_COLUMNS) {
      if (!col.tagId || !col.direction) continue
      const candidates: MetricCandidate[] = []
      for (const o of operators) {
        const tagOp = matchTagOperator(o.operator, tagOperators)
        if (!tagOp) continue
        const score = tagScore100(tagOp, col.tagId)
        if (score == null) continue
        candidates.push({ operator: o.operator, value: score, serviceCount: o.serviceCount })
      }
      dimensions[col.id] = buildCompetitiveStanding(candidates, col.direction)
    }

    for (const col of LEADERSHIP_COLUMNS) {
      if (!dimensions[col.id]) dimensions[col.id] = emptyStanding()
    }

    let wins = 0
    let freshbusLimitedSample = false
    for (const col of LEADERSHIP_COLUMNS) {
      if (!col.counted) continue
      const dim = dimensions[col.id]
      if (dim?.freshbusIsLeader) wins += 1
      if (dim?.freshbus?.confidence === 'limited') freshbusLimitedSample = true
    }

    const label =
      routeKeyFromLabel(routeLabel) != null
        ? redbusSrpRouteLabel(...(routeKey.split('|') as [string, string]))
        : routeLabel

    out.push({
      routeKey,
      routeLabel: label,
      freshbusLeadWins: wins,
      freshbusLimitedSample,
      dimensions,
    })
  }

  out.sort((a, b) => b.freshbusLeadWins - a.freshbusLeadWins || a.routeLabel.localeCompare(b.routeLabel))
  return out
}

export function formatMatrixValue(format: MatrixColumn['format'], value: number): string {
  switch (format) {
    case 'srp':
      return (Math.round(value * 10) / 10).toFixed(1)
    case 'rating':
      return (Math.round(value * 100) / 100).toFixed(2)
    case 'reviews':
      return Math.round(value).toLocaleString('en-IN')
    case 'occupancy':
      return `${(Math.round(value * 10) / 10).toFixed(1)}%`
    case 'score':
      return `${Math.round(value)}`
  }
}

export function freshbusMedal(displayRank: number | null | undefined): string {
  if (displayRank === 1) return '🥇'
  if (displayRank === 2) return '🥈'
  if (displayRank === 3) return '🥉'
  return ''
}
