# Design Document

## Overview

The FreshBus Competitor Benchmarking Dashboard is a full-stack web application with three subsystems: a **Scraper** (data collection), an **Aggregator** (metrics computation), and a **Dashboard** (visualisation). The system is containerised, deployable via `docker compose up`, and accessible via a public HTTPS URL.

The architecture follows an **event-driven pipeline**: scheduled triggers invoke the Scraper, which writes raw data to a PostgreSQL database; the Aggregator reads raw data and writes computed metrics; the Dashboard reads computed metrics through a REST API.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Compose Stack                      │
│                                                                  │
│  ┌──────────────┐    ┌─────────────────┐    ┌────────────────┐  │
│  │   Scraper    │───▶│   PostgreSQL DB  │◀───│   Aggregator   │  │
│  │  (Python)    │    │   (raw + metrics)│    │   (Python)     │  │
│  └──────┬───────┘    └────────┬────────┘    └───────┬────────┘  │
│         │                    │                      │            │
│  ┌──────▼───────┐            │             ┌────────▼────────┐  │
│  │  Playwright  │            │             │   NLP Engine    │  │
│  │  (headless)  │            │             │  (transformers) │  │
│  └──────────────┘            │             └─────────────────┘  │
│                              │                                   │
│                    ┌─────────▼────────┐                         │
│                    │   FastAPI (REST)  │                         │
│                    │   + Scheduler    │                         │
│                    └─────────┬────────┘                         │
│                              │                                   │
│                    ┌─────────▼────────┐                         │
│                    │  React Dashboard  │                         │
│                    │  (Vite + Recharts)│                         │
│                    └──────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Scraper | Python 3.11, Playwright, `google-play-scraper`, `app-store-scraper` | Playwright handles JS-heavy pages; library scrapers handle app stores |
| Aggregator / API | Python 3.11, FastAPI, APScheduler | Async-friendly, easy scheduling, typed API |
| NLP Engine | `cardiffnlp/twitter-xlm-roberta-base-sentiment` (HuggingFace) | Multilingual (EN/HI/TE), produces [-1,1] scores, pre-trained |
| Database | PostgreSQL 15 | ACID, referential integrity, JSONB for raw review storage |
| Frontend | React 18, Vite, Recharts, Tailwind CSS | Fast build, rich chart library, utility-first styling |
| Container | Docker + Docker Compose | Single-command deployment |
| Cloud IaC | Terraform (AWS ECS + RDS + CloudFront) | AWS as target platform |

---

## Data Models

### Raw Data Tables

```sql
-- Operators reference table
CREATE TABLE operators (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,  -- e.g. 'FreshBus'
    slug        TEXT NOT NULL UNIQUE   -- e.g. 'freshbus'
);

-- App store raw collection
CREATE TABLE app_store_snapshots (
    id              SERIAL PRIMARY KEY,
    operator_id     INT REFERENCES operators(id),
    source          TEXT NOT NULL,  -- 'google_play' | 'ios_app_store'
    collected_at    TIMESTAMPTZ NOT NULL,
    overall_rating  NUMERIC(3,2),
    review_count    INT,
    app_version     TEXT,
    is_stale        BOOLEAN DEFAULT FALSE
);

-- Individual app store reviews
CREATE TABLE app_store_reviews (
    id              SERIAL PRIMARY KEY,
    snapshot_id     INT REFERENCES app_store_snapshots(id),
    operator_id     INT REFERENCES operators(id),
    source          TEXT NOT NULL,
    review_text     TEXT,
    star_rating     INT,
    reviewed_at     TIMESTAMPTZ,
    collected_at    TIMESTAMPTZ NOT NULL
);

-- Google reviews raw collection
CREATE TABLE google_review_snapshots (
    id              SERIAL PRIMARY KEY,
    operator_id     INT REFERENCES operators(id),
    collected_at    TIMESTAMPTZ NOT NULL,
    overall_rating  NUMERIC(3,2),
    review_count    INT,
    is_stale        BOOLEAN DEFAULT FALSE
);

CREATE TABLE google_reviews (
    id              SERIAL PRIMARY KEY,
    snapshot_id     INT REFERENCES google_review_snapshots(id),
    operator_id     INT REFERENCES operators(id),
    review_text     TEXT,
    star_rating     INT,
    reviewed_at     TIMESTAMPTZ,
    collected_at    TIMESTAMPTZ NOT NULL
);

-- Routes reference table
CREATE TABLE routes (
    id          SERIAL PRIMARY KEY,
    origin      TEXT NOT NULL,
    destination TEXT NOT NULL,
    UNIQUE(origin, destination)
);

-- Redbus raw collection
CREATE TABLE redbus_snapshots (
    id              SERIAL PRIMARY KEY,
    operator_id     INT REFERENCES operators(id),
    route_id        INT REFERENCES routes(id),
    collected_at    TIMESTAMPTZ NOT NULL,
    overall_rating  NUMERIC(3,2),
    review_count    INT,
    is_stale        BOOLEAN DEFAULT FALSE
);

CREATE TABLE redbus_reviews (
    id              SERIAL PRIMARY KEY,
    snapshot_id     INT REFERENCES redbus_snapshots(id),
    operator_id     INT REFERENCES operators(id),
    route_id        INT REFERENCES routes(id),
    review_text     TEXT,
    star_rating     INT,
    reviewed_at     TIMESTAMPTZ,
    collected_at    TIMESTAMPTZ NOT NULL
);
```

### Computed Metrics Tables

```sql
-- Sentiment scores per individual review
CREATE TABLE sentiment_scores (
    id              SERIAL PRIMARY KEY,
    review_type     TEXT NOT NULL,  -- 'app_store' | 'google' | 'redbus'
    review_id       INT NOT NULL,
    score           NUMERIC(5,4),   -- [-1, 1], NULL if model failed
    classification  TEXT,           -- 'positive' | 'neutral' | 'negative' | NULL
    model_version   TEXT NOT NULL,
    computed_at     TIMESTAMPTZ NOT NULL
);

-- Aggregated metrics per operator per source per cycle
CREATE TABLE operator_metrics (
    id                      SERIAL PRIMARY KEY,
    operator_id             INT REFERENCES operators(id),
    source                  TEXT NOT NULL,  -- 'google_play' | 'ios_app_store' | 'google_reviews' | 'redbus_overall'
    cycle_timestamp         TIMESTAMPTZ NOT NULL,
    overall_rating          NUMERIC(3,2),
    sentiment_score         NUMERIC(5,4),
    positive_review_ratio   NUMERIC(5,4),
    rating_delta_mom        NUMERIC(5,4),   -- month-over-month
    model_version           TEXT,
    is_stale                BOOLEAN DEFAULT FALSE
);

-- Route-level aggregated metrics
CREATE TABLE route_metrics (
    id              SERIAL PRIMARY KEY,
    operator_id     INT REFERENCES operators(id),
    route_id        INT REFERENCES routes(id),
    cycle_timestamp TIMESTAMPTZ NOT NULL,
    sentiment_score NUMERIC(5,4),
    review_count    INT,
    competitive_rank INT,
    model_version   TEXT,
    is_stale        BOOLEAN DEFAULT FALSE
);

-- Refresh cycle audit log
CREATE TABLE refresh_cycles (
    id              SERIAL PRIMARY KEY,
    triggered_at    TIMESTAMPTZ NOT NULL,
    completed_at    TIMESTAMPTZ,
    trigger_type    TEXT NOT NULL,  -- 'scheduled' | 'manual'
    status          TEXT NOT NULL,  -- 'running' | 'completed' | 'stale' | 'failed'
    stale_sources   JSONB DEFAULT '[]'
);
```

---

## Component Design

### 1. Scraper

**Location:** `scraper/`

The Scraper is a Python module with one collector per source. All collectors share:
- A `UserAgentRotator` (pool ≥ 20 signatures)
- A `ProxyPool` (configurable via env var `PROXY_LIST`)
- An `ExponentialBackoff` retry decorator (max 5 retries, 2–8 s base delay)
- Structured JSON logging via `structlog`

#### App Store Collector (`scraper/collectors/app_store.py`)
- Uses `google-play-scraper` Python library for Play Store
- Uses `app-store-scraper` Python library for iOS
- Fetches 200 most recent reviews per operator per store
- Handles missing apps (null + log)

#### Google Reviews Collector (`scraper/collectors/google_reviews.py`)
- Uses Playwright to load Google Search results page
- Extracts Knowledge Panel / Maps listing via CSS selectors
- Collects 50 most recent reviews
- Handles absent panel (null + log, continue to next operator)

#### Redbus Collector (`scraper/collectors/redbus.py`)
- Uses Playwright to navigate Redbus route search
- Iterates all 22 route directions × 6 operators = 132 combinations
- Collects up to 100 reviews per combination
- Handles missing operators on routes (null + log)
- CAPTCHA detection: logs event, pauses source, alerts admin via DB flag

#### Timing SLAs
| Source | SLA |
|---|---|
| App Store | 60 min |
| Google Reviews | 30 min |
| Redbus | 120 min |

---

### 2. Aggregator

**Location:** `aggregator/`

The Aggregator runs after each scrape cycle and processes raw data in order:

1. **Sentiment Engine** (`aggregator/sentiment.py`)
   - Loads `cardiffnlp/twitter-xlm-roberta-base-sentiment` once at startup
   - Processes reviews in batches of 32 (GPU if available, else CPU)
   - Outputs score in [-1, 1] via softmax → weighted sum
   - Null for empty/unprocessable text
   - Detects model version change → recomputes all historical scores

2. **Metrics Calculator** (`aggregator/metrics.py`)
   - Per operator per source: mean sentiment, positive ratio, MoM rating delta
   - Per route direction: sentiment score, competitive rank (1–6), FreshBus vs mean
   - Writes to `operator_metrics` and `route_metrics` tables

3. **SLA enforcement**
   - App Store metrics: within 15 min of ingestion
   - Route metrics: within 20 min (soft — continues without failure)

---

### 3. FastAPI Backend

**Location:** `api/`

All routes are prefixed `/api/v1/`.

#### Endpoints

```
GET  /api/v1/operators                     → list all operators
GET  /api/v1/metrics/overview              → KPI cards + composite scores
GET  /api/v1/metrics/app-store             → app store deep-dive data
GET  /api/v1/metrics/google-reviews        → Google reviews deep-dive
GET  /api/v1/metrics/redbus                → Redbus heatmap data (all routes)
GET  /api/v1/metrics/redbus/{route_id}     → single route drill-down
GET  /api/v1/reviews/top                   → top 5 pos/neg reviews per operator per source
GET  /api/v1/history/{source}              → time-series data for trend charts
GET  /api/v1/refresh/status                → last refresh timestamp + stale flags
POST /api/v1/refresh/trigger               → manual refresh trigger (admin)
GET  /api/v1/export                        → CSV/JSON export (admin)
GET  /health                               → subsystem health check
```

#### Scheduler
- APScheduler CronTrigger: `0 2 1 * *` UTC (first day of month, 02:00)
- Invokes Scraper → Aggregator pipeline in background task
- Manual trigger via `POST /api/v1/refresh/trigger` (no auth required for MVP; can be gated by env var `ADMIN_TOKEN`)

---

### 4. React Dashboard

**Location:** `dashboard/`

Built with Vite + React 18 + Recharts + Tailwind CSS.

#### Pages / Sections

| Section | Route | Key Components |
|---|---|---|
| Overview | `/` | KPI Cards (×6), Grouped Bar Chart, Radar Chart, Leaderboard Table |
| App Store | `/app-store` | Side-by-side Bar, Stacked Rating Bar, Sentiment Trend Line, Heatmap, Review Excerpts |
| Google Reviews | `/google-reviews` | Horizontal Bar, Trend Line, Heatmap, Review Excerpts, Date Range Filter |
| Redbus Routes | `/redbus` | Primary Heatmap (sentiment), Secondary Heatmap (volume), Grouped Bar, Rank Table, Drill-Down Panel |

#### State Management
- React Query for all server state (API calls, caching)
- Zustand for UI state (selected operator, selected route, date range filter)

#### Chart Library
- Recharts for all charts (bar, line, radar, heatmap via `ComposedChart` + custom cells)
- Custom heatmap cell renderer for null values (grey cross-hatch pattern via SVG)

#### Performance
- Code-split by page (React.lazy + Suspense)
- Overview page target: fully loaded within 3 s on ≥ 10 Mbps

---

### 5. Data Flow

```
Scheduler trigger
      │
      ▼
Scraper.run_all()
  ├── AppStoreCollector.collect() ──────────┐
  ├── GoogleReviewsCollector.collect() ──── │──▶ PostgreSQL (raw tables)
  └── RedbusCollector.collect() ───────────┘
      │
      ▼
Aggregator.run()
  ├── SentimentEngine.score_all_pending()
  ├── MetricsCalculator.compute_app_store()
  ├── MetricsCalculator.compute_google()
  └── MetricsCalculator.compute_redbus()
      │
      ▼
refresh_cycles record updated (status, completed_at, stale_sources)
      │
      ▼
FastAPI serves pre-computed metrics to Dashboard
```

---

### 6. Deployment

#### Docker Compose Services

```yaml
services:
  db:         # PostgreSQL 15
  scraper:    # Python scraper + Playwright
  api:        # FastAPI + Aggregator + Scheduler
  dashboard:  # Nginx serving Vite build
```

#### AWS Terraform (IaC)
- ECS Fargate tasks for `api` and `scraper`
- RDS PostgreSQL for database
- S3 + CloudFront for static Dashboard build
- Secrets Manager for DB credentials and proxy config

#### Health Endpoint

`GET /health` returns:
```json
{
  "status": "ok" | "degraded",
  "subsystems": {
    "database": "ok" | "error",
    "scraper": "ok" | "error",
    "aggregator": "ok" | "error"
  }
}
```
HTTP 200 when all `ok`, HTTP 503 otherwise.

---

### 7. Anti-Detection and Robustness

- **User-agent rotation**: `scraper/utils/user_agents.py` — list of 20+ real browser UA strings, sampled randomly per request
- **Request delays**: random sleep 2–8 s between requests to the same domain
- **Proxy rotation**: reads `PROXY_LIST` env var (comma-separated), round-robin assignment
- **CAPTCHA handling**: Playwright intercepts CAPTCHA challenge pages by URL/title pattern → logs to DB `captcha_alerts` table → sets source pause flag → no auto-solving
- **Structured logging**: `structlog` JSON logs for all HTTP requests, responses, and retries; written to stdout (captured by Docker)

---

### 8. Sentiment Score Computation Detail

Model: `cardiffnlp/twitter-xlm-roberta-base-sentiment`

Output labels: `Negative`, `Neutral`, `Positive` with softmax probabilities.

Score mapping to [-1, 1]:
```
score = P(Positive) - P(Negative)
```

Classification thresholds:
- `score >= 0.2` → positive
- `score <= -0.2` → negative
- `-0.2 < score < 0.2` → neutral

Null score conditions: empty string, encoding error, model exception.

---

### 9. Historical Data Retention

- Raw reviews and snapshots: retained indefinitely (no DELETE)
- Computed metrics: retained indefinitely
- Minimum guaranteed query range: 24 months
- `VACUUM ANALYZE` scheduled weekly to manage table bloat

---

### 10. Export

`GET /api/v1/export?operator=freshbus&source=google_play&from=2024-01-01&to=2024-12-31&format=csv`

Streams CSV or JSON from PostgreSQL query. Accessible via Dashboard admin panel tab.
