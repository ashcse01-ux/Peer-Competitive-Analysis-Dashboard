-- =============================================================================
-- Migration: daily snapshots with downloads, star histogram, Play topics
-- One entry per operator per source per calendar day (IST intent via date).
-- =============================================================================

ALTER TABLE app_store_snapshots
    ADD COLUMN IF NOT EXISTS collection_date DATE,
    ADD COLUMN IF NOT EXISTS downloads TEXT,
    ADD COLUMN IF NOT EXISTS downloads_raw BIGINT,
    ADD COLUMN IF NOT EXISTS star_1 INT,
    ADD COLUMN IF NOT EXISTS star_2 INT,
    ADD COLUMN IF NOT EXISTS star_3 INT,
    ADD COLUMN IF NOT EXISTS star_4 INT,
    ADD COLUMN IF NOT EXISTS star_5 INT,
    ADD COLUMN IF NOT EXISTS play_topics JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS ratings_count INT;

UPDATE app_store_snapshots
SET collection_date = (collected_at AT TIME ZONE 'Asia/Kolkata')::date
WHERE collection_date IS NULL;

ALTER TABLE app_store_snapshots
    ALTER COLUMN collection_date SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_store_snapshots_daily
    ON app_store_snapshots (operator_id, source, collection_date);

ALTER TABLE google_review_snapshots
    ADD COLUMN IF NOT EXISTS collection_date DATE,
    ADD COLUMN IF NOT EXISTS star_1 INT,
    ADD COLUMN IF NOT EXISTS star_2 INT,
    ADD COLUMN IF NOT EXISTS star_3 INT,
    ADD COLUMN IF NOT EXISTS star_4 INT,
    ADD COLUMN IF NOT EXISTS star_5 INT;

UPDATE google_review_snapshots
SET collection_date = (collected_at AT TIME ZONE 'Asia/Kolkata')::date
WHERE collection_date IS NULL;

ALTER TABLE google_review_snapshots
    ALTER COLUMN collection_date SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_google_review_snapshots_daily
    ON google_review_snapshots (operator_id, collection_date);
