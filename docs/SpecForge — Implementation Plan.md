# SpecForge — Implementation Plan

Companion to `ARCHITECTURE.md`. This is the build order, week by week, with exit criteria, schemas, endpoints and tests. Assumption: solo developer, ~15–20 focused hours/week. Total to a genuinely impressive, demoable v1: **10 weeks**. Everything after week 10 is optional expansion.

---

## 0. Guiding rules for the build

1. **Vertical slices, not layers.** Every week ends with something clickable end-to-end. Never "backend week" then "frontend week".
2. **The domain package first.** Entities, invariants, scheduler and diff are pure functions with tests before any UI touches them.
3. **Demo path is sacred.** From week 4 onward, there is always a working 6-minute demo: paste a brief → spec → stories → timeline → Deal Room → push to Linear → Slack ping. Never break it.
4. **Write the ADR when you make the call**, not later. Ten short ADRs beat one long retro doc.
5. **Ship the docs as product.** README narrative, ARCHITECTURE.md, ADRs and a 3-minute Loom are graded as heavily as the code by anyone senior.



### Definition of Done (every story)

Types from `packages/schemas` (no hand-written duplicates) · unit tests on domain logic · integration test on the use-case · OpenAPI updated · loading/empty/error states in UI · a11y pass (keyboard + labels) · structured log + trace span · no `any`, no TODO left in main.

---



## 1. Milestone map


| Phase                           | Weeks | Outcome                                                                      | Client-visible?             |
| ------------------------------- | ----- | ---------------------------------------------------------------------------- | --------------------------- |
| **P0 — Foundations**            | 1     | Monorepo, CI, auth, tenancy, design tokens, empty dashboard shell            | no                          |
| **P1 — Spec engine**            | 2–3   | Brief → structured spec → edit → versions → diffs                            | demo                        |
| **P2 — Stories & traceability** | 4     | Requirement → stories + Gherkin criteria + estimates + backlog board         | demo                        |
| **P3 — Delivery plan**          | 5     | Deterministic scheduler, phases, milestones, Gantt, releases, charts         | demo                        |
| **P4 — Diagrams & API design**  | 6     | Mermaid + React Flow diagrams, endpoints, ERD, OpenAPI export                | demo                        |
| **P5 — Deal Room**              | 7     | Client-facing branded proposal, share links, live scope recompute, PDF       | **yes — the money feature** |
| **P6 — Integrations**           | 8     | Linear + Trello one-click push, Slack notifications & digests                | yes                         |
| **P7 — Review packs & quality** | 9     | Security/scale/observability/ambiguity packs, coverage metrics, eval harness | demo                        |
| **P8 — Hardening & launch**     | 10    | Observability, load test, RLS audit, docs, deploy, demo video                | yes                         |
| **P9+ — Expansion**             | 11+   | Collaboration, Jira/GitHub, analytics, billing, IDE extension                | —                           |


---



## 2. Phase detail



### P0 · Week 1 — Foundations

**Build**

- [x] Turborepo + pnpm; apps `web`, `api`, `worker`; packages `domain`, `schemas`, `ui`, `prompts`, `integrations`, `eval`.
- [x] Postgres 16 + pgvector and Redis via docker-compose; Prisma schema v1 (org, user, membership, workspace, project, audit_log).
- [x] **RLS from day one**: policies on every tenant table; `SET LOCAL app.org_id` in a request-scoped Prisma extension.
- [x] Auth: dev-login stub (Auth.js Google + GitHub + magic link planned); org creation on first login, invite flow stub.
- [x] `PolicyService` with CASL abilities for the five roles.
- [x] Design system: tokens for Blueprint Noir + Blueprint Paper, primitives (button, input, empty state, skeleton), sidebar shell with grouped nav.
- [ ] Command palette (⌘K) skeleton — sidebar nav done, palette pending.
- [x] CI: lint, typecheck, unit tests workflow; Prisma migrate check.
- [x] Structured logging with pino (`org_id`/`trace_id` via nestjs-pino).
- [ ] OTel wired (traces to local Tempo) — deferred; pino logging in place.

**Exit criteria:** two users in two orgs log in, cannot see each other's projects (proved by an automated RLS test), dashboard shell renders in both themes, CI green.

**Status (2026-08-24):** Monorepo scaffold complete. Domain package (diff, keys, ambiguity, coverage) with 40+ unit tests. Dev auth + CASL policy service. Dashboard shell with theme toggle. RLS policies in migration. Remaining: RLS integration test, ⌘K palette, full Auth.js OAuth.

---



### P1 · Weeks 2–3 — Spec engine

**Domain (week 2)** — partially started in P0

- [x] `Spec`, `SpecVersion`, `Requirement`, `Suggestion`, `AiRun` schemas in `@specforge/schemas`
- [x] `Requirement.key` auto-assigned FR-###/NFR-###, stable across versions
- [x] `publishVersion(spec)` → content-hashed immutable snapshot
- [x] `diff(v1, v2)` → structural changeset {added, removed, modified, moved}
- [x] `ambiguityHeuristics(requirement)` → deterministic pre-score
- [x] Unit tests: 40+ cases on diff and key stability

**LLM Gateway (week 2)**

- [x] Prompt registry with versioned templates; `spec.fromBrief@v1`
- [x] Zod schema validation + repair loop (≤2 retries with error feedback) — `runStructured` in `@specforge/prompts/gateway`
- [x] Tiered model routing by task descriptor; usage/cost recorded per `AiRun`
- [x] Redis prompt cache keyed by hash(template+context+model) — `PromptCache` port + Redis impl in worker
- [x] SSE streaming channel `/runs/:id/stream` — Redis pubsub → `text/event-stream`

**API (week 3)**

```
POST   /projects/:id/briefs                  # paste text | upload file | transcript
POST   /projects/:id/specs/generate          # async → { runId }
GET    /runs/:id/stream                      # SSE tokens + status
GET    /specs/:id                            # graph, paginated subtree
PATCH  /requirements/:id
POST   /specs/:id/requirements
GET    /specs/:id/suggestions
POST   /suggestions/:id/accept | /reject
POST   /specs/:id/versions                   # publish
GET    /specs/:id/versions/:a/diff/:b
```

**UI (week 3)**

- Three-pane spec workspace: outline tree · section editor (TipTap, structured blocks per requirement) · AI rail.
- Streaming generation with per-requirement accept/reject cards showing `sourceRefs` ("from transcript 12:41").
- Version dropdown + side-by-side structural diff view with AI-written "what changed & why" summary.

**Exit criteria:** paste a 200-word brief → 15–25 keyed requirements with priorities, assumptions and out-of-scope → edit → publish v2 → see a real structural diff. Invalid model output never corrupts the graph (test with a forced-bad-output fixture).

**Status (2026-08-24):** Backend vertical slice complete. LLM gateway (`packages/prompts/gateway.ts`): tiered routing, JSON extraction, Zod validation + repair loop, Redis prompt cache, cost estimation — 19 unit tests including forced-bad-output fixtures. Worker: full `AiRun` lifecycle (queued→running→succeeded/failed), token/cost/latency recording, requirement persistence with stable keys + ambiguity scores, run events via Redis pubsub; deterministic mock client when no `OPENAI_API_KEY`. API: briefs, async generate (`{runId, specId}`), SSE stream, spec/requirement CRUD, publish version (content-hashed snapshot), structural version diff, suggestions accept/reject. Policy denials now map to 403; new subjects Brief/Suggestion. Remaining for P1 exit: three-pane spec workspace UI, forced-bad-output integration test against a live DB.

---



### P2 · Week 4 — Stories, criteria, traceability

- Domain: `Story`, `AcceptanceCriterion`, `Estimate`; invariant `story.requirementId` required; `coverage(spec) = requirements with ≥1 story / total`.
- Prompts: `stories.fromRequirements@v1` (batched by module to control context), `criteria.gherkin@v1`, `story.split@v1`, `story.estimate@v1` (points + confidence + basis text).
- Endpoints: `POST /specs/:id/stories/generate`, `PATCH /stories/:id`, `POST /stories/:id/split`, `POST /stories/bulk` (label/priority/milestone), `GET /specs/:id/coverage`.
- UI: backlog board (grouped by module/priority/MoSCoW), story drawer with criteria editor, **traceability rail** — click a requirement, highlight its stories; click a story, jump to its requirement. Coverage meter in the header with uncovered requirements listed one click away.

**Exit criteria:** every story traces to a requirement, coverage metric is live, splitting a story preserves traceability, criteria are testable (validated by the eval scorer).

---



### P3 · Week 5 — Delivery plan (the agency backbone)

**Deterministic scheduler — pure domain, no LLM**

```ts
schedule(input: {
  stories: Story[];               // points + dependencies
  team: { role: string; count: number; allocationPct: number }[];
  velocityPointsPerWeek: number;  // derived or configured
  calendar: { startDate: string; holidays: string[]; workDays: number[] };
  phasePolicy: 'discovery-first' | 'vertical-slices' | 'custom';
  buffers: { riskPct: number; qaPct: number };
}): DeliveryPlan   // phases → milestones → deliverables, with dates + critical path
```

Properties tested: monotonic dates, dependency respect, buffer application, idempotent re-run, deterministic output for identical input, correct recompute on scope toggle.

- Rate cards: role → hourly/daily rate, currency; cost per phase derived from allocation × duration; optional ranges (±15%).
- Release plan: feature-release table per phase with demo dates and "what the client can click".
- Charts: scope by module (donut), effort by role (stacked bar), cumulative value burn-up, team allocation heatmap.
- UI: custom SVG Gantt (d3-scale) — drag milestone to reshift, dependency arrows, demo markers, critical path highlight, risk badges.
- Endpoints: `POST /projects/:id/plan/generate`, `PATCH /plan/:id` (team/velocity/buffers), `POST /plan/:id/simulate` (what-if without persisting), `GET /plan/:id/costs`.

**Exit criteria:** toggling a module out recomputes dates and cost in <150 ms client-side round trip via `simulate`, and the Gantt animates to the new state.

---



### P4 · Week 6 — Diagrams and technical design

- `API_ENDPOINT`, `ENTITY`, `FIELD` nodes; prompts `api.design@v1`, `data.model@v1` (both emit OpenAPI-shaped and DDL-shaped structured output).
- Exports: `openapi.yaml`, SQL migration stubs, TypeScript/Python types, Markdown bundle, `.zip`.
- Diagram pipeline: spec subgraph → Mermaid source → server-side SVG render → cached by version hash. Types: user journey, system context, sequence per key flow, ERD, phase map.
- React Flow canvas for the editable user-flow diagram, nodes bound to requirement/story ids — editing the diagram edits the graph (this bidirectional binding is a strong differentiator; keep the mapping explicit and tested).
- Audience toggle: engineer diagrams vs client diagrams from the same source.

**Exit criteria:** generated OpenAPI validates against the spec linter; every diagram renders identically in app, PDF and share link.

---



### P5 · Week 7 — Deal Room (the feature that sells)

- `DealRoom`, `ShareLink`, `Comment`, `Approval`, `ViewEvent` models.
- Client-facing route `/d/:slug` — no session, capability-token auth, optional password, expiry, revocation.
- Sections (all toggleable, reorderable): cover · understanding & goals · approach · scope in/out · phased timeline · release plan · charts · user journey · team · commercials & payment milestones · assumptions & risks · next steps + CTA.
- Live scope toggles for the client with instant time/cost recompute (calls `simulate`, never mutates).
- White-label theming: logo, accent, font pair, cover image — a JSON token object; the same tokens drive PDF.
- PDF export: headless Chromium print of the Deal Room route through a dedicated worker; page-break-aware CSS; embedded SVG diagrams.
- View analytics: opens, unique viewers, time per section, scroll depth → owner dashboard + Slack ping.
- Comments and an explicit **Approve scope** action that snapshots the approved version (this becomes the change-order baseline).

**Exit criteria:** a share link opens on mobile in under 1.5 s, prints to a clean PDF, records analytics, and an approval freezes an immutable version reference.

---



### P6 · Week 8 — Integrations

**Ports first:** `TrackerPort`, `NotifierPort`, plus an `IntegrationCredential` store with KMS-backed envelope encryption and an outbox table.

**Linear**

- OAuth2 install per workspace; token refresh; scope-minimal.
- Mapping UI: Project → Linear team/project, Phase → cycle/milestone, labels, estimate scale.
- `POST /projects/:id/push/linear` → batched `issueCreate` via GraphQL, concurrency cap, per-story idempotency key, per-row result table in UI.
- Inbound webhooks → `Story.externalStatus` → plan-vs-actual on the Gantt.

**Trello**

- Key + user token obtained through the `1/authorize` route or OAuth 1.0 with explicit scope and expiration ([Trello authorization](https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/)); cards created via the [Cards API](https://developer.atlassian.com/cloud/trello/rest/api-group-cards/) with checklists from acceptance criteria and due dates from milestones.
- Token-bucket throttling per key, resumable batches.

**Slack**

- Slack app, bot token, `chat.postMessage` with Block Kit for threaded and updatable messages, which incoming webhooks cannot do ([Slack messaging docs](https://docs.slack.dev/messaging/)).
- Event routing table: spec published, version diff, critical findings, Deal Room opened, milestone at risk, daily/weekly digest — each mappable to a channel per workspace.
- Interactive actions: Approve spec, Accept suggestion, Push to Linear (signature verified, 3s ack, async execute).
- `NotifierPort` second implementation: email (Resend) + in-app, so the pluggable claim is proven, not asserted.

**Reliability tests:** forced 500s, forced rate limits, duplicate job replay (must not double-create), outbox replay after simulated Slack outage, dead-letter replay from admin UI.

**Exit criteria:** 40 stories pushed to Linear in one click with a visible per-story result; re-running the push creates zero duplicates; Slack digest posts on schedule.

---



### P7 · Week 9 — Review packs, metrics, evaluation

- Review pack framework: `ReviewRun` + `Finding{severity, category, requirementRef, rationale, suggestedPatch}`; findings accepted as patches through the same Suggestion path.
- Packs shipped: ambiguity, security, scalability, observability, delivery risk.
- Insights dashboard: coverage %, ambiguity trend per version, unestimated stories, milestones without demoable output, idea→approved lead time, proposal→win rate, AI cost per spec, suggestion accept rate.
- `packages/eval`: 40 golden briefs across domains; scorers for schema validity, requirement coverage, hallucinated-scope detection, criteria testability, estimate sanity. Runs in CI on any change under `packages/prompts` and writes a scorecard to the PR.
- Cost controls: per-org budgets, 80% warn, hard stop, graceful cancel.

**Exit criteria:** prompt regressions are caught by CI before merge; every dashboard number is derived from the graph, not hardcoded.

---



### P8 · Week 10 — Hardening, deploy, launch assets

- Load test with k6: 50 concurrent Deal Room viewers, 20 concurrent generations; verify p95 targets and queue autoscale behaviour.
- Security pass: RLS negative tests, authZ matrix test per role × resource, share-link fuzzing, prompt-injection fixtures on uploaded documents, dependency and secret scanning, redaction verification in logs.
- Backups + restore drill (documented, timed), migration rollback rehearsal.
- Terraform deploy: API + worker containers, managed Postgres + Redis, S3, secrets manager, OTel collector, Grafana dashboards, uptime checks.
- Docs and launch: README product narrative, `ARCHITECTURE.md`, 10 ADRs, `docs/openapi.yaml`, seeded demo workspace with two realistic projects, 3-minute Loom, plus a short "how I'd scale this 100x" write-up.

**Exit criteria:** a stranger clones the repo, runs `make dev`, and reaches the full demo in under 10 minutes; the deployed instance survives the load test.

---



## 3. Data model (Prisma sketch, v1)

```prisma
model Org          { id String @id @default(cuid()) name String plan String @default("free") createdAt DateTime @default(now()) }
model User         { id String @id @default(cuid()) email String @unique name String? image String? }
model Membership   { id String @id @default(cuid()) orgId String userId String role Role @@unique([orgId, userId]) }
model Workspace    { id String @id @default(cuid()) orgId String name String themeTokens Json? }
model Project      { id String @id @default(cuid()) orgId String workspaceId String name String clientName String? status ProjectStatus }

model Brief        { id String @id @default(cuid()) orgId String projectId String kind BriefKind raw String storageKey String? }
model SourceChunk  { id String @id @default(cuid()) orgId String briefId String idx Int text String embedding Unsupported("vector(1536)")? }

model Spec         { id String @id @default(cuid()) orgId String projectId String title String status SpecStatus currentVersion Int @default(0) }
model SpecVersion  { id String @id @default(cuid()) orgId String specId String version Int hash String snapshot Json summary String? createdBy String createdAt DateTime @default(now()) @@unique([specId, version]) }
model Requirement  { id String @id @default(cuid()) orgId String specId String key String kind ReqKind title String body String priority Moscow ambiguityScore Float @default(0) openQuestions Json sourceRefs Json order Int @@unique([specId, key]) }

model Story        { id String @id @default(cuid()) orgId String specId String requirementId String asA String iWant String soThat String points Int? confidence String? labels String[] milestoneId String? }
model Criterion    { id String @id @default(cuid()) orgId String storyId String given String when String then String order Int }
model ExternalRef  { id String @id @default(cuid()) orgId String storyId String provider String externalId String url String status String? syncedAt DateTime @@unique([provider, externalId]) }

model ApiEndpoint  { id String @id @default(cuid()) orgId String specId String method String path String summary String reqSchema Json resSchema Json auth String errors Json }
model Entity       { id String @id @default(cuid()) orgId String specId String name String fields Json relations Json indexes Json }
model Diagram      { id String @id @default(cuid()) orgId String specId String kind DiagramKind source String svgKey String? audience Audience }

model DeliveryPlan { id String @id @default(cuid()) orgId String projectId String inputs Json computed Json version Int }
model Phase        { id String @id @default(cuid()) orgId String planId String name String startDate DateTime endDate DateTime order Int }
model Milestone    { id String @id @default(cuid()) orgId String phaseId String name String startDate DateTime endDate DateTime clientVisible Boolean @default(true) demoNote String? deliverables Json }

model DealRoom     { id String @id @default(cuid()) orgId String projectId String slug String @unique sections Json theme Json status String }
model ShareLink    { id String @id @default(cuid()) orgId String dealRoomId String token String @unique passwordHash String? expiresAt DateTime? revokedAt DateTime? }
model ViewEvent    { id String @id @default(cuid()) orgId String shareLinkId String section String? dwellMs Int? ip String? ua String? at DateTime @default(now()) }
model Comment      { id String @id @default(cuid()) orgId String targetType String targetId String authorType String authorRef String body String resolvedAt DateTime? }

model ReviewRun    { id String @id @default(cuid()) orgId String specId String pack String status String startedAt DateTime finishedAt DateTime? }
model Finding      { id String @id @default(cuid()) orgId String reviewRunId String severity String category String requirementId String? rationale String suggestedPatch Json state String }

model Suggestion   { id String @id @default(cuid()) orgId String specId String target String payload Json state SuggestionState aiRunId String feedback String? }
model AiRun         { id String @id @default(cuid()) orgId String kind String template String model String status String promptTokens Int? completionTokens Int? costUsd Decimal? latencyMs Int? error String? }
model Integration  { id String @id @default(cuid()) orgId String provider String config Json encCredentials Bytes status String @@unique([orgId, provider]) }
model Outbox       { id String @id @default(cuid()) orgId String topic String payload Json attempts Int @default(0) nextAttemptAt DateTime deliveredAt DateTime? lastError String? }
model AuditLog     { id String @id @default(cuid()) orgId String actorId String? action String resourceType String resourceId String beforeHash String? afterHash String? ip String? ua String? at DateTime @default(now()) }
```

All tenant tables get `@@index([orgId])` plus an RLS policy `USING (org_id = current_setting('app.org_id')::text)`.

---



## 4. Sidebar → feature → phase traceability


| Sidebar item                          | Phase           | Notes                                          |
| ------------------------------------- | --------------- | ---------------------------------------------- |
| Home / Activity                       | P0, enriched P7 | audit + AI run feed                            |
| Insights                              | P7              | coverage, ambiguity, lead time, cost, win rate |
| Intake / Briefs                       | P1              | text, file, transcript, voice (voice in P9)    |
| Specs (versions, diffs, review packs) | P1, P7          | three-pane workspace                           |
| Stories & backlog                     | P2              | traceability rail, coverage meter              |
| API & data model                      | P4              | OpenAPI + DDL export                           |
| Diagrams                              | P4              | Mermaid + React Flow, audience toggle          |
| Delivery plan                         | P3              | Gantt, critical path, simulate                 |
| Releases                              | P3              | feature-release table, demo dates              |
| Estimates & rate cards                | P3              | role rates, phase costs, ranges                |
| Deal Rooms                            | P5              | branded client view                            |
| Share links & views                   | P5              | analytics, revocation                          |
| Comments & approvals                  | P5              | scope approval snapshot                        |
| Integrations                          | P6              | Linear, Trello, Slack (+ Jira/GitHub in P9)    |
| Notifications & digests               | P6              | event → channel routing                        |
| Templates & prompt packs              | P7              | industry spec templates                        |
| Members & roles                       | P0              | RBAC + invites                                 |
| Audit log                             | P0              | append-only                                    |
| Usage & billing                       | P7/P9           | quotas now, Stripe later                       |
| Settings                              | P0              | theme, model policy, data residency toggle     |


---



## 5. Testing strategy


| Layer                                         | Tooling                                                              | Coverage target                    |
| --------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------- |
| Domain (diff, scheduler, coverage, estimator) | Vitest + fast-check property tests                                   | 95%                                |
| Use-cases                                     | Vitest + in-memory ports                                             | 85%                                |
| API integration                               | Supertest + Testcontainers Postgres/Redis                            | key flows                          |
| Tenancy/authZ                                 | dedicated negative-test suite (role × resource × org matrix)         | 100% of matrix                     |
| Integrations                                  | recorded fixtures + fault injection (500s, 429s, duplicates)         | all adapters                       |
| AI quality                                    | `packages/eval` golden set + scorers in CI                           | scorecard per PR                   |
| E2E                                           | Playwright: brief → spec → stories → plan → Deal Room → push → Slack | the demo path, run nightly         |
| Visual                                        | Playwright screenshots on Deal Room + Gantt, both themes             | no unreviewed diffs                |
| Load                                          | k6                                                                   | p95 read <200 ms, Deal Room <1.5 s |


---



## 6. CI/CD

```
PR:      lint → typecheck → arch-boundary lint → unit → integration (Testcontainers)
         → eval (if prompts/ or schemas/ changed) → e2e smoke → preview deploy
main:    migrate (expand-only) → deploy api+worker → run E2E against staging → promote
release: tag, changelog, Grafana annotation
```

Guardrails: expand/contract migrations only (never a destructive migration in the same release as the code change), feature flags for Deal Room and each integration, automatic rollback on error-rate SLO breach.

---



## 7. Risk register


| Risk                                             | Impact                       | Mitigation                                                                                                                                |
| ------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Scope creep — the plan itself is huge            | Never ships                  | The demo path is the scope; P5 is the value peak. P6–P8 are the credibility layer. Nothing else ships before week 10                      |
| AI output quality feels shallow                  | Product looks like a wrapper | Golden-set eval from week 2, checklist-driven prompts, `sourceRefs` shown in UI, review packs as the visible intelligence                 |
| Timeline generated by LLM looks arbitrary        | Kills client trust           | Deterministic scheduler; the model only proposes effort points, with a visible basis string per estimate                                  |
| Integration auth complexity (OAuth per provider) | Week 8 overruns              | Build the port + Trello (simplest token flow) first, then Linear OAuth, then Slack; each behind a flag                                    |
| LLM cost surprises                               | Unsustainable demo           | Tiered routing, prompt caching, per-org budgets, cost surfaced in the UI from week 2                                                      |
| Solo bandwidth                                   | Slip                         | Weekly exit criteria; if a week slips, cut breadth (fewer diagram types, fewer chart types) never depth (traceability, versioning, tests) |
| Prompt injection via uploaded RFPs               | Data exfiltration            | Documents are data-delimited, never instruction-bearing; injection fixtures in the security suite                                         |


---



## 8. Expansion roadmap (post-v1)


| Wave                             | Scope                                                                                                                                 | Why it matters commercially                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **W1 — Collaboration**           | Threaded comments, reviewer assignment, Draft→Review→Approved workflow, presence, notification prefs                                  | Turns a single-player tool into a team purchase |
| **W2 — More execution surfaces** | Jira, GitHub Issues + Projects, Asana, ClickUp, Notion export, MS Teams/Discord notifiers                                             | Removes the "we don't use Linear" objection     |
| **W3 — Plan vs actual**          | Ingest tracker status → actual velocity, slip detection, auto client status updates, change-order generator from approved-scope diffs | Agencies pay for this; it protects their margin |
| **W4 — Templates & marketplace** | Industry spec templates (fintech, health, marketplace, internal tools), review packs as installable packs, ADR generator              | Distribution and stickiness                     |
| **W5 — Intelligence**            | Estimate calibration from historical actuals, ambiguity model tuned on accepted/rejected suggestions, win/loss analytics on proposals | Compounding data moat — the reason to stay      |
| **W6 — Platform**                | Public API + webhooks, SDK, embeddable Deal Room, SSO/SCIM, audit export, per-region data residency                                   | Enterprise tier                                 |
| **W7 — Deep IDE loop**           | VS Code extension: spec beside code, story→branch/PR linkage, drift detection when code diverges from the approved spec               | Closes the loop spec→code→verification          |
| **W8 — Monetisation**            | Stripe billing, seat + usage pricing, trial, BYO-API-key tier, agency white-label plan                                                | The subscription business you wanted            |


---



## 9. What to put in the portfolio write-up

Lead with the *decisions*, not the feature list:

1. **The insight** — proposals and specs are the same artifact rendered for two audiences; drift between what was sold and what gets built is where agencies lose money.
2. **The correctness stance** — AI proposes, schemas validate, humans accept, the graph records. Show the forced-bad-output test.
3. **The determinism boundary** — why dates and costs are computed, not generated, and how scope toggles recompute live.
4. **The isolation proof** — RLS + policy service + the negative-test matrix.
5. **The reliability proof** — idempotency keys, outbox, dead-letter replay; show the duplicate-push test passing.
6. **The measurement** — eval scorecards over time, suggestion accept rate, cost per spec trending down.
7. **The scaling story** — the 10x/100x narrative from `ARCHITECTURE.md` §15, with the specific trigger conditions that would move you to Temporal or a dedicated vector store.

Attach: architecture diagram, ADR index, OpenAPI, a Grafana screenshot, the eval scorecard, and the 3-minute demo video.