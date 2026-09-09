export type PeerDashboardKind = 'google_play' | 'ios_app_store' | 'google_search'

export interface PeerDashboardConfig {
  kind: PeerDashboardKind
  /** App store source when kind is google_play | ios_app_store */
  appStoreSource?: 'google_play' | 'ios_app_store'
  heroEyebrow: string
  /** Table, KPI, and chart label for the star score */
  ratingLabel: string
  ratingCaption: string
  loadingMessage: string
  errorMessage: string
  showTopicBoard: boolean
  /** Downloads column + scale chart (placeholder if unavailable) */
  showDownloads: boolean
  /** Per 10k downloads chart - only when installs exist */
  showNormalizedVolume: boolean
  downloadsUnavailableNote: string
  /** Written-review count is distinct from star ratings (Play yes; Apple publishes one count) */
  showReviewsColumn: boolean
  /** Table column for rating volume */
  ratingsCountLabel: string
  /** Stacked 1–5★ share chart; table Star mix is enough when this is false */
  showStarMixChart: boolean
}

export const GOOGLE_PLAY_DASHBOARD: PeerDashboardConfig = {
  kind: 'google_play',
  appStoreSource: 'google_play',
  heroEyebrow: 'Google Play Store',
  ratingLabel: 'App Rating',
  ratingCaption: 'Google Play Store App Rating',
  loadingMessage: 'Loading Google Play Store metrics…',
  errorMessage: 'Google Play data could not be loaded.',
  showTopicBoard: true,
  showDownloads: true,
  showNormalizedVolume: true,
  downloadsUnavailableNote: '',
  showReviewsColumn: true,
  ratingsCountLabel: 'Ratings',
  showStarMixChart: true,
}

export const IOS_APP_STORE_DASHBOARD: PeerDashboardConfig = {
  kind: 'ios_app_store',
  appStoreSource: 'ios_app_store',
  heroEyebrow: 'Apple iOS Store',
  ratingLabel: 'App Rating',
  ratingCaption: 'Apple iOS Store App Rating',
  loadingMessage: 'Loading Apple iOS Store metrics…',
  errorMessage: 'Apple iOS Store data could not be loaded.',
  showTopicBoard: false,
  showDownloads: false,
  showNormalizedVolume: false,
  downloadsUnavailableNote: '',
  showReviewsColumn: false,
  ratingsCountLabel: 'Ratings',
  showStarMixChart: false,
}

export const GOOGLE_SEARCH_DASHBOARD: PeerDashboardConfig = {
  kind: 'google_search',
  heroEyebrow: 'Google Search',
  ratingLabel: 'Google Search Rating',
  ratingCaption: 'Google Search Rating',
  loadingMessage: 'Loading Google Search metrics…',
  errorMessage: 'Google Search data could not be loaded.',
  showTopicBoard: false,
  showDownloads: false,
  showNormalizedVolume: false,
  downloadsUnavailableNote: '',
  showReviewsColumn: false,
  ratingsCountLabel: 'Total No. of Ratings',
  showStarMixChart: false,
}
