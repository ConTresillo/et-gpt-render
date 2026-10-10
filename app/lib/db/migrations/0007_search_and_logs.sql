-- pg_trgm for trigram similarity on Chat.title
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index for full-text search (BM25-style ranking via ts_rank)
CREATE INDEX IF NOT EXISTS "Chat_title_fts_idx"
  ON "Chat" USING gin(to_tsvector('english', "title"));

-- GIN index for fuzzy trigram search
CREATE INDEX IF NOT EXISTS "Chat_title_trgm_idx"
  ON "Chat" USING gin("title" gin_trgm_ops);

-- AppLog: persisted warn/error server logs visible in admin panel
CREATE TABLE IF NOT EXISTS "AppLog" (
  "id"        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "level"     text        NOT NULL,
  "module"    text        NOT NULL DEFAULT 'app',
  "message"   text        NOT NULL,
  "data"      jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "AppLog_level_createdAt_idx"
  ON "AppLog" ("level", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AppLog_module_createdAt_idx"
  ON "AppLog" ("module", "createdAt" DESC);
