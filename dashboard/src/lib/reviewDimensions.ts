/** Fifteen review-topic dimensions for classifying text reviews. */

export interface ReviewDimension {
  id: string
  label: string
  shortLabel: string
}

export const REVIEW_DIMENSIONS: ReviewDimension[] = [
  { id: 'punctuality', label: 'Punctuality & Delays', shortLabel: 'Punctuality' },
  { id: 'staff_service', label: 'Staff & Service', shortLabel: 'Staff' },
  { id: 'cleanliness', label: 'Cleanliness & Hygiene', shortLabel: 'Cleanliness' },
  { id: 'seat_comfort', label: 'Seat Comfort', shortLabel: 'Comfort' },
  { id: 'driving_safety', label: 'Driving & Safety', shortLabel: 'Driving' },
  { id: 'ac_climate', label: 'AC & Climate', shortLabel: 'AC' },
  { id: 'booking_app', label: 'Booking & App UX', shortLabel: 'Booking' },
  { id: 'pricing_value', label: 'Pricing & Value', shortLabel: 'Pricing' },
  { id: 'cancellation_refund', label: 'Cancellation & Refunds', shortLabel: 'Refunds' },
  { id: 'live_tracking', label: 'Live Tracking', shortLabel: 'Tracking' },
  { id: 'rest_stops', label: 'Rest Stops', shortLabel: 'Rest stops' },
  { id: 'luggage', label: 'Luggage Handling', shortLabel: 'Luggage' },
  { id: 'amenities', label: 'Onboard Amenities', shortLabel: 'Amenities' },
  { id: 'customer_support', label: 'Customer Support', shortLabel: 'Support' },
  { id: 'overall_experience', label: 'Overall Experience', shortLabel: 'Overall' },
]

export const DIMENSION_COLORS = [
  '#2563EB', '#F97316', '#9333EA', '#16A34A', '#0D9488',
  '#0077FF', '#00D4FF', '#FFB000', '#FF6B35', '#FF3D9A',
  '#94A3B8', '#39FF14', '#B24FFF', '#F45D48', '#64748B',
]

export interface DimensionScore {
  dimension_id: string
  label: string
  score: number
  mention_count: number
  mention_pct: number
}

export interface OperatorClassification {
  operator_id: number
  operator_name: string
  operator_slug: string
  review_count: number
  dimensions: DimensionScore[]
  top_strength: string | null
  top_weakness: string | null
}

export interface ReviewClassificationResponse {
  source: string
  dimensions: { id: string; label: string }[]
  operators: OperatorClassification[]
}
