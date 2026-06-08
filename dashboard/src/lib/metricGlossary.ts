/** Short hover tips (7–8 words) for dashboard metrics and headings. */

export const GLOSSARY: Record<string, string> = {
  // Core sentiment & mood
  sentiment: 'How positive or negative reviews feel overall',
  mood: 'Average tone of review text, not stars',
  composite: 'Blended score across all tracked sources',
  compositeScore: 'Weighted average of all platform ratings',

  // Gap & opportunity
  gap: 'Points behind the market leader today',
  freshbusGap: 'FreshBus composite score behind the leader',
  leaderGap: 'Sentiment points behind route leader',
  platformGap: 'Star rating difference between Play and Apple',
  tagGap: 'Tag score difference versus market leader',
  opportunity: 'Priority score: bigger gap means more urgency',
  opportunityIndex: 'Blend of rating gap, route gap, volatility',

  // Momentum & change
  momentum: 'Average rating change across sources this month',
  ratingChange: 'How much ratings moved since last refresh',
  mom: 'Month-over-month change since last data pull',
  delta: 'Up or down change since last refresh cycle',
  volatility: 'How much ratings swung across platforms',

  // Rankings
  rank: 'Position versus competitors on this metric',
  competitiveRank: 'Where operator ranks on this specific route',
  topTwo: 'Share of routes where FreshBus ranks first or second',
  scoreBand: 'Label band: Excellent, Good, Average, Needs work',

  // Coverage & volume
  coverage: 'Percent of expected data points actually filled',
  reviewCount: 'Total reviews collected for this source',
  reviewVolume: 'How many reviews exist for analysis',
  taggedReviews: 'Reviews matched to at least one tag dimension',

  // Redbus tags
  compositeTagScore: 'Average score across all nine tag dimensions',
  strongestDimension: 'Tag where FreshBus scores highest versus peers',
  weakestDimension: 'Tag needing most improvement for FreshBus',
  correlation: 'How often two tag scores rise or fall together',
  marketAvg: 'Average tag score across all operators',

  // Review classification
  reviewClassification: 'Reviews grouped by topic, not read one-by-one',
  dimensionScore: 'Average sentiment for reviews mentioning this topic',
  mentionShare: 'Percent of reviews that mention this topic',

  // Sources
  googlePlay: 'Android app star ratings and Play Store reviews',
  appleStore: 'iOS app star ratings and App Store reviews',
  googleSearch: 'Google Maps and Search location review ratings',
  redbus: 'Redbus route reviews, tags, and route rankings',

  // Charts
  heatmap: 'Color grid: greener is better, redder is worse',
  radar: 'Shape comparing strengths across all dimensions',
  scatter: 'Each dot is one operator plotted on two scores',

  // Status
  stale: 'Source data is older than the refresh window',
  lastRefresh: 'When dashboard data was last fully updated',
  nextRefresh: 'Automatic full refresh runs on the 28th',
  manualRefresh: 'Fetch latest data from all sources now',

  // KPI labels
  overallRating: 'Mean composite score across every operator',
  avgSentiment: 'Mean review tone from minus one to plus one',
  avgRating: 'Mean star rating on a one to five scale',
  riskSignals: 'Operators whose ratings dropped this month',
  fastestRiser: 'Operator with the biggest positive rating change',
  trackedRoutes: 'Unique origin-destination pairs being monitored',
  routeMood: 'Average Redbus review tone across all routes',
  positiveRatio: 'Share of reviews rated four stars or higher',
  actionFocus: 'Routes where FreshBus trails the leader most',
}

export function tip(key: string, fallback?: string): string {
  return GLOSSARY[key] ?? fallback ?? key
}
