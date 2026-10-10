# ET-GPT — project knowledge

**What:** embeddable support chatbot for EarthTekniks. New build on `vercel/chatbot`. See `SRS.md` (authoritative) and `REQUIREMENTS.html` (stakeholder view).

## Layout
- `mcp-server/` — cloned from `../earthtekniks-assistant-suite/mcp-server` (works; do not rebuild). Run: `python -m et_mcp.server --server all --transport streamable-http --port 8001`
- `website-preview/` — cloned mock site. Run: `CHAT_ORIGIN=… WIDGET_ID=… node server.mjs` (port 3150). Brand colour `#003399`, fonts Poppins/Open Sans.
- `app/` — ET-GPT (vercel/chatbot template: Next 16, AI SDK 7, Drizzle, next-auth guest auth until Phase 2).
- `../earthtekniks-assistant-suite/chatbot` — reference only for behaviours/tests.

## Decisions (see SRS §2)
Better Auth (anonymous/email-verified/admin) + Postgres RLS via `et_app` role (Supabase dropped, Phase 2) · AI SDK + NVIDIA Nemotron (mock for dev) · OpenJEV for routing (`OPENJEV_API_KEY`) · rate-limiter-flexible (Postgres) · openredaction → Presidio if recall poor · mem0+pgvector (verified only) · pg-boss workers · SKILL.md skills · in-browser Whisper.

## Commands (no Docker needed for dev; Docker Desktop would not start in the Phase 1 session)
- DB: `cd app && pnpm db:migrate` (requires POSTGRES_URL_ADMIN in .env.local pointing to Neon; no embedded DB)
- App: `cd app && pnpm exec next dev --turbo -p 3100` (`.env.local`: `LLM_PROVIDER=mock|nvidia`)
- Site: `cd website-preview && CHAT_ORIGIN=http://localhost:3100 WIDGET_ID=1 node server.mjs` (:3150)
- MCP: `cd mcp-server && et-mcp --transport streamable-http --host 127.0.0.1 --port 8002` (venv via `uv venv --python 3.12`; port changed from 8001 to avoid conflict with Lost & Found API)
- Tests: `cd app && node tests-api/phase1.mjs && node tests-api/phase2.mjs` (app running with LLM_PROVIDER=mock)
- PII service: `cd pii-service && .venv/Scripts/python.exe -m uvicorn main:app --port 8010` (venv via `uv venv --python 3.12`; spaCy en_core_web_md). Required: chat fails closed (503) without it.
- MCP also needs `mcp-server/.env` (copy of mcpserver.env from the secrets zip; gitignored) for catalog tools.
- Unit tests: `cd app && npx tsx tests-unit/{guardrails,calc,mcp-roles,pii-recall}.mts`; live router check `npx tsx tests-unit/openjev-live.mts` (a few cents at most).
- Test env: ROUTER_PROVIDER=mock LLM_PROVIDER=mock TEST_CAPTURE_DIR=.testcapture in app/.env.local; set ROUTER_PROVIDER=openjev for real routing.
- Admin seed: `cd app && pnpm db:seed-admin` (ADMIN_EMAIL/ADMIN_PASSWORD in .env.local). Verification links are logged and written to `app/.devmail/` (no SMTP yet).
- Env: POSTGRES_URL (et_app, RLS) · POSTGRES_URL_ADMIN (owner) · APP_DB_PASSWORD · BETTER_AUTH_SECRET/URL · RATE_* overrides · COOKIE_CROSS_SITE=1 for HTTPS cross-site embeds

## Rules
- Glue existing libraries; custom code only if none exists.
- Each phase: Plan → Approval → Implement → Test → Cross-check SRS → Report → STOP.
- Never commit `.env`. Redact PII before any third-party call. Avoid paid/live model calls except one in Phase 5.
- Caps: guest 5/day 2/min; verified 50/day 5/min; "request" = one inbound message.

## Progress
- Phase 0: research done; OpenJEV verified live (HTTP 200, ~0.7 s, choice+noul answers); folders cloned; SRS/REQUIREMENTS/CLAUDE written.
- Phase 1: DONE, awaiting approval for Phase 2. App scaffolded from vercel/chatbot; NVIDIA/mock provider (`lib/ai/providers.ts`); EarthTekniks prompt; brand #003399; widget.js (shadow DOM + iframe); mock site embeds it; 9 API checks pass; MCP server runs on :8001 (not yet wired to chat).

- Phase 2: DONE, awaiting approval for Phase 3. Better Auth, roles, `lib/authz.ts`, RLS, quotas (`lib/ratelimit.ts`), admin stats route; 16 checks (tests-api/phase2.mjs) + 9 phase-1 checks pass.
- Phase 3: DONE. MCP (3 servers via HTTP, role-filtered tools, audit in ToolLog), OpenJEV router, Presidio PII, price-mask guardrail, plan card, server-verified calculation form, skills (docs/skills.md). Checks: phase1 9, phase2 16, phase3 14, unit tests, OpenJEV live 8/8, PII recall 57/57 on dev sample.
- Phase 4: DONE, awaiting approval for Phase 5. Admin dashboard at /admin (Overview, Conversations, Insights, Users, Workers). Libraries: recharts, @tanstack/react-table, pg-boss. InsightReport table (migration 0004). Background worker via instrumentation.ts + pg-boss. Demo seed data (scripts/seed-demo.mjs). Real Nemotron test confirmed on-brand. All 39 checks pass (phase1 9 + phase2 16 + phase3 14).

## Open issues
- No SMTP: verification emails only logged (add sender in lib/auth.ts before prod).
- Calculation answers are verified server-side and do not count as quota requests (Phase 3 done).
- Postgres is Neon (ap-southeast-1); set POSTGRES_URL + POSTGRES_URL_ADMIN in .env.local. No embedded fallback — app throws on startup if unset.
- Cross-site iframe cookies need COOKIE_CROSS_SITE=1 + HTTPS (not tested on a real cross-site origin).
- Does Nemotron 3.5 accept images? (check Phase 1)
- OpenJEV key was pasted in chat — rotate before production.
- openredaction recall unmeasured.
