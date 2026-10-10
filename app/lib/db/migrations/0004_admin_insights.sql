-- AI-generated insight reports, one row per background analysis run.
CREATE TABLE IF NOT EXISTS "InsightReport" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt"      timestamp NOT NULL DEFAULT now(),
  "windowDays"     int NOT NULL DEFAULT 30,
  "status"         text NOT NULL DEFAULT 'pending',
  "headline"       text,
  "overview"       text,
  "topTopics"      jsonb,
  "recommendations" jsonb,
  "errorMsg"       text,
  "analyzedCount"  int,
  "generatedAt"    timestamp
);
CREATE INDEX IF NOT EXISTS "InsightReport_createdAt_idx" ON "InsightReport" ("createdAt" DESC);
