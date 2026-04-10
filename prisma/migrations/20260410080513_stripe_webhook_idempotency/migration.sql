CREATE TABLE stripe_webhook_events (
  event_id    VARCHAR(255) PRIMARY KEY,
  received_at TIMESTAMP NOT NULL DEFAULT NOW()
);
