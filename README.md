# SpecForge

Turn a rough idea or client conversation into a structured, versioned, reviewable delivery artifact set — spec → user stories → API/data model → visual delivery plan → tickets → notifications.

**One engine, two audiences:** Internal mode (PM / tech lead) and Deal Room mode (agency pre-sales).

## Quick start

```bash
# Prerequisites: Node 20+, pnpm 9+, Docker Desktop running

cp apps/api/.env.example apps/api/.env
docker compose -f infra/docker/docker-compose.yml up -d   # Postgres 16 + pgvector, Redis
pnpm install
pnpm db:generate   # generate Prisma clients (api + worker)
pnpm db:migrate    # apply migrations (creates RLS policies)
pnpm dev           # web :3000, api :3001, worker (ai-generation queue)
```

Open [http://localhost:3000](http://localhost:3000), enter an email to dev-login (creates org on first login).

**LLM:** without `OPENAI_API_KEY` set in `apps/worker/.env`, the worker uses a deterministic mock so the whole pipeline works offline. Set the key for real model calls (`OPENAI_BASE_URL` optional for compatible gateways).

### Try the spec pipeline (API)

```bash
# 1. Login → copy orgId/userId/role from response
curl -X POST http://localhost:3001/api/v1/auth/dev-login -H "content-type: application/json" -d '{"email":"demo@specforge.dev"}'

# 2. Create a project (use x-org-id / x-user-id / x-user-role headers from step 1)
curl -X POST http://localhost:3001/api/v1/projects -H "x-org-id: <orgId>" -H "x-user-id: <userId>" -H "x-user-role: owner" -H "content-type: application/json" -d '{"workspaceId":"<workspaceId>","name":"Acme App"}'

# 3. Generate a spec from a brief (async)
curl -X POST http://localhost:3001/api/v1/projects/<projectId>/specs/generate -H "x-org-id: ..." -H "x-user-id: ..." -H "x-user-role: owner" -H "content-type: application/json" -d '{"raw":"A booking app for yoga studios..."}'
# → { "runId": "...", "specId": "..." }

# 4. Stream progress (SSE), then fetch the result
curl -N http://localhost:3001/api/v1/runs/<runId>/stream -H "x-org-id: ..." -H "x-user-id: ..." -H "x-user-role: owner"
curl http://localhost:3001/api/v1/specs/<specId> -H "x-org-id: ..." -H "x-user-id: ..." -H "x-user-role: owner"
```

## Architecture

See [docs/SpecForge — Architecture.md](docs/SpecForge%20%E2%80%94%20Architecture.md) and [docs/SpecForge — Implementation Plan.md](docs/SpecForge%20%E2%80%94%20Implementation%20Plan.md).

```
specforge/
├── apps/
│   ├── web/       # Next.js 15 dashboard + Deal Room
│   ├── api/       # NestJS API (clean architecture)
│   └── worker/    # BullMQ workers
├── packages/
│   ├── domain/    # Pure TS: diff, scheduler, invariants
│   ├── schemas/   # Zod schemas → types + LLM validation
│   ├── ui/        # Blueprint Noir design system
│   ├── prompts/   # Versioned prompt templates
│   ├── integrations/  # Tracker + Notifier ports
│   └── eval/      # Golden set + scorers
└── infra/docker/  # docker-compose (Postgres, Redis)
```

## Core principles

1. **AI proposes, humans accept** — model output → Zod validation → Suggestion → explicit accept/reject
2. **Traceability is mandatory** — every Story links to a Requirement
3. **Deterministic scheduling** — dates and costs are computed, not generated
4. **Tenant isolation** — Postgres RLS with `SET LOCAL app.org_id`

## Development

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in watch mode |
| `pnpm build` | Build all packages and apps |
| `pnpm test` | Run unit tests |
| `pnpm typecheck` | TypeScript check all packages |

## License

Private — Dheeraj Gupta
