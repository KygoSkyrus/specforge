# SpecForge ADRs (Architecture Decision Records)

---

## ADR-001: TypeScript end-to-end with Zod validation

**Date:** 2026-08-29  
**Status:** Accepted  
**Deciders:** Dheeraj Gupta  

### Context
SpecForge must handle complex domain objects (Spec, Requirement, Story) and ensure type safety across API boundaries, database, and UI. Manual DTO duplication causes bugs.

### Decision
Use TypeScript everywhere. Generate Zod schemas from single source, derive OpenAPI types, and codegen frontend clients.

```typescript
// packages/schemas/src/spec.ts
export const CreateSpecSchema = z.object({
  title: z.string().min(3).max(200),
  projectId: z.string().cuid(),
  tags: z.array(z.string()).optional(),
})

export type CreateSpec = z.infer<typeof CreateSpecSchema>

// API automatically validates with ZodValidationPipe
@Post()
@UsePipes(new ZodValidationPipe(CreateSpecSchema))
async create(@Body() dto: CreateSpec) { }

// OpenAPI type derived from schema
// Frontend client auto-generated with @openapi-generator
```

### Rationale
1. Single source of truth prevents schema drift
2. Type safety guaranteed at compile time
3. OpenAPI docs auto-generated = always in sync
4. Zod repair loop handles malformed LLM output gracefully
5. End-to-end refactoring safe (IDE can rename across layers)

### Consequences
- Initial setup cost (schema generation tooling)
- Guaranteed runtime safety (if types are correct)
- Easy onboarding for new developers
- Fast iteration (no manual synchronization)

---

## ADR-002: Row-level security via `SET LOCAL app.org_id`

**Date:** 2026-08-29  
**Status:** Accepted  
**Deciders:** Dheeraj Gupta  

### Context
SpecForge is multi-tenant SaaS. Database-level isolation is stronger than application-level checks.

### Decision
Every request sets session-local `app.org_id` variable in Postgres RLS policies. Application has no way to access cross-org data even if auth middleware fails.

```typescript
// Request interceptor (NestJS middleware)
@Injectable()
export class OrgIsolationMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const orgId = req.user.orgId
    
    // Execute RLS policy set before every query
    await this.prisma.$executeRawUnsafe(
      `SELECT set_config('app.org_id', $1, true)`,
      [orgId]
    )
    
    next()
  }
}

// Prisma schema enfor ces at query time
model Spec {
  @@row_level_security
  // RLS policy: enable select on specs for authenticated users to rows where org_id = current_setting('app.org_id')
}
```

### Rationale
1. **Defense in depth:** Auth bugs don't leak data
2. **Postgres enforces:** No code path can bypass
3. **Auditable:** RLS violations logged at DB level
4. **Simple:** Single variable per request

### Consequences
- Requires PostgreSQL 10+
- Slightly higher query latency (policy evaluation)
- RLS rules must be tested with negative cases (separate test for `org2_user` reading `org1_spec` → must fail)

---

## ADR-003: Domain-driven entities + stateless services

**Date:** 2026-08-29  
**Status:** Accepted  
**Deciders:** Dheeraj Gupta  

### Context
SpecForge has rich domain logic (diff, ambiguity scoring, scheduler). Service layer often becomes bloated god-object.

### Decision
Keep domain logic in pure functions in `packages/domain`. Services are thin orchestrators calling domain functions.

```typescript
// packages/domain/src/spec.ts
export function publishVersion(spec: Spec, algo: 'sha256'): SpecVersion {
  const snapshot = deepFreeze(spec)
  const hash = hashContent(snapshot, algo)
  return { ...spec, version: spec.version + 1, hash, snapshot }
}

// apps/api/src/modules/specs/specs.service.ts
export class SpecsService {
  async publishVersion(specId: string): Promise<SpecVersion> {
    const spec = await this.prisma.spec.findUnique({ where: { id: specId } })
    const version = publishVersion(spec, 'sha256')  // Pure domain function
    await this.prisma.specVersion.create({ data: version })
    return version
  }
}
```

### Rationale
1. **Testability:** Domain functions need zero mocks
2. **Reusability:** CLI, API, worker all call same domain logic
3. **Performance:** Pure functions cache well
4. **Clarity:** Business logic separated from infra

### Consequences
- Requires discipline (no `this.repo` calls inside domain functions)
- Larger test suite initially
- Clear boundaries make team onboarding easier

---

## ADR-004: Lazy evaluation for AI generation, deterministic replay for specs

**Date:** 2026-08-29  
**Status:** Accepted  
**Deciders:** Dheeraj Gupta  

### Context
Spec generation is expensive (LLM cost) and non-deterministic. Users want to regenerate with different parameters. Audit trail requires reproducibility.

### Decision
- Store input (brief, template version, model, seed) in AiRun.
- Replay generation for audits without re-charging.
- Use `seed` parameter in LLM for reproducibility.

```typescript
// NestJS controller
@Post('specs/:id/generate')
async generateSpec(@Param('id') specId: string, @Body() dto: GenerateDto) {
  const aiRun = await this.prisma.aiRun.create({
    data: {
      kind: 'spec.fromBrief',
      template: 'spec.fromBrief@v1',
      model: 'gpt-4o',
      seed: hash(dto.seed || 'default'),  // For reproducibility
      status: 'queued',
    }
  })
  
  // Queue job (async)
  await this.queue.add('generate-spec', { aiRunId: aiRun.id, brief: dto.brief })
  
  return { runId: aiRun.id, specId }
}

// Worker
async function generateSpec(aiRunId: string) {
  const aiRun = await db.aiRun.findUnique({ where: { id: aiRunId } })
  
  // Replay uses cached result if exists
  const cached = await promptCache.get(aiRun.template, aiRun.model, aiRun.seed)
  if (cached) return cached
  
  // Generate new
  const result = await llm.generate({
    model: aiRun.model,
    template: aiRun.template,
    seed: aiRun.seed,
  })
  
  await promptCache.set(hash(aiRun), result, ttl='1year')
  return result
}
```

### Rationale
1. Cost control: User can retry generation without re-charge if satisfied with brief
2. Auditability: Exact input/output stored forever
3. Reproducibility: Same seed + template → same output
4. Transparency: Users see full lineage (which brief → which spec version)

### Consequences
- Must version templates (breaking change = new version)
- Must test seed parameter with LLM (not all support it)
- Prompt cache keyed by `sha256(template + brief + model + seed)` → storage cost

---

## ADR-005: BullMQ for background jobs (not Agenda, not Bull)

**Date:** 2026-08-29  
**Status:** Accepted  
**Deciders:** Dheeraj Gupta  

### Context
SpecForge has long-running tasks (AI generation, integration pushes, review packs). Need reliable, distributed job queue.

### Decision
Use BullMQ (maintained, TypeScript, Redis-backed, built-in priority/delays/repeating).

```typescript
// apps/worker/src/main.ts
import { Queue, Worker } from 'bullmq'

const connection = { host: 'redis', port: 6379 }

// Producer (API)
const generateQueue = new Queue('generate-spec', { connection })
await generateQueue.add('spec', { briefId, model }, { 
  priority: 1, 
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 }
})

// Consumer (Worker)
const worker = new Worker('generate-spec', async (job) => {
  const result = await generateSpec(job.data)
  return result
}, { connection, concurrency: 5 })

worker.on('completed', (job) => console.log(`Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`Job ${job.id} failed: ${err.message}`))
```

### Rationale
1. **Type-safe:** Full TypeScript support
2. **Distributed:** Horizontal scaling (multiple workers)
3. **Prioritization:** Critical tasks (AI gen failures) retry before low-priority (analytics)
4. **Observability:** Built-in job inspection, metrics
5. **Graceful shutdown:** `SIGTERM` waits for in-flight jobs

### Consequences
- Redis dependency (already required for cache, sessions)
- Job persistence only until TTL (set appropriately for compliance)
- No built-in workflow (job A → job B); hand-code via job callbacks

---

## ADR-006: Zod validation + AI repair loop for LLM outputs

**Date:** 2026-08-29  
**Status:** Accepted  
**Deciders:** Dheeraj Gupta  

### Context
LLM outputs are sometimes malformed JSON. Spec generation can fail silently if not handled.

### Decision
Wrap LLM calls with Zod validation + automated repair loop (≤2 retries).

```typescript
// packages/prompts/src/gateway.ts
export async function runStructured<T>(
  template: PromptTemplate,
  context: Record<string, any>,
  schema: z.Schema<T>,
  maxRetries: number = 2,
): Promise<T> {
  const model = selectModel(template)
  let lastError: z.ZodError | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await llm.generateJson(template, context, model)
      return schema.parse(response) // Zod validation
    } catch (e) {
      if (!(e instanceof z.ZodError)) throw e
      lastError = e
      
      if (attempt < maxRetries) {
        // Repair attempt
        context.previousError = e.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
        context.previousJson = response
        // Retry with error feedback in prompt
      }
    }
  }
  
  throw new StructuredGenerationError(lastError, `Failed after ${maxRetries} retries`)
}
```

### Rationale
1. **Resilience:** Transient errors don't break spec generation
2. **Transparency:** Error messages fed back to LLM for self-correction
3. **Auditability:** Each retry logged with error details
4. **Cost control:** Limited retries prevent runaway costs

### Consequences
- 2x latency for failed attempts (3-5 seconds added)
- Retry prompt increases token usage (~5% of total)
- May still fail for fundamentally wrong instructions; requires prompt refinement

---

## ADR-007: React Query (TanStack Query) + Zustand, not Redux

**Date:** 2026-08-29  
**Status:** Accepted  
**Deciders:** Dheeraj Gupta  

### Context
Frontend state management is split: server state (specs, users) vs client state (UI modals, filters). Redux conflates both.

### Decision
- **React Query:** Server state (fetch, cache, sync)
- **Zustand:** Client state (UI, filters, preferences)
- **No Redux:** Too much boilerplate, not worth it at this scale

```typescript
// apps/web/src/hooks/useSpec.ts
export function useSpec(specId: string) {
  return useQuery({
    queryKey: ['specs', specId],
    queryFn: () => api.specs.get(specId),
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 10 * 60 * 1000,     // 10 minutes
  })
}

// apps/web/src/stores/ui.ts
export const useUiStore = create((set) => ({
  isSpecModalOpen: false,
  selectedModule: null,
  toggleSpecModal: () => set((s) => ({ isSpecModalOpen: !s.isSpecModalOpen })),
  setSelectedModule: (id) => set({ selectedModule: id }),
}))
```

### Rationale
1. **Separation of concerns:** Server vs client state explicit
2. **Less boilerplate:** Zustand ~100 LOC vs Redux ~500 LOC
3. **Better performance:** React Query handles caching intelligently
4. **Easier testing:** Hook-based, no provider wrapper complexity

### Consequences
- Team must discipline between useQuery (server) vs useUiStore (client)
- React Query subscription-based; unsubscribe on unmount (automatic)
- No time-travel debugging (Redux DevTools advantage)

---

## ADR-008: Flyway for database migrations (not Prisma migrate alone)

**Date:** 2026-08-29  
**Status:** Deferred (use Prisma migrate for now, consider Flyway for > 100 migrations)  

### Context
Prisma migrate is simple but doesn't support all migration patterns. At scale (100+ migrations), Git history becomes unwieldy.

### Decision (Deferred to P9)
Eventually: Use Flyway for complex schema changes, but trigger via Prisma hooks.

For now: Prisma migrate with strict naming convention and one file per week.

```
prisma/migrations/
├── 20250829120000_init/
├── 20250905120000_add_stories/
├── 20250912120000_add_integrations/
```

### Rationale
- Prisma sufficient for current schema complexity
- Migrate to Flyway only if hitting limitations (native functions, stored procedures)
- Timing: Revisit at 100+ migrations or multi-DB support

---

## ADR-009: Observability via OpenTelemetry + Tempo + Prometheus + Grafana

**Date:** 2026-08-29  
**Status:** Planned (P8)  

### Context
Current state: Pino logging only. Can't see end-to-end request flow or performance bottlenecks.

### Decision (P8 Phase)
Implement full observability stack:
- **OpenTelemetry:** Tracing (Tempo backend)
- **Prometheus:** Metrics (Grafana dashboard)
- **Loki:** Log aggregation (optional, nice-to-have)
- **Alerts:** Prometheus alertmanager

```typescript
// Tracing decorator
@Span('spec.publishVersion')
async publishVersion(specId: string) {
  const spec = await this.getSpec(specId)
  const version = publishVersion(spec, 'sha256')
  await this.save(version)
  return version
}

// Metrics
const specCreateCounter = new Counter({
  name: 'specs_created_total',
  help: 'Total specs created',
  labelNames: ['org_id', 'template'],
})

const specCreateDuration = new Histogram({
  name: 'spec_create_duration_seconds',
  help: 'Spec creation latency',
  labelNames: ['org_id', 'model'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
})
```

### Consequences
- Additional services to run (Tempo, Prometheus, Grafana) = ~500MB extra memory
- Team training required (trace sampling, metric naming)
- Long-term: Better debugging and performance optimization

---

## ADR-010: Prisma as ORM, not raw SQL

**Date:** 2026-08-29  
**Status:** Accepted with caveat  

### Context
Prisma generates query types at compile time. Raw SQL bypasses type safety.

### Decision
Prefer Prisma for 95% of queries. Allow raw SQL only for:
- Complex analytics queries (with pre-reviewed SQL files)
- Performance-critical queries (with load testing proof)
- Must be wrapped in PrismaService extension for audit logging

### Rationale
1. Type safety by default
2. Injection prevention (Prisma parameterizes)
3. Easy to find schema changes (rename field → compile error)

### Consequences
- Prisma doesn't support all Postgres features (window functions, CTEs—use extensions)
- Query performance may lag hand-optimized SQL (profile before optimizing)
- Learning curve for Prisma query patterns

