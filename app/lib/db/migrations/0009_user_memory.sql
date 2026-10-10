-- Long-term memory per verified user.
-- pgvector extension is optional; the table works without it (no embedding column).
-- Enable MEMORY_PROVIDER=pg in env to activate the provider.

CREATE TABLE IF NOT EXISTS "UserMemory" (
  "id"        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"    UUID        NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "chatId"    UUID,
  "content"   TEXT        NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "UserMemory_userId_idx" ON "UserMemory" ("userId");
CREATE INDEX IF NOT EXISTS "UserMemory_createdAt_idx" ON "UserMemory" ("createdAt" DESC);

-- RLS: users may only read their own memories; workers use admin role (bypasses RLS).
ALTER TABLE "UserMemory" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mem_select_own" ON "UserMemory"
  FOR SELECT
  USING (
    "userId" = (current_setting('app.user_id', true))::uuid
  );
