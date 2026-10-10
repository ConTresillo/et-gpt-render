# Local chatbot stack

The local stack is the website preview on `3150`, Next.js chat/admin on `3100`, MCP on `8002`, Presidio on `8010`, and a dedicated pg-boss worker. The MCP catalog uses the user-configured Supabase session pooler for IPv4 access.

From the respective directories:

```powershell
# app/.env.local: LLM_PROVIDER=nvidia, ROUTER_PROVIDER=openjev, RUN_WORKERS=0
cd app
pnpm exec next dev --turbo -p 3100
# In a second terminal, also from app:
pnpm worker

# From mcp-server (use its existing .venv):
.venv/Scripts/python.exe -m et_mcp.server --server all --transport streamable-http --host 127.0.0.1 --port 8002

# From pii-service:
.venv/Scripts/python.exe -m uvicorn main:app --host 127.0.0.1 --port 8010

# From website-preview:
node server.mjs
```

Without `RUN_WORKERS=0`, Next.js also consumes jobs internally. Use either its embedded workers or the dedicated worker, rather than both. The worker reads the same `.env.local`; database credentials and model keys remain there. Keep `MCP_SERVERS` pointing at the existing MCP endpoint. `/api/health` checks the web process; `/api/admin/workers` reports the configured queues. Current local process logs are `.dev-out.log`, `.worker-out.log` and matching error logs under `app/`.

## Functional checks

```powershell
# From app; opt-in live checks use real NVIDIA/OpenJEV and the configured admin:
node tests-api/live-workflow.mjs
node tests-api/widget-layout.mjs
pnpm exec tsx tests-unit/thinking.mts
pnpm exec tsx tests-unit/chat-title.mts
node --conditions=react-server --import tsx tests-unit/evidence.mts
node --conditions=react-server --import tsx tests-unit/catalog-inputs.mts
pnpm exec tsc --noEmit
```

Live checks verify actual skill loading, company retrieval, catalog searches, calculator-definition reads, approval before execution, persisted responses, generated titles, and completed insights jobs. They delete their test conversations and leave a generated insights report visible in admin. The layout check covers a compact 400px widget and expanded 820px view.

## Workflow ownership

The customer chatbot executes through Mastra `Agent.stream()` in `app/lib/ai/mastra.ts`. Mastra owns the model/tool loop and native skills processor. Filesystem defaults and active database overrides are snapshotted per request and registered through `createSkill()`. The compatibility `loadSkill` tool delegates to Mastra `agent.getSkill()` so existing activity labels and tradeoff controls continue working. Additional native skill tools are available during unconstrained steps. No workspace, shell or external write tools are enabled.

Jev routing, evidence verification and role permissions remain business policies. Mastra thread-scoped memory stores plans, requested input keys and verified facts. Mastra workflows persist calculation proposals and resume the exact approval run. The existing transcript database serves the website UI. The stable workflow API is used rather than the beta durable-agent API.

Runtime requirements: Node >=22.13.0, `@mastra/core` 1.75.0, `@mastra/ai-sdk` 1.10.7, `@mastra/pg` 1.30.0 and `@mastra/memory` 1.36.0, resolved in the lockfile. Zod 4.6.5 aligns application and Mastra schemas. Next loads Mastra and its schema adapter as server external packages. The official stream adapter uses the AI SDK v7 contract; reasoning and price filters run before the customer stream. NVIDIA tool-only assistant messages include an empty content field as required by that endpoint. Mastra serializes tool results, so AI SDK v7 `toModelOutput` callbacks are removed at the tool boundary.

Run `pnpm test:agent` for native skill registration/loading and event conversion; run `node tests-api/company-routing.mjs` and `node tests-api/lens-working-distance.mjs` against the local services for real Jev/NVIDIA/MCP integration.

OpenJEV selects the intent and ambiguity. The app requires the relevant core skill and first read tool before an answer. `app/skills/` contains the core workflows; matching database skills supply supplemental guidance. Calculator inputs are read from MCP, grounded against the customer's stated values, and validated before a proposal is shown. Only the approval continuation calls MCP's `calculate` tool. Read-only tools run automatically.

Tool progress is displayed as short activity labels. Private reasoning is not rendered; tool arguments/results are masked for customers and expandable for administrators. The calculation approval form remains visible because the customer must review its inputs. Background title generation is bounded and rejects reasoning text; history polls while titles are pending. Customer insights use user messages rather than the assistant's generated replies. Skill usage counts reflect actual skill loads.

## Grounded answers

The app normalizes MCP output and supplies the normalized output to the model using an explicit JSON serializer. Successful company passages, live catalog rows, reference reads and approved calculator results receive stable source IDs. Responses store `data-sources` with the retrieved evidence so Sources remain inspectable after a reload. Failed or low-confidence retrieval is not cited as fact. No public source URL is fabricated when the knowledge base only supplies a document ID.

Catalog searches preserve explicit customer focal-length, sensor-format and mount filters against the actual table schema. Inch labels are normalized to the catalog's quoted format; an empty match does not authorize dropping these requirements. Product comparison tables render actual retrieved fields directly, avoiding invented sensor compatibility or interpretations of distortion/aperture codes. The full row is available under Sources. Table notes are read before interpreting other specifications.

The default model/tool budget is 120 seconds with at most 10 model steps, and private output is suppressed. The customer sees progress while tools run and receives a retry message if no answer or valid approval form can be produced. Unknown MCP tools are hidden until explicitly reviewed for permissions; calculation execution remains server-only after customer approval.
# Admin regression checks

Complex requests are classified by Jev, then receive an admin-configured linear plan stored in `et_private.workflow`. The private schema is initialized by the normal app migration command. This state is loaded separately from chat history and retains the goal, customer inputs, approval status, approved calculation result, catalog constraints, and a bounded tool/recovery trace. Customer streams and message-history responses omit internal tool arguments and debug results. Admins can inspect the current plan under Conversations → view conversation → Internal workflow, and edit default steps under Settings → Complex-request plan.

Run `node tests-api/lens-working-distance.mjs` from `app` to verify the 100 mm object / 8.8 mm sensor / 25 mm lens request. The test checks that the plan is saved before approval, resumes into actual catalog queries afterward, preserves the focal-length constraint, returns cited model rows, and ends with a completed durable plan.

Run `node tests-api/lens-assumptions.mjs` for the two-turn "100 mm field of view" → "pick on ur own" regression. Jev receives recent conversation text, retrieval for the active goal, and persisted workflow facts. Explicit delegation permits an illustrative input proposal, not automatic execution. Assumed quantities are labelled in the editable approval form, retained in the private plan, and labelled again in the approved calculation source/result. A calculated focal-length target restricts catalog tables to focal-length-capable schemas; reads seek the closest retrieved focal lengths at or below that target without replacing an explicit customer focal-length constraint. The chatbot labels these as candidates requiring application confirmation.

Each response emits a single start event before its initial tool activities. Mastra's stream adapter does not emit another start, preventing split responses with duplicated initial progress labels.

Run `node tests-api/admin-workflows.mjs` from `app` with the local services running. It checks trigger settings, the separate worker heartbeat, user search, role persistence, user ordering, and a completed one-day insight report linked to its predecessor. It uses the configured admin account and creates an insight report.

Workers publish a heartbeat every 15 seconds; the admin page reports offline after 45 seconds without one. Only the latest insight report is displayed. Previous reports remain available internally for trend comparisons. Both automatic and manually requested reports use the configured sliding window unless an explicit window is supplied to the API. Admin role checks use current session data without the five-minute cookie cache.


### Agent failure recovery
Mastra owns retries through its existing multi-step agent loop: `prepareStep` supplies correction/replanning instructions and role-filtered recovery tools after a failed result; `stopWhen` and the admin-configured step/time budgets bound execution. Nested MCP errors and invocations with no result count as failures. Three failed actions or two identical failed requests end recovery for that turn. Empty catalog results are not infrastructure failures. Private workflow traces retain errors and recovery state; calculations remain server-only after approval.

Run `node --conditions=react-server --import tsx tests-unit/recovery.mts` from `app` for failure, corrected continuation, repeated-call cutoff, and approval-boundary checks.

### Catalog handoff and audit
Catalog follow-ups reuse an executed approval from private workflow facts or the linked approval and saved calculator citation. They route to catalog lookup, never another calculation. Stated focal length is preserved and unstated mount/sensor-format filters are blocked. Catalog prose comes from retrieved evidence rather than a model-generated recommendation.

Admin Conversations uses the existing protected conversation API; the separate audit screen has been removed. It includes the model/router decision, selected skill body, private plan, latest 200 tool events with inputs/results/errors, saved messages and approvals, and a JSON export. Raw tool details are expandable in admin chat when the server permits them. Customer streams remain masked. Auditing does not record private model reasoning.

### Native durable state and approvals
Mastra `@mastra/pg` and `@mastra/memory` now own durable thread state. An editable calculation proposal creates a real `earthtekniks-calculation` workflow run and suspends at `customer-approval`. Approval resumes that exact run, validates edited inputs and executes `execute-approved-calculation`; only that step calls the MCP calculator. Results are recovered by the conversation/proposal-derived run ID and authenticated resource ID. Citation text is never used as calculation state.

Structured `pendingInputs` contains the calculator schema, ordered requested keys and supplied values. Numeric replies bind to those keys, independent of displayed wording. Existing private workflow rows migrate into Mastra memory on access. Trusted old private execution receipts migrate into native completed runs without re-execution. Legacy citation-only calculations are not reconstructed; request a new form. Existing unanswered forms with their original validation schema migrate by exact tool-call ID into a native suspended run when approved. Forms missing a reliable validation schema require a new form. UI transcript storage and authentication remain application responsibilities.

`MASTRA_DATABASE_URL` optionally selects Mastra storage; otherwise it uses `POSTGRES_URL_ADMIN`. Storage initializes its versioned tables in the private `et_mastra` schema during migration/startup, with public grants revoked and RLS enabled. Keep this owner credential server-side. The deployed migration command uses `node --conditions=react-server --import tsx lib/db/migrate.ts`. Mastra memory is read-only to the model: the app validates customer input and writes approved facts, so the model cannot overwrite approvals.

Lens results include coverage, mount, working-distance range, resolution and camera-type checks. Each is verified, incompatible or unverified using retrieved specs. A single listed working distance is not treated as an operating range. Sensor optical formats are not silently converted into dimensions, and width is not assumed to equal diagonal. Administrators configure actual column aliases in Settings. Missing evidence stays unverified and asks for camera specifications; candidates are not presented as confirmed fits.

Recovery policy is unchanged. A comprehensive reliability evaluation remains deferred as requested; only targeted migration/type/storage checks are performed.
