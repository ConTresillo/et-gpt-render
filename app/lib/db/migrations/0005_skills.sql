-- Active skills used by the chat router.
CREATE TABLE IF NOT EXISTS "Skill" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt"       timestamp NOT NULL DEFAULT now(),
  "updatedAt"       timestamp NOT NULL DEFAULT now(),
  "name"            text NOT NULL UNIQUE,
  "description"     text NOT NULL,
  "triggerPatterns" jsonb NOT NULL DEFAULT '[]',
  "promptTemplate"  text NOT NULL,
  "useCount"        int NOT NULL DEFAULT 0,
  "score"           float NOT NULL DEFAULT 0.5,
  "archived"        boolean NOT NULL DEFAULT false,
  "source"          text NOT NULL DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS "Skill_archived_score_idx" ON "Skill" ("archived", "score" DESC);

-- Skills proposed by the evolution worker, pending admin review.
CREATE TABLE IF NOT EXISTS "ProposedSkill" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt"       timestamp NOT NULL DEFAULT now(),
  "action"          text NOT NULL DEFAULT 'new',
  "targetSkillId"   uuid REFERENCES "Skill"("id") ON DELETE SET NULL,
  "name"            text NOT NULL,
  "description"     text NOT NULL,
  "triggerPatterns" jsonb NOT NULL DEFAULT '[]',
  "promptTemplate"  text NOT NULL,
  "rationale"       text NOT NULL,
  "sourceQueryIds"  jsonb NOT NULL DEFAULT '[]',
  "exampleQueries"  jsonb NOT NULL DEFAULT '[]',
  "status"          text NOT NULL DEFAULT 'pending',
  "reviewedBy"      uuid,
  "reviewedAt"      timestamp,
  "reviewNote"      text
);
CREATE INDEX IF NOT EXISTS "ProposedSkill_status_idx" ON "ProposedSkill" ("status", "createdAt" DESC);
