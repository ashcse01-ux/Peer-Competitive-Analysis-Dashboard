/** Play Store review-topic KPIs (Google Play bifurcation). */

export const PLAY_TOPIC_KEYS = [
  'booking_experience',
  'user_interface',
  'customer_support',
  'public_transport',
  'value_for_money',
  'book_transport',
  'pricing_accuracy',
  'navigation_accuracy',
  'entertainment_value',
  'performance',
] as const

export type PlayTopicKey = (typeof PLAY_TOPIC_KEYS)[number]

export const PLAY_TOPIC_LABELS: Record<PlayTopicKey, string> = {
  booking_experience: 'Booking Experience',
  user_interface: 'User Interface',
  customer_support: 'Customer Support',
  public_transport: 'Public Transport',
  value_for_money: 'Value for Money',
  book_transport: 'Book Transport',
  pricing_accuracy: 'Pricing Accuracy',
  navigation_accuracy: 'Navigation Accuracy',
  entertainment_value: 'Entertainment Value',
  performance: 'Performance',
}

export const FB_BLUE = '#0c4dc3'
export const FB_BLUE_DARK = '#0a3fa0'
export const FB_YELLOW = '#FBBC04'
