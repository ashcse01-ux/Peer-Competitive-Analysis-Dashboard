import routeOperators from '../data/marketplace-routes.json'
import { REDBUS_ROUTE_PAIRS, redbusRouteKey, routeDisplayLabel } from './redbusRoutes'

export type MarketplaceId = 'redbus' | 'abhibus'

export interface MarketplaceRoute {
  id: number
  origin: string
  destination: string
  key: string
  label: string
  operators: string[]
  operatorCount: number
}

export const MARKETPLACE_TAG_IDS = [
  'toilet_cleanliness',
  'punctuality',
  'staff_behavior',
  'cleanliness',
  'seat_comfort',
  'driving',
  'rest_stop_hygiene',
  'live_tracking',
  'ac',
] as const

export type MarketplaceTagId = (typeof MARKETPLACE_TAG_IDS)[number]

export const MARKETPLACE_TAG_LABELS: Record<MarketplaceTagId, string> = {
  toilet_cleanliness: 'Toilet Cleanliness',
  punctuality: 'Punctuality',
  staff_behavior: 'Staff Behavior',
  cleanliness: 'Cleanliness',
  seat_comfort: 'Seat Comfort',
  driving: 'Driving',
  rest_stop_hygiene: 'Rest Stop Hygiene',
  live_tracking: 'Live Tracking',
  ac: 'AC',
}

const OPERATOR_MAP = routeOperators as Record<string, string[]>

export function marketplaceRoutes(): MarketplaceRoute[] {
  return REDBUS_ROUTE_PAIRS.map(([origin, destination], index) => {
    const key = redbusRouteKey(origin, destination)
    const operators = OPERATOR_MAP[key] ?? []
    return {
      id: index + 1,
      origin,
      destination,
      key,
      label: routeDisplayLabel(origin, destination),
      operators,
      operatorCount: operators.length,
    }
  })
}

export function totalMarketplaceOperators(): number {
  const names = new Set<string>()
  marketplaceRoutes().forEach(r => r.operators.forEach(o => names.add(o)))
  return names.size
}

export function isFreshBus(name: string) {
  return name.toUpperCase().includes('FRESHBUS')
}

export function displayOperatorName(name: string) {
  return isFreshBus(name) ? 'FreshBus' : name
}

export function operatorSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function operatorColor(name: string): string {
  if (isFreshBus(name)) return '#FBBC04'
  const palette = ['#0c4dc3', '#7c3aed', '#0891b2', '#dc2626', '#059669', '#ea580c', '#4f46e5', '#be185d']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

export const MARKETPLACE_BRAND: Record<MarketplaceId, { name: string; accent: string; soft: string }> = {
  redbus: { name: 'Redbus', accent: '#0c4dc3', soft: 'rgba(12, 77, 195, 0.12)' },
  abhibus: { name: 'Abhibus', accent: '#E85D04', soft: 'rgba(232, 93, 4, 0.14)' },
}

/** The six peer operators we always surface with dedicated cards. */
export const TRACKED_PEER_OPERATORS = [
  {
    id: 'freshbus',
    label: 'FreshBus',
    shortLabel: 'FreshBus',
    accent: '#FBBC04',
    match: (name: string) => /fresh\s*bus/i.test(name),
  },
  {
    id: 'zingbus',
    label: 'Zingbus',
    shortLabel: 'Zingbus Plus',
    accent: '#7c3aed',
    match: (name: string) => /zing\s*bus/i.test(name),
  },
  {
    id: 'flixbus',
    label: 'FlixBus',
    shortLabel: 'FlixBus',
    accent: '#059669',
    match: (name: string) => /flix\s*bus/i.test(name),
  },
  {
    id: 'intrcity',
    label: 'IntrCity SmartBus',
    shortLabel: 'IntrCity',
    accent: '#0891b2',
    match: (name: string) => /intr\s*city/i.test(name),
  },
  {
    id: 'neugo',
    label: 'NueGo',
    shortLabel: 'NueGo',
    accent: '#dc2626',
    match: (name: string) => /neugo/i.test(name),
  },
  {
    id: 'yolobus',
    label: 'YoloBus',
    shortLabel: 'YoloBus',
    accent: '#ea580c',
    match: (name: string) => /yolo\s*bus/i.test(name),
  },
] as const

export type TrackedPeerId = (typeof TRACKED_PEER_OPERATORS)[number]['id']

export function matchTrackedPeer(name: string) {
  return TRACKED_PEER_OPERATORS.find(p => p.match(name))
}

export function isTrackedPeer(name: string) {
  return Boolean(matchTrackedPeer(name))
}

/** Resolve the route-specific operator label for a tracked peer (if present on corridor). */
export function findRouteOperatorForPeer(routeOperators: string[], peerId: TrackedPeerId): string | null {
  const peer = TRACKED_PEER_OPERATORS.find(p => p.id === peerId)
  if (!peer) return null
  return routeOperators.find(o => peer.match(o)) ?? null
}

export function filterOperatorsBySelection(all: string[], selected: string[]) {
  if (!selected.length || selected.length >= all.length) return all
  const set = new Set(selected)
  return all.filter(o => set.has(o))
}
