/** Hard business rule — marketplace tracking start date (IST). */
export const MARKETPLACE_DATA_START = '2026-09-01'

export const SNAPSHOT_SLOT_LABELS = ['05:00', '11:00', '17:00', '23:00'] as const
export type SnapshotSlotFilter = 'all' | '05:00' | '11:00' | '17:00' | '23:00'

export type ComparePreset = 'previous_period' | 'none'

export const COMPARE_LABELS: Record<ComparePreset, string> = {
  previous_period: 'Previous comparable period',
  none: 'No comparison',
}
