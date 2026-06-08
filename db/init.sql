-- =============================================================================
-- FreshBus Competitor Benchmarking Dashboard — Database Initialisation
-- Raw data tables (dependency order)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. operators
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operators (
    id      SERIAL PRIMARY KEY,
    name    TEXT NOT NULL UNIQUE,   -- e.g. 'FreshBus'
    slug    TEXT NOT NULL UNIQUE    -- e.g. 'freshbus'
);

-- ---------------------------------------------------------------------------
-- 2. routes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routes (
    id          SERIAL PRIMARY KEY,
    origin      TEXT NOT NULL,
    destination TEXT NOT NULL,
    UNIQUE (origin, destination)
);

-- ---------------------------------------------------------------------------
-- 3. app_store_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_store_snapshots (
    id              SERIAL PRIMARY KEY,
    operator_id     INT NOT NULL REFERENCES operators(id),
    source          TEXT NOT NULL CHECK (source IN ('google_play', 'ios_app_store')),
    collected_at    TIMESTAMPTZ NOT NULL,
    overall_rating  NUMERIC(3, 2),
    review_count    INT,
    app_version     TEXT,
    is_stale        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_app_store_snapshots_operator_source
    ON app_store_snapshots (operator_id, source);

-- ---------------------------------------------------------------------------
-- 4. app_store_reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_store_reviews (
    id              SERIAL PRIMARY KEY,
    snapshot_id     INT NOT NULL REFERENCES app_store_snapshots(id),
    operator_id     INT NOT NULL REFERENCES operators(id),
    source          TEXT NOT NULL,
    review_text     TEXT,
    star_rating     INT,
    reviewed_at     TIMESTAMPTZ,
    collected_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_store_reviews_operator_id
    ON app_store_reviews (operator_id);

-- ---------------------------------------------------------------------------
-- 5. google_review_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS google_review_snapshots (
    id              SERIAL PRIMARY KEY,
    operator_id     INT NOT NULL REFERENCES operators(id),
    collected_at    TIMESTAMPTZ NOT NULL,
    overall_rating  NUMERIC(3, 2),
    review_count    INT,
    is_stale        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_google_review_snapshots_operator_source
    ON google_review_snapshots (operator_id);

-- ---------------------------------------------------------------------------
-- 6. google_reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS google_reviews (
    id              SERIAL PRIMARY KEY,
    snapshot_id     INT NOT NULL REFERENCES google_review_snapshots(id),
    operator_id     INT NOT NULL REFERENCES operators(id),
    review_text     TEXT,
    star_rating     INT,
    reviewed_at     TIMESTAMPTZ,
    collected_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_google_reviews_operator_id
    ON google_reviews (operator_id);

-- ---------------------------------------------------------------------------
-- 7. redbus_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS redbus_snapshots (
    id              SERIAL PRIMARY KEY,
    operator_id     INT NOT NULL REFERENCES operators(id),
    route_id        INT NOT NULL REFERENCES routes(id),
    collected_at    TIMESTAMPTZ NOT NULL,
    overall_rating  NUMERIC(3, 2),
    review_count    INT,
    is_stale        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_redbus_snapshots_operator_source
    ON redbus_snapshots (operator_id);

-- ---------------------------------------------------------------------------
-- 8. redbus_reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS redbus_reviews (
    id              SERIAL PRIMARY KEY,
    snapshot_id     INT NOT NULL REFERENCES redbus_snapshots(id),
    operator_id     INT NOT NULL REFERENCES operators(id),
    route_id        INT NOT NULL REFERENCES routes(id),
    review_text     TEXT,
    star_rating     INT,
    reviewed_at     TIMESTAMPTZ,
    collected_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_redbus_reviews_operator_id
    ON redbus_reviews (operator_id);

-- ---------------------------------------------------------------------------
-- 9. refresh_cycles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_cycles (
    id              SERIAL PRIMARY KEY,
    triggered_at    TIMESTAMPTZ NOT NULL,
    completed_at    TIMESTAMPTZ,
    trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'manual')),
    status          TEXT NOT NULL CHECK (status IN ('running', 'completed', 'stale', 'failed')),
    stale_sources   JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_refresh_cycles_status
    ON refresh_cycles (status);

-- ---------------------------------------------------------------------------
-- 10. captcha_alerts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS captcha_alerts (
    id              SERIAL PRIMARY KEY,
    source          TEXT NOT NULL,
    operator_id     INT,           -- nullable: alert may not be operator-specific
    detected_at     TIMESTAMPTZ NOT NULL,
    resolved_at     TIMESTAMPTZ,
    is_paused       BOOLEAN NOT NULL DEFAULT TRUE
);

-- =============================================================================
-- Computed metrics tables
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 11. sentiment_scores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sentiment_scores (
    id              SERIAL PRIMARY KEY,
    review_type     TEXT NOT NULL CHECK (review_type IN ('app_store', 'google', 'redbus')),
    review_id       INT NOT NULL,
    score           NUMERIC(5, 4),       -- [-1, 1], NULL if model failed
    classification  TEXT CHECK (classification IN ('positive', 'neutral', 'negative')),
    model_version   TEXT NOT NULL,
    computed_at     TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sentiment_scores_review_type_id
    ON sentiment_scores (review_type, review_id);

CREATE INDEX IF NOT EXISTS idx_sentiment_scores_model_version
    ON sentiment_scores (model_version);

-- ---------------------------------------------------------------------------
-- 12. operator_metrics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operator_metrics (
    id                      SERIAL PRIMARY KEY,
    operator_id             INT NOT NULL REFERENCES operators(id),
    source                  TEXT NOT NULL CHECK (source IN ('google_play', 'ios_app_store', 'google_reviews', 'redbus_overall')),
    cycle_timestamp         TIMESTAMPTZ NOT NULL,
    overall_rating          NUMERIC(3, 2),
    sentiment_score         NUMERIC(5, 4),
    positive_review_ratio   NUMERIC(5, 4),
    rating_delta_mom        NUMERIC(5, 4),   -- month-over-month delta
    model_version           TEXT,
    is_stale                BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_operator_metrics_operator_source_cycle
    ON operator_metrics (operator_id, source, cycle_timestamp);

-- ---------------------------------------------------------------------------
-- 13. route_metrics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS route_metrics (
    id               SERIAL PRIMARY KEY,
    operator_id      INT NOT NULL REFERENCES operators(id),
    route_id         INT NOT NULL REFERENCES routes(id),
    cycle_timestamp  TIMESTAMPTZ NOT NULL,
    sentiment_score  NUMERIC(5, 4),
    review_count     INT,
    competitive_rank INT,
    model_version    TEXT,
    is_stale         BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_route_metrics_operator_route_cycle
    ON route_metrics (operator_id, route_id, cycle_timestamp);

CREATE INDEX IF NOT EXISTS idx_route_metrics_route_cycle
    ON route_metrics (route_id, cycle_timestamp);

-- =============================================================================
-- Seed data
-- =============================================================================

-- ---------------------------------------------------------------------------
-- operators (6 operators)
-- ---------------------------------------------------------------------------
INSERT INTO operators (name, slug) VALUES
    ('FreshBus',           'freshbus'),
    ('Neugo',              'neugo'),
    ('FlixBus',            'flixbus'),
    ('Zingbus',            'zingbus'),
    ('Leafy',              'leafy'),
    ('IntrCity SmartBus',  'intrcity')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- routes (22 direction-route combinations — both directions per city-pair)
-- ---------------------------------------------------------------------------
INSERT INTO routes (origin, destination) VALUES
    ('Bangalore',      'Chennai'),
    ('Chennai',        'Bangalore'),
    ('Bangalore',      'Pondicherry'),
    ('Pondicherry',    'Bangalore'),
    ('Bangalore',      'Tirupati'),
    ('Tirupati',       'Bangalore'),
    ('Visakhapatnam',  'Vijayawada'),
    ('Vijayawada',     'Visakhapatnam'),
    ('Hyderabad',      'Guntur'),
    ('Guntur',         'Hyderabad'),
    ('Hyderabad',      'Vijayawada'),
    ('Vijayawada',     'Hyderabad'),
    ('Vijayawada',     'Tirupati'),
    ('Tirupati',       'Vijayawada'),
    ('Chennai',        'Tirupati'),
    ('Tirupati',       'Chennai'),
    ('Hyderabad',      'Eluru'),
    ('Eluru',          'Hyderabad'),
    ('Bangalore',      'Salem'),
    ('Salem',          'Bangalore'),
    ('Bangalore',      'Erode'),
    ('Erode',          'Bangalore')
ON CONFLICT DO NOTHING;
