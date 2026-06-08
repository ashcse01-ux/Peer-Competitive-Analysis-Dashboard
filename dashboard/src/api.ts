/**
 * api.ts — React Query wrappers for all API endpoints. Task 10.2
 */
import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReviewClassificationResponse } from './lib/reviewDimensions'

const BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? ''

const http = axios.create({ baseURL: BASE })

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
  sentiment_score: number | null
  positive_review_ratio: number | null; rating_delta_mom: number | null
  cycle_timestamp: string | null; is_stale: boolean
  downloads?: string | null
}

export interface GoogleEntry {
  operator_id: number; operator_name: string; operator_slug: string
  overall_rating: number | null; review_count: number | null
  sentiment_score: number | null; positive_review_ratio: number | null
  rating_delta_mom: number | null; cycle_timestamp: string | null; is_stale: boolean
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
  cycle_id?: number; status: string
  fetch_phase?: string; operators_ready?: number; last_error?: string | null
  triggered_at?: string; completed_at?: string; stale_sources?: string[]
}

export interface RedbusTag {
  id: string; label: string
}

export interface OperatorTagScore {
  tag_id: string; label: string; score: number; max: number
}

export interface RedbusTagOperator {
  operator_id: number; operator_name: string; operator_slug: string
  tags: OperatorTagScore[]
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
  operators:      ()                => http.get<Operator[]>('/api/v1/operators').then(r => r.data),
  overview:       ()                => http.get<{operators: OverviewOperator[]}>('/api/v1/metrics/overview').then(r => r.data),
  appStore:       ()                => http.get<{data: AppStoreEntry[]}>('/api/v1/metrics/app-store').then(r => r.data),
  googleReviews:  (from?: string, to?: string) => {
    const params: Record<string,string> = {}
    if (from) params.from = from
    if (to)   params.to   = to
    return http.get<{data: GoogleEntry[]}>('/api/v1/metrics/google-reviews', { params }).then(r => r.data)
  },
  redbus:         ()                => http.get<{data: RedbusCell[]}>('/api/v1/metrics/redbus').then(r => r.data),
  redbusRoute:    (id: number)      => http.get(`/api/v1/metrics/redbus/${id}`).then(r => r.data),
  history:        (source: string)  => http.get<{source:string, series: HistorySeries[]}>(`/api/v1/history/${source}`).then(r => r.data),
  topReviews:     (slug?: string, source?: string) => {
    const params: Record<string,string> = {}
    if (slug)   params.operator_slug = slug
    if (source) params.source        = source
    return http.get<{reviews: TopReviewGroup[]}>('/api/v1/reviews/top', { params }).then(r => r.data)
  },
  refreshStatus:  ()                => http.get<RefreshStatus>('/api/v1/refresh/status').then(r => r.data),
  redbusTags:     (routeId?: number) => {
    const params: Record<string, any> = {}
    if (routeId) params.route_id = routeId
    return http.get<RedbusTagsResponse>('/api/v1/metrics/redbus/tags', { params }).then(r => r.data)
  },
  reviewClassification: (source: string) =>
    http.get<ReviewClassificationResponse>(`/api/v1/metrics/review-classification/${source}`).then(r => r.data),
  triggerRefresh: () => http.post<{ message: string }>('/api/v1/refresh/trigger').then(r => r.data),
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

export function useTriggerRefresh() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fetch.triggerRefresh,
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })
}
