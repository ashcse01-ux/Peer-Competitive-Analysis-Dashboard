/**
 * api.ts — React Query wrappers for all API endpoints. Task 10.2
 * 
 * In "static mode" (GitHub Pages), data is loaded from pre-built JSON files
 * under /api-static/. When a live backend is available, it uses the real API.
 */
import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReviewClassificationResponse } from './lib/reviewDimensions'

const BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? ''

const http = axios.create({ baseURL: BASE })

// ── Static fallback for GitHub Pages ──────────────────────────────────────

const STATIC_BASE = import.meta.env.BASE_URL + 'api-static'
let _staticMode: boolean | null = null

async function isStaticMode(): Promise<boolean> {
  if (_staticMode !== null) return _staticMode
  try {
    await http.get('/api/v1/operators', { timeout: 3000 })
    _staticMode = false
  } catch {
    _staticMode = true
  }
  return _staticMode
}

async function staticJson<T>(filename: string): Promise<T> {
  const resp = await axios.get<T>(`${STATIC_BASE}/${filename}`)
  return resp.data
}

async function fetchWithFallback<T>(apiFn: () => Promise<T>, staticFile: string): Promise<T> {
  if (await isStaticMode()) {
    return staticJson<T>(staticFile)
  }
  return apiFn()
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface Operator {
  id: number; name: string; slug: string
}

export interface OverviewOperator {
  id: number; name: string; slug: string; rank: number
  composite_score: number | null
  gp_rating: number | null; ios_rating: number | null
  google_rating: number | null; redbus_sentiment: number | null
  gp_review_count: number | null; ios_review_count: number | null
  google_review_count: number | null; redbus_review_count: number | null
  gp_delta: number | null; ios_delta: number | null; google_delta: number | null
  last_updated: string | null
}

export interface AppStoreEntry {
  operator_id: number; operator_name: string; operator_slug: string
  source: string; overall_rating: number | null; review_count: number | null
  ratings_count?: number | null
  sentiment_score: number | null
  positive_review_ratio: number | null; rating_delta_mom: number | null
  cycle_timestamp: string | null; is_stale: boolean
  downloads?: string | null
  downloads_raw?: number | null
  star_1?: number | null
  star_2?: number | null
  star_3?: number | null
  star_4?: number | null
  star_5?: number | null
  play_topics?: Record<string, number | null>
  collection_date?: string | null
}

export interface GoogleEntry {
  operator_id: number; operator_name: string; operator_slug: string
  overall_rating: number | null; review_count: number | null
  sentiment_score: number | null; positive_review_ratio: number | null
  rating_delta_mom: number | null; cycle_timestamp: string | null; is_stale: boolean
  star_1?: number | null
  star_2?: number | null
  star_3?: number | null
  star_4?: number | null
  star_5?: number | null
  collection_date?: string | null
}

export interface RedbusCell {
  operator_id: number; operator_name: string; operator_slug: string
  route_id: number; origin: string; destination: string
  sentiment_score: number | null; overall_rating: number | null; review_count: number | null
  competitive_rank: number | null; is_stale: boolean; cycle_timestamp: string | null
}

export interface HistorySeries {
  operator_name: string; operator_slug: string
  month: string; avg_sentiment: number | null; avg_rating: number | null
}

export interface TopReviewGroup {
  operator_slug: string; source: string
  top_positive: { text: string; score: number }[]
  top_negative: { text: string; score: number }[]
}

export interface RefreshStatus {
  cycle_id: number; status: string; fetch_phase: string | null
  operators_ready: number; last_error: string | null
  triggered_at: string | null; completed_at: string | null
  stale_sources: string[]
}

export interface RedbusTag {
  id: string; label: string; category: string
}

export interface RedbusTagOperator {
  operator_slug: string; operator_name: string
  tags: { tag_id: string; score: number; review_count: number }[]
  composite_tag_score: number
  review_count: number
  rank: number
  cycle_timestamp: string
}

export interface TagCorrelation {
  tag_a: string; tag_b: string; correlation: number
}

export interface RedbusTagsResponse {
  tags: RedbusTag[]
  operators: RedbusTagOperator[]
  correlations: TagCorrelation[]
  insights: {
    strongest_tag_market: string
    weakest_tag_market: string
    freshbus_strength: string
    freshbus_gap: string
    tag_sentiment_driver: string
  }
}

// ── Fetchers ───────────────────────────────────────────────────────────────

const fetch = {
  operators:      ()                => fetchWithFallback(
    () => http.get<Operator[]>('/api/v1/operators').then(r => r.data),
    'operators.json'
  ),
  overview:       ()                => fetchWithFallback(
    () => http.get<{operators: OverviewOperator[]}>('/api/v1/metrics/overview').then(r => r.data),
    'overview.json'
  ),
  appStore:       ()                => fetchWithFallback(
    () => http.get<{data: AppStoreEntry[]}>('/api/v1/metrics/app-store').then(r => r.data),
    'app-store.json'
  ),
  googleReviews:  (from?: string, to?: string) => fetchWithFallback(
    () => {
      const params: Record<string,string> = {}
      if (from) params.from = from
      if (to)   params.to   = to
      return http.get<{data: GoogleEntry[]}>('/api/v1/metrics/google-reviews', { params }).then(r => r.data)
    },
    'google-reviews.json'
  ),
  redbus:         ()                => fetchWithFallback(
    () => http.get<{data: RedbusCell[]}>('/api/v1/metrics/redbus').then(r => r.data),
    'redbus.json'
  ),
  redbusRoute:    (id: number)      => http.get(`/api/v1/metrics/redbus/${id}`).then(r => r.data),
  history:        (source: string)  => fetchWithFallback(
    () => http.get<{source:string, series: HistorySeries[]}>(`/api/v1/history/${source}`).then(r => r.data),
    `history-${source}.json`
  ),
  topReviews:     (slug?: string, source?: string) => fetchWithFallback(
    () => {
      const params: Record<string,string> = {}
      if (slug)   params.operator_slug = slug
      if (source) params.source        = source
      return http.get<{reviews: TopReviewGroup[]}>('/api/v1/reviews/top', { params }).then(r => r.data)
    },
    'reviews-top.json'
  ),
  refreshStatus:  ()                => fetchWithFallback(
    () => http.get<RefreshStatus>('/api/v1/refresh/status').then(r => r.data),
    'refresh-status.json'
  ),
  redbusTags:     (routeId?: number) => fetchWithFallback(
    () => {
      const params: Record<string, any> = {}
      if (routeId) params.route_id = routeId
      return http.get<RedbusTagsResponse>('/api/v1/metrics/redbus/tags', { params }).then(r => r.data)
    },
    'redbus-tags.json'
  ),
  reviewClassification: (source: string) => fetchWithFallback(
    () => http.get<ReviewClassificationResponse>(`/api/v1/metrics/review-classification/${source}`).then(r => r.data),
    `review-classification-${source}.json`
  ),
  redbusSrp: (operator: string, route?: string) => fetchWithFallback(
    () => {
      const params: Record<string, any> = { operator }
      if (route) params.route = route
      return http.get<RedbusSrpResponse>('/api/v1/metrics/redbus/srp', { params }).then(r => r.data)
    },
    'redbus-srp.json'
  ),
  dailySnapshots: () => fetchWithFallback(
    () => http.get<DailySnapshotsResponse>('/api/v1/metrics/daily-snapshots').then(r => r.data),
    'daily-snapshots.json'
  ),
  triggerRefresh: () => http.post<{ message: string }>('/api/v1/refresh/trigger').then(r => r.data),
}

export interface DailySnapshotsResponse {
  generated_at?: string
  anchor_date: string
  days: number
  app_store: AppStoreEntry[]
  google_reviews: GoogleEntry[]
}

export interface RedbusSrpEntry {
  route: string;
  service_key: number;
  service_number: string;
  timing: string;
  rating: string;
  reviews: string;
  feb_mtd: number;
  mar_mtd: number;
  apr_mtd: number;
  may_w1: number;
  may_w2: number;
  may_w3: number;
  may_w4: number;
  may_mtd: number;
  jun_w1: number;
  jun_w2: number;
  jun_w3: number;
  jun_w4: number;
  jun_mtd: number;
  jul_w1: number;
  jul_w2: number;
  jul_w3: number;
  jul_w4: number;
  jul_mtd: number;
  d_08_01: number;
  d_08_02: number;
  d_08_03: number;
  d_08_04: number;
  d_08_05: number;
}

export interface RedbusSrpResponse {
  data: RedbusSrpEntry[];
  routes: string[];
  operators: string[];
}

// ── React Query hooks ──────────────────────────────────────────────────────

export const useOperators     = ()               => useQuery({ queryKey: ['operators'],     queryFn: fetch.operators })
export const useOverview      = ()               => useQuery({ queryKey: ['overview'],      queryFn: fetch.overview, staleTime: 60_000 })
export const useAppStore      = ()               => useQuery({ queryKey: ['app-store'],     queryFn: fetch.appStore })
export const useGoogleReviews = (from?: string, to?: string) =>
  useQuery({ queryKey: ['google-reviews', from, to], queryFn: () => fetch.googleReviews(from, to) })
export const useRedbus        = ()               => useQuery({ queryKey: ['redbus'],        queryFn: fetch.redbus })
export const useRedbusRoute   = (id: number)     => useQuery({ queryKey: ['redbus-route', id], queryFn: () => fetch.redbusRoute(id), enabled: id > 0 })
export const useHistory       = (source: string) => useQuery({ queryKey: ['history', source], queryFn: () => fetch.history(source) })
export const useTopReviews    = (slug?: string, source?: string) =>
  useQuery({ queryKey: ['top-reviews', slug, source], queryFn: () => fetch.topReviews(slug, source) })
export const useRefreshStatus = ()               => useQuery({ queryKey: ['refresh-status'], queryFn: fetch.refreshStatus, refetchInterval: 30_000 })
export const useRedbusTags    = (routeId?: number) => useQuery({ queryKey: ['redbus-tags', routeId],     queryFn: () => fetch.redbusTags(routeId), staleTime: 60_000 })
export const useReviewClassification = (source: string) =>
  useQuery({
    queryKey: ['review-classification', source],
    queryFn: () => fetch.reviewClassification(source),
    staleTime: 60_000,
  })

export const useRedbusSrp = (operator: string, route?: string) =>
  useQuery({
    queryKey: ['redbus-srp', operator, route],
    queryFn: () => fetch.redbusSrp(operator, route),
    staleTime: 30_000,
  })

export const useDailySnapshots = () =>
  useQuery({
    queryKey: ['daily-snapshots'],
    queryFn: fetch.dailySnapshots,
    staleTime: 60_000,
  })

export function useTriggerRefresh() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fetch.triggerRefresh,
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })
}
