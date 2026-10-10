# Render free demo

`render.yaml` explicitly selects free plans for every service. Postgres stays on
the configured external database; there is no new paid database or Redis.

Deploy MCP and PII first using the root-context Dockerfiles under `deploy/`.
Set a separate random 32+ character `SERVICE_AUTH_KEY` on each. The gateways
require `Authorization: Bearer <key>` on all routes except `GET /health` and
preserve the original ASGI lifespan and streaming transport. MCP source remains
unchanged. Its catalog credential should have read-only catalog access.

For chat, set `MCP_SERVERS` to JSON with the deployed MCP HTTPS URL ending in
`/mcp` and an `Authorization` header. Set `PII_SERVICE_URL` to the deployed PII
HTTPS origin and `PII_SERVICE_API_KEY` to its key. Use existing database/model
credentials in Render environment settings, never in Git or NEXT_PUBLIC values.
Set `BETTER_AUTH_URL` to the public chat HTTPS origin. Set website `CHAT_ORIGIN`
to that same public origin.

Free services have no pre-deploy commands: the chat start command runs the
idempotent migration before starting Next.js. Workers run inside the app with
`RUN_WORKERS=1`. Do not also start a dedicated worker. Pending jobs survive in
Postgres while the instance sleeps, but processing resumes only while awake.

Free instances sleep and have ephemeral files. Application records, approvals,
skills and job queues persist externally in Postgres. Bundled knowledge docs
survive in the deployment image; embedding/model caches may rebuild. Public
auth-protected endpoints and cold starts are demo compromises. Watch memory
usage: 512 MB per free service may be insufficient under load.

Current website is the captured preview; submissions are disabled. Email signup
verification still needs an email delivery provider before public onboarding.

Verify deployed health routes, unauthenticated MCP/PII rejection, guest chat,
admin login, approved calculation followed by catalog search, and worker status.
