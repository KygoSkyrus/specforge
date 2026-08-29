Run guide
1. Start Docker Desktop (must be running before step 3).

2. Env files (already created for you):

apps/api/.env — Postgres/Redis URLs, port 3001
apps/worker/.env — same DB + Redis; add OPENAI_API_KEY=sk-... here for real LLM calls (without it, a deterministic mock is used and everything still works)
3. Infra + install:

docker compose -f infra/docker/docker-compose.yml up -d   # Postgres 16+pgvector :5432, Redis :6379
pnpm install
4. Prisma client + migrations:

pnpm db:generate    # generates clients for api AND worker
pnpm db:migrate     # creates tables + RLS policies
5. Run everything:

pnpm dev            # web → localhost:3000, api → :3001, worker consumes ai-generation queue
6. Use it: open http://localhost:3000 → enter any email (dev-login auto-creates org) → dashboard. To exercise the new P1 pipeline, use the curl sequence in README.md (dev-login → create project → POST .../specs/generate with a brief → stream GET /runs/:id/stream → fetch the spec with generated keyed requirements).

Troubleshooting: if pnpm dev was previously failing, packages were rebuilt already — but run pnpm install once more if turbo serves a stale cache (pnpm build --force clears it).