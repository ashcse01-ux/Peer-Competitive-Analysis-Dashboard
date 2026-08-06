/** Canonical Redbus directions (matches scraper/config/redbus_routes.json). */

export const REDBUS_ROUTE_PAIRS: readonly (readonly [string, string])[] = [
  ['Vijayawada', 'Visakhapatnam'],
  ['Visakhapatnam', 'Vijayawada'],
  ['Vijayawada', 'Hyderabad'],
  ['Hyderabad', 'Vijayawada'],
  ['Bangalore', 'Tirupati'],
  ['Tirupati', 'Bangalore'],
  ['Chennai', 'Bangalore'],
  ['Bangalore', 'Chennai'],
  ['Chennai', 'Tirupati'],
  ['Tirupati', 'Chennai'],
  ['Bangalore', 'Erode'],
  ['Chennai', 'Pondicherry'],
  ['Eluru', 'Hyderabad'],
  ['Erode', 'Bangalore'],
  ['Hyderabad', 'Eluru'],
  ['Pondicherry', 'Chennai'],
  ['Bangalore', 'Pondicherry'],
  ['Pondicherry', 'Bangalore'],
  ['Vijayawada', 'Tirupati'],
  ['Tirupati', 'Vijayawada'],
  ['Coimbatore', 'Bangalore'],
  ['Bangalore', 'Coimbatore'],
  ['Madurai', 'Coimbatore'],
  ['Coimbatore', 'Madurai'],
] as const

export function redbusRouteKey(origin: string, destination: string) {
  return `${origin}|${destination}`
}

export function routeDisplayLabel(origin: string, destination: string) {
  return `${origin} – ${destination}`
}

export function canonicalRouteSortKey(origin: string, destination: string) {
  const key = redbusRouteKey(origin, destination)
  const idx = REDBUS_ROUTE_PAIRS.findIndex(([o, d]) => redbusRouteKey(o, d) === key)
  return idx === -1 ? 9999 : idx
}

export function redbusSrpRouteLabel(origin: string, destination: string) {
  return `${origin} → ${destination}`
}

export function canonicalSrpRouteOptions(apiRoutes: string[] = []): string[] {
  const canonical = REDBUS_ROUTE_PAIRS.map(([o, d]) => redbusSrpRouteLabel(o, d))
  const merged = new Set([...canonical, ...apiRoutes])
  const order = new Map(canonical.map((label, i) => [label, i]))
  return [...merged].sort((a, b) => {
    const ai = order.get(a) ?? 9999
    const bi = order.get(b) ?? 9999
    if (ai !== bi) return ai - bi
    return a.localeCompare(b)
  })
}

export type RedbusRouteRef = { id: number; origin: string; destination: string }

/** All 24 canonical routes for filters/tables; uses API ids when present. */
export function orderRedbusRoutes(routes: RedbusRouteRef[]): RedbusRouteRef[] {
  const byKey = new Map(routes.map(r => [redbusRouteKey(r.origin, r.destination), r]))
  const ordered: RedbusRouteRef[] = []
  REDBUS_ROUTE_PAIRS.forEach(([origin, destination], index) => {
    const hit = byKey.get(redbusRouteKey(origin, destination))
    ordered.push(hit ?? { id: index + 1, origin, destination })
  })
  const knownKeys = new Set(ordered.map(r => redbusRouteKey(r.origin, r.destination)))
  routes
    .filter(r => !knownKeys.has(redbusRouteKey(r.origin, r.destination)))
    .sort((a, b) => routeDisplayLabel(a.origin, a.destination).localeCompare(routeDisplayLabel(b.origin, b.destination)))
    .forEach(r => ordered.push(r))
  return ordered
}
