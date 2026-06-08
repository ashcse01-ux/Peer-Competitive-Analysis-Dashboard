# Requirements Document

## Introduction

FreshBus requires a competitive benchmarking dashboard that continuously monitors and visualizes performance data for six intercity bus operators — FreshBus, Neugo, FlixBus, Zingbus, Leafy, and IntrCity SmartBus — across three data sources: Google Play Store and iOS App Store ratings/reviews, Google Business/Maps reviews, and Redbus route-specific reviews for eleven key routes. The dashboard presents scraped and computed metrics through a world-class UI featuring heatmaps, bar charts, trend lines, and sentiment breakdowns, with data refreshed monthly (and live where the source permits), and is deployable as a shareable web application.



---

## Glossary

- **System**: The FreshBus Competitor Benchmarking Dashboard application as a whole.
- **Scraper**: The automated data-collection subsystem responsible for fetching raw data from external sources.
- **Aggregator**: The subsystem that normalises, deduplicates, and computes derived metrics from raw scraped data.
- **Dashboard**: The web-based front-end that visualises aggregated metrics to end users.
- **Operator**: One of the six tracked bus companies — FreshBus, Neugo, FlixBus, Zingbus, Leafy, IntrCity SmartBus.
- **App Store Source**: Either the Google Play Store or the Apple iOS App Store.
- **Google Reviews Source**: The Google Business / Google Maps rating and review data surfaced when searching an Operator by name on Google.
- **Redbus Source**: The Redbus.in platform's route-specific traveller reviews.
- **Route**: A named city-pair with a designated origin and destination (both directions are treated as separate entries).
- **Tracked Routes**: The eleven city-pair routes listed in Requirement 4.
- **Sentiment Score**: A numeric value in the range [−1, 1] derived by running review text through a natural-language sentiment analysis model; −1 is maximally negative, 0 is neutral, +1 is maximally positive.
- **Data Refresh Cycle**: The scheduled interval at which the Scraper re-fetches data from a given source — monthly by default, or near-real-time where the source permits.
- **Shareable Link**: A stable, publicly accessible URL that renders the Dashboard without requiring user authentication.
- **Heatmap**: A matrix visualisation where cell colour encodes a numeric metric (e.g., rating, sentiment) across two categorical axes (e.g., Operator × Route).
- **KPI Card**: A compact summary tile displaying a single headline metric with period-over-period change.

---

## Requirements

---

### Requirement 1: App Store Data Collection

**User Story:** As a FreshBus analyst, I want the system to collect app ratings, review counts, and version history from the Google Play Store and iOS App Store for all six operators, so that I can benchmark mobile app quality across the competitive set.

#### Acceptance Criteria

1. THE Scraper SHALL collect, for each Operator, the following fields from the Google Play Store: overall star rating (1–5), total review count, current app version, and the 200 most recent user reviews (text, star rating, date).
2. THE Scraper SHALL collect, for each Operator, the following fields from the iOS App Store: overall star rating (1–5), total review count, current app version, and the 200 most recent user reviews (text, star rating, date).
3. WHEN an Operator does not have a published application on a given App Store Source, THE Scraper SHALL record a null value for that Operator–source combination and log the absence.
4. WHEN the App Store Source returns a rate-limit or captcha response, THE Scraper SHALL apply exponential back-off with a maximum of five retries before marking the collection attempt as failed and alerting the Aggregator.
5. IF the Scraper fails to collect data for an Operator from an App Store Source after all five retries have been exhausted, THEN THE Aggregator SHALL retain the most recently successful dataset for that Operator–source combination and flag the metric as stale in the Dashboard.
6. THE Scraper SHALL complete a full App Store data collection cycle for all six Operators within 60 minutes of the scheduled trigger.

---

### Requirement 2: App Store Metrics Aggregation

**User Story:** As a FreshBus analyst, I want computed metrics derived from app store data — including sentiment scores and rating trends — so that I can understand not just the headline rating but the underlying quality signal.

#### Acceptance Criteria

1. THE Aggregator SHALL compute, for each Operator and each App Store Source, a Sentiment Score across the 200 most recent reviews using a pre-trained multilingual NLP model.
2. THE Aggregator SHALL compute a month-over-month rating delta for each Operator on each App Store Source by comparing the current cycle's overall star rating with the previous cycle's value.
3. THE Aggregator SHALL compute the ratio of positive reviews (Sentiment Score ≥ 0.2) to total reviews for each Operator on each App Store Source, expressed as a percentage (positive review count divided by total review count).
4. WHEN a new Data Refresh Cycle completes, THE Aggregator SHALL update all computed App Store metrics within 15 minutes of raw data ingestion completing.
5. THE Aggregator SHALL store each cycle's computed metrics with a UTC timestamp so that historical trend data is preserved for a minimum of 24 months.

---

### Requirement 3: Google Reviews Data Collection and Aggregation

**User Story:** As a FreshBus analyst, I want the system to collect and analyse Google Business/Maps ratings for all six operators, so that I can benchmark brand reputation as perceived by the general public on Google Search.

#### Acceptance Criteria

1. WHEN a Data Refresh Cycle is triggered, THE Scraper SHALL query Google Search for each Operator's brand name and extract the Google Business / Google Maps panel data including: overall star rating (1–5), total review count, and the 50 most recent reviews (text, star rating, date).
2. WHEN the Google Search result page does not surface a Knowledge Panel or Maps listing for an Operator, THE Scraper SHALL record a null value and log the absence; IF recording the null value fails, THE Scraper SHALL continue processing the remaining Operators without failing the entire collection cycle.
3. THE Aggregator SHALL compute a Sentiment Score for each Operator's Google Reviews using the same NLP model applied in Requirement 2.
4. THE Aggregator SHALL compute a month-over-month rating delta for each Operator's Google Reviews rating.
5. IF the Scraper fails to retrieve Google Reviews data for an Operator after all five retries have been exhausted, THEN THE Aggregator SHALL retain the most recently successful dataset and flag the metric as stale.
6. THE Scraper SHALL complete the Google Reviews collection cycle for all six Operators within 30 minutes of the scheduled trigger, with no minimum completion time enforced.

---

### Requirement 4: Redbus Route-Specific Data Collection

**User Story:** As a FreshBus analyst, I want route-level review data from Redbus for both travel directions on each tracked route, so that I can identify specific corridors where FreshBus is winning or losing against competitors.

#### Acceptance Criteria

1. THE Scraper SHALL collect reviews from Redbus for each Operator on each of the following Routes in both the forward and return directions (22 direction-route combinations per Operator):
   - Bangalore → Chennai and Chennai → Bangalore
   - Bangalore → Pondicherry and Pondicherry → Bangalore
   - Bangalore → Tirupati and Tirupati → Bangalore
   - Visakhapatnam → Vijayawada and Vijayawada → Visakhapatnam
   - Hyderabad → Guntur and Guntur → Hyderabad
   - Hyderabad → Vijayawada and Vijayawada → Hyderabad
   - Vijayawada → Tirupati and Tirupati → Vijayawada
   - Chennai → Tirupati and Tirupati → Chennai
   - Hyderabad → Eluru and Eluru → Hyderabad
   - Bangalore → Salem and Salem → Bangalore
   - Bangalore → Erode and Erode → Bangalore
2. FOR EACH direction-route–Operator combination, THE Scraper SHALL collect: overall route rating (if available), total review count, and up to 100 most recent reviews (text, star rating, date).
3. WHEN an Operator does not operate on a given Route direction, THE Scraper SHALL record a null value and log the absence.
4. WHEN Redbus returns a rate-limit, anti-bot, or error response, THE Scraper SHALL apply exponential back-off with a maximum of five retries.
5. IF the Scraper fails after five retries for a Route direction–Operator combination, THEN THE Aggregator SHALL retain the most recently successful dataset and flag the metric as stale.
6. THE Scraper SHALL complete a full Redbus collection cycle for all Operators across all Route directions within 120 minutes of the scheduled trigger.

---

### Requirement 5: Redbus Route Metrics Aggregation

**User Story:** As a FreshBus analyst, I want computed route-level metrics including per-route sentiment scores and competitive ranking, so that I can prioritise operational improvements on specific corridors.

#### Acceptance Criteria

1. THE Aggregator SHALL compute a Sentiment Score for each Operator–Route direction combination using the same NLP model applied in Requirements 2 and 3.
2. THE Aggregator SHALL compute a competitive rank (1 = best) for each Route direction by ordering Operators by their Sentiment Score in descending order.
3. THE Aggregator SHALL compute FreshBus's average Sentiment Score across all Route directions and compare it to the cross-operator mean for the same set.
4. THE Aggregator SHALL preserve each cycle's route-level metrics with a UTC timestamp for a minimum of 24 months of historical data.
5. WHEN a new Data Refresh Cycle completes, THE Aggregator SHALL update all route-level metrics within 20 minutes of raw data ingestion completing; IF the update exceeds this deadline, THE Aggregator SHALL allow the update to continue until completion without failing or retrying.

---

### Requirement 6: Scheduled and Live Data Refresh

**User Story:** As a FreshBus analyst, I want data to refresh automatically on a monthly schedule — and near-real-time where sources allow — so that the dashboard always reflects the latest competitive picture without manual intervention.

#### Acceptance Criteria

1. THE System SHALL trigger a full Data Refresh Cycle for all three sources on the first calendar day of each month at 02:00 UTC.
2. WHERE a data source provides a public API with a refresh cadence shorter than one month, THE Scraper SHALL poll that source at its maximum permitted frequency and update the Dashboard incrementally.
3. WHEN a Data Refresh Cycle completes without errors, THE System SHALL display the timestamp of the last successful refresh prominently on the Dashboard.
4. WHEN a Data Refresh Cycle completes with one or more stale flags, or when the overall Data Refresh Cycle status is STALE, THE System SHALL display a warning indicator listing the affected Operator–source combinations.
5. THE System SHALL support manual triggering of a full or partial Data Refresh Cycle by an authorised administrator without requiring a code deployment.

---

### Requirement 7: Dashboard Visualisation — Overview and KPI Layer

**User Story:** As a FreshBus executive, I want a high-level overview page with KPI cards and summary charts, so that I can immediately see how FreshBus ranks against competitors at a glance.

#### Acceptance Criteria

1. THE Dashboard SHALL display one KPI Card per Operator showing: composite score (weighted average across all sources), Google Play rating, iOS App Store rating, Google Reviews rating, and average Redbus Sentiment Score.
2. THE Dashboard SHALL display a grouped bar chart comparing all six Operators across each of the four headline metrics (Google Play rating, iOS rating, Google Reviews rating, Redbus Sentiment Score).
3. THE Dashboard SHALL display a radar/spider chart overlaying all six Operators across the four headline metrics for at-a-glance multi-dimensional comparison.
4. THE Dashboard SHALL display a ranked leaderboard table sorting Operators by composite score in descending order with period-over-period delta indicators.
5. WHEN the user hovers over a chart element, THE Dashboard SHALL display a tooltip containing the exact metric value, the Operator name, and the data source timestamp; IF the underlying data is missing or invalid, THE Dashboard SHALL display the tooltip with an error message or placeholder text instead of suppressing it.
6. THE Dashboard SHALL render the overview page with all charts fully loaded within 3 seconds on a standard broadband connection (≥ 10 Mbps).

---

### Requirement 8: Dashboard Visualisation — App Store Deep-Dive

**User Story:** As a FreshBus product manager, I want detailed app store charts and sentiment breakdowns, so that I can understand user feedback trends for our app relative to competitors.

#### Acceptance Criteria

1. THE Dashboard SHALL display a side-by-side grouped bar chart of Google Play and iOS App Store ratings for all six Operators.
2. THE Dashboard SHALL display a stacked bar chart showing the distribution of review star ratings (1★ through 5★) for each Operator on each App Store Source.
3. THE Dashboard SHALL display a sentiment trend line chart showing monthly Sentiment Score over time for each Operator on each App Store Source, spanning all available historical data.
4. THE Dashboard SHALL display a heatmap with Operators on one axis and months on the other, where each cell colour encodes the App Store Sentiment Score for that Operator–month combination.
5. THE Dashboard SHALL surface the top 5 positive and top 5 negative review excerpts per Operator per App Store Source, ranked by absolute Sentiment Score.
6. WHEN the user selects a specific Operator, THE Dashboard SHALL highlight that Operator's data across all App Store visualisations while dimming the others; WHEN no Operator is selected, THE Dashboard SHALL display all Operators at normal brightness.

---

### Requirement 9: Dashboard Visualisation — Google Reviews Deep-Dive

**User Story:** As a FreshBus marketing manager, I want a dedicated Google Reviews panel, so that I can track brand reputation trends on the most visible consumer-facing platform.

#### Acceptance Criteria

1. THE Dashboard SHALL display a horizontal bar chart ranking all six Operators by their current Google Reviews star rating.
2. THE Dashboard SHALL display a sentiment trend line chart showing monthly Google Reviews Sentiment Score over time for each Operator.
3. THE Dashboard SHALL display a heatmap with Operators on one axis and months on the other, where each cell encodes the Google Reviews Sentiment Score.
4. THE Dashboard SHALL surface the top 5 positive and top 5 negative Google Review excerpts per Operator, ranked by absolute Sentiment Score.
5. WHEN the user filters by date range using the global date-range picker, THE Dashboard SHALL update all Google Reviews charts to reflect only reviews within the selected range; IF the filter cannot be applied (e.g., due to network issues, no data in range, or processing errors), THE Dashboard SHALL continue displaying the previously loaded data.

---

### Requirement 10: Dashboard Visualisation — Redbus Route Heatmap and Route Deep-Dive

**User Story:** As a FreshBus operations manager, I want a route-level heatmap and drill-down views, so that I can identify the specific corridors and directions where FreshBus underperforms and take corrective action.

#### Acceptance Criteria

1. THE Dashboard SHALL display a primary heatmap with Operators on one axis and Route directions on the other (22 rows × 6 columns), where each cell colour encodes the Sentiment Score for that combination; cells with null data SHALL be visually distinct (e.g., grey cross-hatched).
2. THE Dashboard SHALL display a secondary heatmap where cell colour encodes review count rather than Sentiment Score, enabling volume-context interpretation alongside the sentiment heatmap.
3. WHEN the user clicks a heatmap cell, THE Dashboard SHALL open a drill-down panel showing: the top 10 reviews for that Operator–Route direction, the Sentiment Score breakdown (positive %, neutral %, negative %), and the competitive rank for that Route direction.
4. THE Dashboard SHALL display a grouped bar chart comparing Sentiment Scores across all six Operators for each Route direction, allowing the user to scroll or paginate through all 22 directions.
5. THE Dashboard SHALL display FreshBus's competitive rank (numerical position 1–6) for each Route direction in a sortable table, with colour coding (green = rank 1–2, amber = rank 3–4, red = rank 5–6).
6. WHEN the user selects a specific Route direction from a dropdown, THE Dashboard SHALL filter all route-level charts to display data for the selected direction only; WHEN the user clears their selection, THE Dashboard SHALL maintain the filtered state and require an explicit user action (e.g., selecting "All Directions") to revert to showing all directions.

---

### Requirement 11: Sentiment Analysis Engine

**User Story:** As a FreshBus data engineer, I want a consistent, reusable sentiment analysis engine processing reviews from all three sources, so that sentiment scores are comparable across sources and over time.

#### Acceptance Criteria

1. THE Aggregator SHALL use a single multilingual pre-trained transformer model (supporting at minimum English, Hindi, and Telugu) to compute Sentiment Scores for all review text regardless of source.
2. THE Aggregator SHALL produce a Sentiment Score in the range [−1, 1] for each individual review, where values ≥ 0.2 are classified as positive, values ≤ −0.2 are classified as negative, and values between −0.2 and 0.2 are classified as neutral.
3. THE Aggregator SHALL aggregate individual review Sentiment Scores into a source-level score for each Operator using the arithmetic mean of individual review scores.
4. WHEN a review contains non-Latin script (e.g., Devanagari, Telugu), THE Aggregator SHALL process it without transliteration, using the multilingual model's native tokenisation.
5. THE Aggregator SHALL recompute Sentiment Scores for all reviews whenever the NLP model version changes (including reverts to previous versions), and store both the new scores and the model version identifier.
6. IF the NLP model fails to return a score for a review (e.g., empty text, unsupported encoding), THEN THE Aggregator SHALL assign a null score and exclude the review from aggregate calculations.

---

### Requirement 12: Data Storage and Historical Preservation

**User Story:** As a FreshBus analyst, I want all scraped and computed data stored persistently with timestamps, so that I can analyse trends and replay analyses on historical snapshots.

#### Acceptance Criteria

1. THE System SHALL store all raw scraped reviews, ratings, and metadata in a structured database with a minimum retention period of 24 months.
2. THE System SHALL store all computed metrics (Sentiment Scores, rankings, deltas) alongside the UTC timestamp of the Data Refresh Cycle that produced them.
3. THE System SHALL maintain referential integrity between raw review records and their computed Sentiment Scores.
4. WHEN a new Data Refresh Cycle completes, THE System SHALL append new records rather than overwrite existing records, preserving the full historical record.
5. THE System SHALL support data export in CSV and JSON formats for any Operator, source, and date range combination, accessible via the Dashboard's admin interface.

---

### Requirement 13: Deployment and Shareable Link

**User Story:** As a FreshBus stakeholder, I want the dashboard deployed as a publicly accessible web application with a shareable link, so that I can share competitive insights with colleagues without requiring them to set up anything locally.

#### Acceptance Criteria

1. THE System SHALL be deployable as a containerised web application using a single command (e.g., `docker compose up`).
2. THE Dashboard SHALL be accessible via a stable, publicly reachable HTTPS URL (the Shareable Link) that does not require user authentication to view.
3. WHEN the Dashboard is accessed via the Shareable Link, THE Dashboard SHALL load and display the most recently computed metrics without requiring any local data setup by the viewer.
4. THE System SHALL support deployment to at least one major cloud platform (AWS, GCP, or Azure) using infrastructure-as-code configuration files included in the repository.
5. THE System SHALL expose a `/health` HTTP endpoint that returns HTTP 200 when all subsystems (Scraper, Aggregator, Dashboard) are operational, and HTTP 503 with a descriptive payload when any subsystem is degraded.

---

### Requirement 14: Scraping Robustness and Anti-Detection

**User Story:** As a FreshBus data engineer, I want the scraping subsystem to be resilient against anti-bot measures, so that data collection succeeds reliably across all three sources month after month.

#### Acceptance Criteria

1. THE Scraper SHALL rotate user-agent strings from a pool of at least 20 real browser user-agent signatures on each request.
2. THE Scraper SHALL introduce randomised delays between requests in the range of 2–8 seconds per domain to avoid triggering rate-limiting heuristics.
3. WHERE a headless browser is required, THE Scraper SHALL use a Playwright-based browser automation stack; Playwright MAY also be used for pages that do not require JavaScript rendering.
4. THE Scraper SHALL support HTTP proxy rotation through a configurable proxy pool, allowing operators to plug in residential or datacenter proxies.
5. WHEN a CAPTCHA challenge is detected during scraping, THE Scraper SHALL log the event, pause the collection for that source, and alert the administrator rather than attempting automated CAPTCHA solving.
6. THE Scraper SHALL implement structured logging of all HTTP requests, responses, and retry attempts in a machine-readable format (JSON) for post-hoc debugging.
