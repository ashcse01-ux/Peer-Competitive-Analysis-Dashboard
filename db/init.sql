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
-- 3. app_store_snapshots  (one row per operator × source × calendar day)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_store_snapshots (
    id              SERIAL PRIMARY KEY,
    operator_id     INT NOT NULL REFERENCES operators(id),
    source          TEXT NOT NULL CHECK (source IN ('google_play', 'ios_app_store')),
    collected_at    TIMESTAMPTZ NOT NULL,
    collection_date DATE NOT NULL,
    overall_rating  NUMERIC(3, 2),
    ratings_count   INT,   -- people who left a star rating (Play: ratings)
    review_count    INT,   -- written text reviews (Play: reviews)
    app_version     TEXT,
    downloads       TEXT,
    downloads_raw   BIGINT,
    star_1          INT,
    star_2          INT,
    star_3          INT,
    star_4          INT,
    star_5          INT,
    play_topics     JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_stale        BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (operator_id, source, collection_date)
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
-- 5. google_review_snapshots  (one row per operator × calendar day)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS google_review_snapshots (
    id              SERIAL PRIMARY KEY,
    operator_id     INT NOT NULL REFERENCES operators(id),
    collected_at    TIMESTAMPTZ NOT NULL,
    collection_date DATE NOT NULL,
    overall_rating  NUMERIC(3, 2),
    review_count    INT,
    star_1          INT,
    star_2          INT,
    star_3          INT,
    star_4          INT,
    star_5          INT,
    is_stale        BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (operator_id, collection_date)
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
    ('YoloBus',             'yolobus'),
    ('IntrCity SmartBus',  'intrcity')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- routes (24 direction-route combinations — see scraper/config/redbus_routes.json)
-- ---------------------------------------------------------------------------
INSERT INTO routes (origin, destination) VALUES
    ('Vijayawada',     'Visakhapatnam'),
    ('Visakhapatnam',  'Vijayawada'),
    ('Vijayawada',     'Hyderabad'),
    ('Hyderabad',      'Vijayawada'),
    ('Bangalore',      'Tirupati'),
    ('Tirupati',       'Bangalore'),
    ('Chennai',        'Bangalore'),
    ('Bangalore',      'Chennai'),
    ('Chennai',        'Tirupati'),
    ('Tirupati',       'Chennai'),
    ('Bangalore',      'Erode'),
    ('Chennai',        'Pondicherry'),
    ('Eluru',          'Hyderabad'),
    ('Erode',          'Bangalore'),
    ('Hyderabad',      'Eluru'),
    ('Pondicherry',    'Chennai'),
    ('Bangalore',      'Pondicherry'),
    ('Pondicherry',    'Bangalore'),
    ('Vijayawada',     'Tirupati'),
    ('Tirupati',       'Vijayawada'),
    ('Coimbatore',     'Bangalore'),
    ('Bangalore',      'Coimbatore'),
    ('Madurai',        'Coimbatore'),
    ('Coimbatore',     'Madurai')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Expanded Operators (Dynamic)
-- ---------------------------------------------------------------------------
INSERT INTO operators (name, slug) VALUES
    ('A1 Travels', 'a1_travels'),\n    ('ADITHIYA AIRBUS', 'adithiya_airbus'),\n    ('AR & BCVR Travels', 'ar_bcvr_travels'),\n    ('AVR Travels', 'avr_travels'),\n    ('Anand Bus Transport', 'anand_bus_transport'),\n    ('BEZAWADA TOURS AND TRAVELS', 'bezawada_tours_and_travels'),\n    ('BSR Tours And Travels', 'bsr_tours_and_travels'),\n    ('Balaji Cabs', 'balaji_cabs'),\n    ('Bharathi Travels', 'bharathi_travels'),\n    ('Bhargav sai Travels', 'bhargav_sai_travels'),\n    ('BigBus', 'bigbus'),\n    ('Bmcc Travels', 'bmcc_travels'),\n    ('CHOPPA TRAVELS', 'choppa_travels'),\n    ('Cherry tours&travels', 'cherry_tours_travels'),\n    ('City Travels', 'city_travels'),\n    ('DELTAKING TRAVELS', 'deltaking_travels'),\n    ('DHRITI TRAVELS', 'dhriti_travels'),\n    ('DMR Travels', 'dmr_travels'),\n    ('DREAM LINE TRAVELS PRIVATE LIMITED', 'dream_line_travels_private_limited'),\n    ('Delta Transports Pvt Ltd', 'delta_transports_pvt_ltd'),\n    ('EASYRIDE SMART BUS', 'easyride_smart_bus'),\n    ('Express Line', 'express_line'),\n    ('FreshBus', 'freshbus'),\n    ('FlixBus', 'flixbus'),\n    ('GMC Travels', 'gmc_travels'),\n    ('GR TRANS (GRT)', 'gr_trans_grt'),\n    ('GREEN CHANNEL EXPRESS', 'green_channel_express'),\n    ('Ganisri Bus', 'ganisri_bus'),\n    ('Gopinath Travels', 'gopinath_travels'),\n    ('Green Bird Tours & Travels', 'green_bird_tours_travels'),\n    ('GreenLine Travels And Holidays', 'greenline_travels_and_holidays'),\n    ('Greenline', 'greenline'),\n    ('HYBUS', 'hybus'),\n    ('Hilight Roadlinks', 'hilight_roadlinks'),\n    ('IRA TRANSPORTS', 'ira_transports'),\n    ('IntrCity SmartBus', 'intrcity_smartbus'),\n    ('JUBILE TRAVELS', 'jubile_travels'),\n    ('Jabbar Travels', 'jabbar_travels'),\n    ('Jayanthi Travels', 'jayanthi_travels'),\n    ('KALOSONA DREAMLINE', 'kalosona_dreamline'),\n    ('KARTHIKEYA TOURS AND TRAVELS', 'karthikeya_tours_and_travels'),\n    ('KBS Luxury Bus', 'kbs_luxury_bus'),\n    ('KBS Sree Garuda', 'kbs_sree_garuda'),\n    ('KMRL kalaimakal Road Lines', 'kmrl_kalaimakal_road_lines'),\n    ('KMS Travels', 'kms_travels'),\n    ('KPN', 'kpn'),\n    ('Kallada Travels (Suresh Kallada)', 'kallada_travels_suresh_kallada'),\n    ('Krish Travels', 'krish_travels'),\n    ('LG BUS', 'lg_bus'),\n    ('LUCKY TRAVELS', 'lucky_travels'),\n    ('Lemon Travels', 'lemon_travels'),\n    ('MAHA BUS', 'maha_bus'),\n    ('MMK Travels', 'mmk_travels'),\n    ('Maaruti Travels', 'maaruti_travels'),\n    ('Mahi Trans Solutions', 'mahi_trans_solutions'),\n    ('Mass Travels', 'mass_travels'),\n    ('Mayuri Travels', 'mayuri_travels'),\n    ('Mettur Super Services(mss)', 'mettur_super_services_mss'),\n    ('Morning Star Travels', 'morning_star_travels'),\n    ('Nani''s Sai Krishna Travels', 'nani_s_sai_krishna_travels'),\n    ('Nanthi Travels', 'nanthi_travels'),\n    ('National Travels NTA', 'national_travels_nta'),\n    ('Navayuga Travels', 'navayuga_travels'),\n    ('No 1 Air Travels', 'no_1_air_travels'),\n    ('NueGo', 'nuego'),\n    ('PSS Transport', 'pss_transport'),\n    ('Pramukh Travels', 'pramukh_travels'),\n    ('Prathap Travels', 'prathap_travels'),\n    ('Punchiry Travels and Holidays', 'punchiry_travels_and_holidays'),\n    ('R.S.MANI KNIGHT RIDERS', 'r_s_mani_knight_riders'),\n    ('RADIO BUS', 'radio_bus'),\n    ('RAJESH TRANSPORTS', 'rajesh_transports'),\n    ('RK Travels', 'rk_travels'),\n    ('RKK Travels', 'rkk_travels'),\n    ('RR TRAVELS', 'rr_travels'),\n    ('RUDRA TOURS & TRAVELS', 'rudra_tours_travels'),\n    ('Raja Rani Holidays', 'raja_rani_holidays'),\n    ('Raja Travels', 'raja_travels'),\n    ('Ram Dalal Holidays Pvt Ltd', 'ram_dalal_holidays_pvt_ltd'),\n    ('Reliance Travels', 'reliance_travels'),\n    ('Royal Rich India', 'royal_rich_india'),\n    ('Royal Rich India R No. 207', 'royal_rich_india_r_no_207'),\n    ('SAI SIMHAPURI TRAVELS', 'sai_simhapuri_travels'),\n    ('SAZ TRAVELS', 'saz_travels'),\n    ('SINDOOR EXPRESS', 'sindoor_express'),\n    ('SREE KVR TRAVELS', 'sree_kvr_travels'),\n    ('SST Limoliner', 'sst_limoliner'),\n    ('SSVM Travels', 'ssvm_travels'),\n    ('SURYA TRANSPORTS', 'surya_transports'),\n    ('SV Tours and Travels', 'sv_tours_and_travels'),\n    ('SVD Vedansh Travels', 'svd_vedansh_travels'),\n    ('Sai RK Travels', 'sai_rk_travels'),\n    ('Sai Srinivasa Travels', 'sai_srinivasa_travels'),\n    ('Shyamoli Paribahan Pvt Ltd', 'shyamoli_paribahan_pvt_ltd'),\n    ('Sooriyan Travels', 'sooriyan_travels'),\n    ('Sravani Travels', 'sravani_travels'),\n    ('Sri Atluri Travels', 'sri_atluri_travels'),\n    ('Sri DurgaMalleswari Travels', 'sri_durgamalleswari_travels'),\n    ('Sri KVR Travels', 'sri_kvr_travels'),\n    ('Sri Keerthana Sai Travels', 'sri_keerthana_sai_travels'),\n    ('Sri Krishna Travels', 'sri_krishna_travels'),\n    ('Sri Padmavathi Travels', 'sri_padmavathi_travels'),\n    ('Sri Sai Anjana Tours and Travels', 'sri_sai_anjana_tours_and_travels'),\n    ('Sri Sugam Bus Tours and Travels', 'sri_sugam_bus_tours_and_travels'),\n    ('Sri Tulasi Tours and Travels', 'sri_tulasi_tours_and_travels'),\n    ('Sri VInayaka Travels(Siva''s)', 'sri_vinayaka_travels_siva_s'),\n    ('Sri Vaari Travels', 'sri_vaari_travels'),\n    ('Sri Vengamamba Bus Transport (SVBT)', 'sri_vengamamba_bus_transport_svbt'),\n    ('Sri Venkataramana Travels', 'sri_venkataramana_travels'),\n    ('Srivari Travels', 'srivari_travels'),\n    ('Srivastav Travels', 'srivastav_travels'),\n    ('Sunline Travels', 'sunline_travels'),\n    ('Surya Connect', 'surya_connect'),\n    ('Svkdt travels', 'svkdt_travels'),\n    ('TGSRTC', 'tgsrtc'),\n    ('Taruni Trans & Logistics', 'taruni_trans_logistics'),\n    ('Tippusultan Travels', 'tippusultan_travels'),\n    ('Universal Bus( UTS)', 'universal_bus_uts'),\n    ('V Kaveri Travels', 'v_kaveri_travels'),\n    ('VEE VEE BUS', 'vee_vee_bus'),\n    ('VIVIN Travels', 'vivin_travels'),\n    ('VKV Travels', 'vkv_travels'),\n    ('VPS Transport', 'vps_transport'),\n    ('VRL Travels', 'vrl_travels'),\n    ('Vanjarapu Travels', 'vanjarapu_travels'),\n    ('Varsha Tours And Travels', 'varsha_tours_and_travels'),\n    ('Venkata Sai Krishna Travels', 'venkata_sai_krishna_travels'),\n    ('Vikram Travels', 'vikram_travels'),\n    ('YBM Travels(BLM)', 'ybm_travels_blm'),\n    ('YOLOBUS PRIVATE LIMITED', 'yolobus_private_limited'),\n    ('ZenBus Travels', 'zenbus_travels'),\n    ('zingbus plus', 'zingbus_plus')
ON CONFLICT DO NOTHING;
