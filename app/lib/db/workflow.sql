CREATE SCHEMA IF NOT EXISTS et_private;
CREATE TABLE IF NOT EXISTS et_private.workflow (
  chat_id uuid PRIMARY KEY REFERENCES public."Chat"(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE et_private.workflow ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA et_private FROM PUBLIC;
REVOKE ALL ON et_private.workflow FROM PUBLIC;
