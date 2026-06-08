# Implementation Tasks

## Task Overview

- **Spec**: freshbus-competitor-dashboard
- **Total Tasks**: 14 parent tasks, ~60 sub-tasks

---

## Tasks

- [x] 1. Project Scaffold and Database Schema
  - [x] 1.1 Initialise monorepo directory structure (`scraper/`, `aggregator/`, `api/`, `dashboard/`, `infra/`, `docker/`)
  - [x] 1.2 Create `docker-compose.yml` with services: `db` (PostgreSQL 15), `api`, `scraper`, `dashboard`
  - [x] 1.3 Write PostgreSQL initialisation SQL (`db/init.sql`) — all raw tables: `operators`, `app_store_snapshots`, `app_store_reviews`, `google_review_snapshots`, `google_reviews`, `routes`, `redbus_snapshots`, `redbus_reviews`, `refresh_cycles`, `captcha_alerts`
  - [x] 1.4 Write PostgreSQL metrics SQL — computed tables: `sentiment_scores`, `operator_metrics`, `route_metrics`
  - [x] 1.5 Seed `operators` table (FreshBus, Neugo, FlixBus, Zingbus, Leafy, IntrCity SmartBus) and `routes` table (all 22 direction-route combinations)
  - [x] 1.6 Create Python project root: `pyproject.toml` with shared dependencies (psycopg2-binary, SQLAlchemy, structlog, python-dotenv, pytest)
  - [x] 1.7 Create `.env.example` with all required environment variables (DATABASE_URL, PROXY_LIST, ADMIN_TOKEN, NLP_MODEL_NAME)

- [x] 2. Scraper — Core Infrastructure
  - [x] 2.1 Implement `scraper/utils/user_agents.py` — pool of ≥ 20 real browser UA strings with random sampler
  - [x] 2.2 Implement `scraper/utils/proxy_pool.py` — round-robin proxy assignment from `PROXY_LIST` env var
  - [x] 2.3 Implement `scraper/utils/retry.py` — exponential back-off decorator (max 5 retries, 2–8 s base delay, jitter)
  - [x] 2.4 Implement `scraper/utils/logger.py` — structlog JSON logger for HTTP requests, responses, and retries
  - [x] 2.5 Implement `scraper/db.py` — SQLAlchemy session factory and DAL helpers (upsert snapshots, insert reviews, set stale flags)
  - [x] 2.6 Write unit tests for retry decorator, UA rotator, and proxy pool

- [x] 3. Scraper — App Store Collector
  - [x] 3.1 Implement `scraper/collectors/app_store.py` — `AppStoreCollector` class using `google-play-scraper` and `app-store-scraper` libraries
  - [x] 3.2 Collect overall rating, review count, app version, and 200 most recent reviews (text, star, date) per operator per store
  - [x] 3.3 Handle missing app (null + log) and rate-limit/CAPTCHA (exponential back-off via retry decorator)
  - [x] 3.4 On exhaustion of retries, mark snapshot as stale and continue pipeline
  - [x] 3.5 Enforce 60-minute collection SLA via timeout wrapper; log warning if exceeded
  - [x] 3.6 Write integration tests with mocked library responses covering: success, missing app, rate-limit, and full-retry-exhaustion paths

- [x] 4. Scraper — Google Reviews Collector
  - [x] 4.1 Implement `scraper/collectors/google_reviews.py` — `GoogleReviewsCollector` using Playwright
  - [x] 4.2 Navigate to Google Search for each operator name; extract Knowledge Panel / Maps listing (overall rating, review count, 50 most recent reviews)
  - [x] 4.3 Handle absent Knowledge Panel: record null + log; if null-recording fails, continue to next operator
  - [x] 4.4 Apply user-agent rotation and random 2–8 s delays between requests
  - [x] 4.5 Apply exponential back-off on rate-limit/error; after 5 retries mark stale
  - [x] 4.6 Enforce 30-minute collection SLA; log warning if exceeded
  - [x] 4.7 Write integration tests with mocked Playwright page responses

- [x] 5. Scraper — Redbus Collector
  - [x] 5.1 Implement `scraper/collectors/redbus.py` — `RedbusCollector` using Playwright
  - [x] 5.2 Iterate all 22 route directions × 6 operators; collect route rating, review count, up to 100 reviews (text, star, date)
  - [x] 5.3 Handle missing operator on route: record null + log
  - [x] 5.4 Detect CAPTCHA challenge (by URL pattern / page title); log event to `captcha_alerts` table; set source pause flag in DB; alert admin (log structured alert); do not auto-solve
  - [x] 5.5 Apply exponential back-off on rate-limit/anti-bot; after 5 retries mark stale
  - [x] 5.6 Enforce 120-minute collection SLA; log warning if exceeded
  - [x] 5.7 Write integration tests covering: normal collection, missing operator, CAPTCHA detection, retry exhaustion

- [x] 6. Aggregator — Sentiment Analysis Engine
  - [x] 6.1 Implement `aggregator/sentiment.py` — `SentimentEngine` class loading `cardiffnlp/twitter-xlm-roberta-base-sentiment` at startup
  - [x] 6.2 Implement batch scoring (batch size 32): compute `score = P(Positive) - P(Negative)` → value in [-1, 1]
  - [x] 6.3 Classify each score: ≥ 0.2 → positive, ≤ -0.2 → negative, between → neutral
  - [x] 6.4 Assign null score for empty text, encoding errors, or model exceptions; exclude nulls from aggregates
  - [x] 6.5 Detect model version change (compare stored model_version identifier); if changed, recompute all historical scores and update `sentiment_scores` table with new model_version
  - [x] 6.6 Process non-Latin script (Devanagari, Telugu) natively without transliteration
  - [x] 6.7 Write unit tests: score range, classification thresholds, null handling, batch processing, model version recompute trigger

- [x] 7. Aggregator — Metrics Calculator
  - [x] 7.1 Implement `aggregator/metrics.py` — `MetricsCalculator` class
  - [x] 7.2 Compute per-operator per-source: mean sentiment score, positive review ratio (positive_count / total_count), MoM rating delta
  - [x] 7.3 Compute per-route-direction per-operator: sentiment score, review count
  - [x] 7.4 Compute competitive rank (1 = best) per route direction by sorting operators by sentiment score descending
  - [x] 7.5 Compute FreshBus average sentiment across all route directions vs cross-operator mean
  - [x] 7.6 Write all metrics to `operator_metrics` and `route_metrics` tables with UTC cycle_timestamp (append, not overwrite)
  - [x] 7.7 App Store metrics update within 15 minutes of ingestion; route metrics within 20 minutes (soft SLA — log warning, do not fail)
  - [x] 7.8 Write unit tests for all metric computations, including edge cases (no data, single operator, ties in ranking)

- [x] 8. Aggregator — Refresh Cycle Orchestrator
  - [x] 8.1 Implement `aggregator/orchestrator.py` — `RefreshOrchestrator` that runs Scraper → Aggregator pipeline
  - [x] 8.2 On cycle start: insert `refresh_cycles` record with status `running`
  - [x] 8.3 On cycle complete (no stale): update record status to `completed`, set `completed_at`
  - [x] 8.4 On cycle complete with stale flags: update status to `stale`, populate `stale_sources` JSONB array
  - [x] 8.5 Expose orchestrator to APScheduler CronTrigger (`0 2 1 * *` UTC) in the API service
  - [x] 8.6 Write tests for cycle status transitions and stale flag propagation

- [x] 9. FastAPI Backend
  - [x] 9.1 Scaffold `api/` FastAPI app with lifespan startup (DB connection check, scheduler start)
  - [x] 9.2 Implement `GET /api/v1/operators` — return all operator names and slugs
  - [x] 9.3 Implement `GET /api/v1/metrics/overview` — KPI cards (composite score, all source ratings) + leaderboard data for all 6 operators
  - [x] 9.4 Implement `GET /api/v1/metrics/app-store` — ratings, sentiment scores, stacked rating distributions, trend history
  - [x] 9.5 Implement `GET /api/v1/metrics/google-reviews` — ratings, sentiment scores, trend history; support `?from=&to=` date filter
  - [x] 9.6 Implement `GET /api/v1/metrics/redbus` — 22×6 heatmap data (sentiment + review count) for all route directions
  - [x] 9.7 Implement `GET /api/v1/metrics/redbus/{route_id}` — top 10 reviews, sentiment breakdown, competitive rank for one route direction
  - [x] 9.8 Implement `GET /api/v1/reviews/top` — top 5 positive and top 5 negative review excerpts per operator per source (by absolute sentiment score)
  - [x] 9.9 Implement `GET /api/v1/history/{source}` — monthly time-series data for trend line charts
  - [x] 9.10 Implement `GET /api/v1/refresh/status` — last successful refresh timestamp, stale flags, current cycle status
  - [x] 9.11 Implement `POST /api/v1/refresh/trigger` — trigger full or partial refresh; validate optional `ADMIN_TOKEN` header if env var set
  - [x] 9.12 Implement `GET /api/v1/export` — stream CSV or JSON for given operator/source/date-range combination
  - [x] 9.13 Implement `GET /health` — check DB connectivity, scraper last-run timestamp, aggregator last-run timestamp; return 200/503
  - [x] 9.14 Write API integration tests for all endpoints (happy path + error cases)

- [x] 10. Dashboard — Project Setup and Shared Components
  - [x] 10.1 Scaffold Vite + React 18 project in `dashboard/` with Tailwind CSS, Recharts, React Query, Zustand, React Router
  - [x] 10.2 Implement shared `api.ts` client (React Query wrappers for all API endpoints)
  - [x] 10.3 Implement Zustand store: `selectedOperator`, `selectedRoute`, `dateRange`
  - [x] 10.4 Implement `<Layout>` component: top nav with section links, last-refresh timestamp display, stale warning banner
  - [x] 10.5 Implement `<KPICard>` component: metric value, operator name, period-over-period delta indicator
  - [x] 10.6 Implement `<Tooltip>` wrapper component: shows metric value, operator name, data source timestamp; shows error/placeholder text when data is missing
  - [x] 10.7 Implement `<HeatmapCell>` component: colour-encoded cell with grey cross-hatch SVG pattern for null values
  - [x] 10.8 Implement code-splitting: React.lazy + Suspense for each page

- [x] 11. Dashboard — Overview Page
  - [x] 11.1 Implement Overview page (`/`) with 6 `<KPICard>` components (one per operator): composite score, GP rating, iOS rating, Google rating, Redbus sentiment
  - [x] 11.2 Implement grouped bar chart comparing all 6 operators across 4 headline metrics using Recharts `BarChart`
  - [x] 11.3 Implement radar/spider chart overlaying all 6 operators across 4 metrics using Recharts `RadarChart`
  - [x] 11.4 Implement ranked leaderboard table: sorted by composite score descending, with MoM delta indicators (▲/▼ + colour)
  - [x] 11.5 Wire tooltips to all chart elements showing exact value, operator name, and data timestamp
  - [x] 11.6 Verify overview page loads fully within 3 s (Lighthouse / manual check in dev)

- [x] 12. Dashboard — App Store, Google Reviews, and Redbus Pages
  - [x] 12.1 Implement App Store page (`/app-store`): side-by-side grouped bar chart (GP vs iOS ratings), stacked rating distribution bar chart (1★–5★)
  - [x] 12.2 Implement App Store sentiment trend line chart (monthly, all operators, all historical data) and Operator×Month heatmap
  - [x] 12.3 Implement top-5 positive / top-5 negative review excerpt panels per operator per store
  - [x] 12.4 Implement operator selection interaction: clicking an operator highlights its data and dims others; no selection → all at normal brightness
  - [x] 12.5 Implement Google Reviews page (`/google-reviews`): horizontal bar chart (current ratings), sentiment trend line, Operator×Month heatmap
  - [x] 12.6 Implement top-5 positive / top-5 negative Google review excerpts per operator
  - [x] 12.7 Implement global date-range picker wired to Google Reviews charts; on filter failure, keep previous data displayed
  - [x] 12.8 Implement Redbus page (`/redbus`): primary heatmap (22 rows × 6 cols, sentiment), secondary heatmap (review count); null cells rendered with grey cross-hatch
  - [x] 12.9 Implement heatmap cell click → drill-down panel: top 10 reviews, sentiment breakdown (positive %/neutral %/negative %), competitive rank
  - [x] 12.10 Implement grouped bar chart for route directions (scrollable/paginated through all 22 directions)
  - [x] 12.11 Implement FreshBus rank table: sortable, colour-coded (green rank 1–2, amber 3–4, red 5–6)
  - [x] 12.12 Implement route direction dropdown filter; cleared selection maintains filter state until explicit "All Directions" action

- [x] 13. Deployment Configuration
  - [x] 13.1 Write production `docker-compose.yml` with all four services, health checks, and restart policies
  - [x] 13.2 Write `Dockerfile` for the `api` service (Python 3.11 slim, installs dependencies, copies source)
  - [x] 13.3 Write `Dockerfile` for the `scraper` service (Python 3.11 with Playwright browsers installed)
  - [x] 13.4 Write `Dockerfile` for the `dashboard` service (Node build stage → Nginx serve stage)
  - [x] 13.5 Write Terraform configuration in `infra/aws/`: ECS Fargate task definitions for `api` and `scraper`, RDS PostgreSQL instance, S3 + CloudFront for dashboard, Secrets Manager for credentials
  - [x] 13.6 Write `README.md` with: local quickstart (`docker compose up`), environment variables reference, manual refresh instructions, and AWS deployment steps

- [ ] 14. End-to-End Validation and Hardening
  - [x] 14.1 Run full scrape cycle in local Docker environment with test credentials; verify all 132 Redbus combinations and 12 app store entries are attempted
  - [x] 14.2 Verify stale flag propagation: kill one collector mid-run, confirm Dashboard shows warning banner for affected operator-source
  - [x] 14.3 Verify `GET /health` returns 503 when DB is unreachable; returns 200 when all subsystems are healthy
  - [x] 14.4 Verify manual refresh via `POST /api/v1/refresh/trigger` starts a new cycle and updates Dashboard status
  - [x] 14.5 Verify data export: CSV and JSON for at least one operator/source/date-range combination
  - [x] 14.6 Run Lighthouse on Overview page; confirm FCP/LCP within 3-second target on simulated broadband
  - [x] 14.7 Verify sentiment recompute triggers when `NLP_MODEL_NAME` env var is changed and API restarts
