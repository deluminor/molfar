CREATE TABLE IF NOT EXISTS native_consumption_v1 (
    session_id TEXT NOT NULL,
    source_key TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_id TEXT,
    model_name TEXT,
    started_at_ms INTEGER CHECK(started_at_ms >= 0),
    reported_at_ms INTEGER CHECK(reported_at_ms >= 0),
    input INTEGER CHECK(input >= 0),
    output INTEGER CHECK(output >= 0),
    cache_read INTEGER CHECK(cache_read >= 0),
    cache_write INTEGER CHECK(cache_write >= 0),
    CHECK((input IS NULL) = (output IS NULL)
        AND (input IS NULL) = (cache_read IS NULL)
        AND (input IS NULL) = (cache_write IS NULL)),
    PRIMARY KEY(session_id, source_key)
);
CREATE INDEX IF NOT EXISTS native_consumption_v1_date
ON native_consumption_v1(reported_at_ms, session_id);
