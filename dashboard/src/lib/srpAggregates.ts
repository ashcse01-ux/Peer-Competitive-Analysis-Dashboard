/** @deprecated Import from `./srpAnalytics` — re-exports for backward compatibility. */
export {
  SRP_SLOT_KEYS,
  type SrpSlotKey,
  type WeekBucket,
  weekBucketForDay,
  weekBucketLabel,
  weekBucketRangeLabel,
  parseIsoDate,
  datesInRange,
  meanOfValues as meanRank,
  dayAvg as dayAvgFromRecord,
  dayAvg as dayMtdFromRecord,
  weekAvg as weekMtd,
  monthAvg as monthMtd,
  weekAvgMany as rollupWeekMtd,
  monthAvgMany as rollupSrpMonthMtd,
  srpAt as rankAt,
  weightedAvgRatingFromServices as weightedAvgRating,
  latestRatingMetaForServices,
  formatRankCell,
  formatHeaderDate,
  formatDateColumnLabel,
  slotColumnTitle,
  dayCoverage,
  collectSrpObservations,
} from './srpAnalytics'

/** @deprecated Use latestRatingMetaForServices — rating counts must not be summed across snapshots. */
export function sumRatingCounts(
  _items: Array<{ ratingCount: number | null }>,
): number | null {
  return null
}
