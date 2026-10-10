-- SystemConfig: admin-configurable key-value settings
CREATE TABLE IF NOT EXISTS "SystemConfig" (
  "key"        text PRIMARY KEY,
  "value"      text NOT NULL,
  "label"      text NOT NULL,
  "description" text,
  "updatedAt"  timestamp NOT NULL DEFAULT now()
);

-- Seed default insight trigger settings
INSERT INTO "SystemConfig" ("key", "value", "label", "description") VALUES
  ('insight_message_threshold', '50',  'Message threshold',   'Number of new messages in the sliding window that triggers an auto insight run'),
  ('insight_window_hours',      '24',  'Window (hours)',      'Sliding window width in hours for counting recent messages'),
  ('insight_cooldown_hours',    '12',  'Cooldown (hours)',    'Minimum hours between two consecutive auto-triggered insight runs')
ON CONFLICT ("key") DO NOTHING;

-- Link each insight report to its predecessor for trend comparisons
ALTER TABLE "InsightReport"
  ADD COLUMN IF NOT EXISTS "prevInsightId" uuid REFERENCES "InsightReport"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "trendSummary"  text;
