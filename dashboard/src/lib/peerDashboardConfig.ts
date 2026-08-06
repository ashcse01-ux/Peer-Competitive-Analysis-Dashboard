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
}

export const GOOGLE_PLAY_DASHBOARD: PeerDashboardConfig = {
  kind: 'google_play',
  appStoreSource: 'google_play',
  heroEyebrow: 'Google Play Store - Android',
  ratingLabel: 'App Rating',
  ratingCaption: 'Google Play Store App Rating',
  loadingMessage: 'Loading Google Play metrics…',
  errorMessage: 'Google Play data could not be loaded.',
  showTopicBoard: true,
  showDownloads: true,
  showNormalizedVolume: true,
  downloadsUnavailableNote: '',
}

export const IOS_APP_STORE_DASHBOARD: PeerDashboardConfig = {
  kind: 'ios_app_store',
  appStoreSource: 'ios_app_store',
  heroEyebrow: 'Apple App Store - iOS',
  ratingLabel: 'App Rating',
  ratingCaption: 'Apple App Store App Rating',
  loadingMessage: 'Loading iOS App Store metrics…',
  errorMessage: 'Apple App Store data could not be loaded.',
  showTopicBoard: false,
  showDownloads: true,
  showNormalizedVolume: false,
  downloadsUnavailableNote: 'Apple does not publish install counts publicly.',
}

export const GOOGLE_SEARCH_DASHBOARD: PeerDashboardConfig = {
  kind: 'google_search',
  heroEyebrow: 'Google Search - Knowledge Panel',
  ratingLabel: 'Google Search Rating',
  ratingCaption: 'Google Search Rating',
  loadingMessage: 'Loading Google Search metrics…',
  errorMessage: 'Google Search data could not be loaded.',
  showTopicBoard: false,
  showDownloads: false,
  showNormalizedVolume: false,
  downloadsUnavailableNote: '',
}
