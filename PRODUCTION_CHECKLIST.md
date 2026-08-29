# SpecForge — Production Readiness Checklist

**Date:** 2026-08-29  
**Status:** Comprehensive Gap Analysis + Implementation Plan  
**Target:** Production-Grade v1.0

---

## Executive Summary

Current state: P0 partially complete, P1 backend ~60% complete, P1-P8 frontend + integrations **not started**.

**Critical gaps to production:**
1. **Database Schema** — Missing 40%+ of models (Story, Milestone, DealRoom, Integrations)
2. **UI/UX System** — Basic shell only; needs professional design matching reference (dark theme, charts, analytics)
3. **API Endpoints** — Core CRUD exists; missing pagination, filtering, validation, error handling
4. **Security** — Auth basic; missing input validation, rate limiting, CORS hardening, secret rotation
5. **Observability** — Pino logging only; missing OpenTelemetry, distributed tracing, metrics, alerting
6. **Deployment** — No production Docker, no K8s manifests, no IaC, no CI/CD pipeline
7. **Testing** — Missing integration tests, E2E tests, load testing, security scanning
8. **Documentation** — No ADRs, no API docs, no runbooks, no security audit trail

---

## Priority 1: Foundation (Production Baseline)

### 1.1 Database Schema Completion ⚠️ CRITICAL

**Missing models needed for P2-P8:**

```
Story {
  id, specId, requirementId, title, description, estimates[],
  moscow, module, dependencies[], acceptance_criteria, order
}

AcceptanceCriterion {
  id, storyId, type (gherkin|checklist), body, testable_score
}

Estimate {
  id, storyId, unit, value, confidence, basis, createdBy
}

Milestone {
  id, phaseId, name, date, demoNote, deliverables
}

Phase {
  id, planId, order, startDate, endDate, deliverables
}

DeliveryPlan {
  id, projectId, team[], velocityPointsPerWeek, calendar, buffers,
  totalCostUsd, status, currentVersion
}

DealRoom {
  id, projectId, title, slug, sections[], themeTokens, expiresAt,
  password, requiresApproval, status
}

ShareLink {
  id, dealRoomId, token, expiresAt, createdBy, password
}

ViewEvent {
  id, shareLinkId, viewedAt, userAgent, scrollDepth
}

Comment {
  id, dealRoomId, authorId, body, sectionRef, createdAt
}

Approval {
  id, dealRoomId, approvedBy, approvedAt, snapshotVersion,
  signatureBase64
}

ReviewRun {
  id, specId, kind (ambiguity|security|scale|observability),
  status, findings, completedAt
}

Finding {
  id, reviewRunId, category, severity, requirementRef,
  rationale, suggestedPatch
}

IntegrationCredential {
  id, orgId, provider (linear|trello|slack|jira),
  encryptedToken, refreshToken, expiresAt, scopes, metadata
}

IntegrationMapping {
  id, orgId, projectId, provider, externalProjectId, fieldMappings
}

PushJob {
  id, projectId, provider, status, itemsPushed, itemsFailed,
  externalIds, createdAt, completedAt
}

NotificationPreference {
  id, orgId, userId, channel (slack|email|in_app),
  events (spec_published|version_diff|critical_finding),
  slackChannelId, emailAddress
}

PromptCache {
  hash, model, templateVersion, cachedOutput, expiresAt
}

AiRunResult {
  id, aiRunId, suggestionId, tokenCount, costUsd,
  durationMs, retries, validationErrors
}

RateLimitBucket {
  id, orgId, key, count, window, expiresAt
}

AuditEvent {
  id, orgId, actorId, action, resourceType, resourceId,
  beforeState, afterState, ipAddress, userAgent, timestamp
}
```

### 1.2 API Input Validation & Error Handling

**Current:** Minimal validation, no consistent error responses  
**Required:**

```typescript
// Global exception filter
class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: Exception, host: ArgumentsHost) {
    // Map domain errors → HTTP status codes
    // Attach request ID, trace ID, user org
    // Log with structured format
    // Return consistent error shape
  }
}

// Zod-based request validation
class ZodValidationPipe implements PipeTransform {
  transform(value, metadata) {
    // Validate DTO against schema
    // Return 400 with field-level errors
    // Include suggestion for common mistakes
  }
}

// Request/response schemas
export const CreateSpecDto = z.object({
  title: z.string().min(3).max(200),
  projectId: z.string().cuid(),
  tags: z.array(z.string()).optional(),
})
```

### 1.3 Authentication & Authorization Hardening

**Current:** Dev login only, CASL policies exist but not enforced  
**Required:**

```
- Auth.js full setup (Google, GitHub, magic link)
- JWT with RS256 (not HS256)
- Refresh token rotation
- CASL ability enforcement on every endpoint (custom decorator)
- Organization isolation via middleware (SET LOCAL app.org_id)
- API key auth for service-to-service
- Rate limiting by user + IP
- Session invalidation on role change
- CSRF tokens in state-changing requests
```

### 1.4 Rate Limiting & DDoS Protection

```typescript
// Redis-backed token bucket per (user_id, endpoint, window)
@UseGuards(ThrottleGuard)
@Throttle(100, 60) // 100 requests per 60 seconds
async generateSpec(@Body() dto) { }

// Tiered limits:
// Free plan: 10 gen/month, 3 concurrent
// Pro: 1000 gen/month, 10 concurrent
// Enterprise: unlimited
```

---

## Priority 2: UI/UX System (Design System Alignment)

### 2.1 Design Tokens (Blueprint Noir + Reference Dashboards)

**Reference Analysis:** The provided dashboards show:
- **Color palette:** Dark navy/charcoal backgrounds (#0B0D10, #12151A), cyan/purple accents
- **Typography:** Modern sans-serif, strong contrast
- **Charts:** Gradient fills, interactive tooltips, dark theme
- **Layout:** Card-based, grid system, generous spacing
- **Components:** Charts, KPI cards, data tables with sorting/filtering

**Tokens to implement:**

```typescript
// packages/ui/src/theme.ts
export const tokens = {
  colors: {
    // Surface
    surface: {
      0: '#0B0D10', // Darkest, page bg
      50: '#12151A', // Card bg
      100: '#1A1E26', // Hover
    },
    // Semantic
    primary: '#5EE7FF', // Cyan
    secondary: '#8B7CFF', // Purple
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    // Text
    text: {
      primary: '#F4F5F7',
      secondary: '#9BA3B0',
      muted: '#5A6270',
    },
  },
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: {
      xs: '12px', label: '13px', sm: '14px', base: '16px', lg: '18px', xl: '20px', 2xl: '24px'
    },
    fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 }
  },
  spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px', 2xl: '32px' },
  radius: { sm: '4px', md: '8px', lg: '12px', full: '9999px' },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px rgba(0,0,0,0.1)',
    lg: '0 10px 15px rgba(0,0,0,0.1)',
  }
}
```

### 2.2 Component Library Expansion

**Currently missing:**

```
✓ Button, Input, Skeleton, EmptyState, Sidebar
✗ Card
✗ DataTable (with sorting, filtering, pagination)
✗ Modal / Dialog
✗ Tabs
✗ Dropdown Menu
✗ Toast / Alert
✗ Chart (Area, Bar, Line, Pie, Gantt)
✗ Breadcrumb
✗ Badge / Tag
✗ Progress bar
✗ Spinner / Loading state
✗ CommandPalette / K
✗ Popover / Tooltip
✗ Form (with field-level validation)
✗ Combobox / Select
✗ Checkbox / Radio / Toggle
✗ Stepper / Timeline
✗ Avatar / Gravatar
✗ Link with active state
```

### 2.3 Page Layouts

```
Dashboard (P0)
  ├── Sidebar (org switcher, nav, user menu)
  ├── Top nav (workspace, search, notifications)
  └── Main (projects grid, recent activity)

Spec Workspace (P1)
  ├── Outline panel (tree nav, + add requirement)
  ├── Editor (TipTap + requirement blocks, rich text)
  ├── AI Rail (streaming generation, accept/reject)
  └── Version panel (history, diff, publish)

Backlog Board (P2)
  ├── Filters (module, priority, moscow, estimation)
  ├── Kanban (columns per status: backlog, selected, in-progress, done)
  ├── Story cards (title, criteria count, estimate, requirement badge)
  └── Traceability (click story → highlight requirement)

Delivery Timeline (P3)
  ├── Gantt chart (phases, milestones, critical path)
  ├── Scope editor (modules checkbox, story toggle)
  ├── Cost/effort breakdown (by role, by phase)
  └── Team allocation heatmap

Deal Room (P5)
  ├── Cover section (logo, title, client name, date)
  ├── Sections (understanding, scope, timeline, cost, team)
  ├── Live toggles (scope changes → recompute time/cost)
  ├── Comments & approvals
  └── PDF export button
```

---

## Priority 3: API Layer Completeness

### 3.1 Endpoint Checklist

```typescript
// Auth
POST   /auth/dev-login         # Dev only
POST   /auth/login             # Magic link / OAuth
POST   /auth/signup
POST   /auth/logout
POST   /auth/refresh-token
GET    /auth/me                # Current user + org context

// Orgs
GET    /orgs/:id
PATCH  /orgs/:id               # Name, plan, theme tokens
GET    /orgs/:id/members
POST   /orgs/:id/members       # Invite
PATCH  /orgs/:id/members/:mid  # Role change
DELETE /orgs/:id/members/:mid  # Remove

// Projects
GET    /projects               # List (paginated, filtered)
POST   /projects               # Create
GET    /projects/:id
PATCH  /projects/:id
DELETE /projects/:id
GET    /projects/:id/timeline  # Summary for dashboard

// Specs
GET    /specs                  # List for project
POST   /specs                  # Create (from brief or blank)
GET    /specs/:id              # Full graph
PATCH  /specs/:id              # Metadata
DELETE /specs/:id

POST   /specs/:id/requirements
PATCH  /specs/:id/requirements/:rid
DELETE /specs/:id/requirements/:rid

POST   /specs/:id/versions     # Publish
GET    /specs/:id/versions/:v
GET    /specs/:id/versions/:v1/diff/:v2

// AI Generation
POST   /projects/:id/briefs
GET    /briefs/:id

POST   /specs/:id/generate     # Async: { runId, specId }
GET    /runs/:id/stream        # SSE
GET    /runs/:id/status

POST   /specs/:id/suggestions
GET    /suggestions/:id
POST   /suggestions/:id/accept
POST   /suggestions/:id/reject

// Stories (P2+)
POST   /specs/:id/stories/generate
GET    /stories
PATCH  /stories/:id
DELETE /stories/:id
POST   /stories/:id/split

// Delivery Plan (P3+)
POST   /projects/:id/plan/generate
GET    /plan/:id
PATCH  /plan/:id
POST   /plan/:id/simulate      # What-if (no persist)

// Diagrams (P4+)
POST   /specs/:id/diagrams/generate
GET    /diagrams/:id
GET    /diagrams/:id/export    # openapi.yaml, sql, mermaid

// Deal Room (P5+)
POST   /projects/:id/deal-rooms
GET    /deal-rooms/:id
PATCH  /deal-rooms/:id
DELETE /deal-rooms/:id

POST   /deal-rooms/:id/share-links
GET    /share-links/:token/public  # No auth
POST   /share-links/:token/approve
POST   /share-links/:token/comments

// Integrations (P6+)
POST   /integrations/linear/authorize
POST   /projects/:id/push/linear
GET    /integration-jobs/:id

POST   /integrations/trello/authorize
POST   /projects/:id/push/trello

// Review Packs (P7+)
POST   /specs/:id/review-runs
GET    /review-runs/:id

// Admin (monitoring, costs, budgets)
GET    /admin/ai-runs          # Filter by org, model, date range
GET    /admin/costs            # Cost trends
PATCH  /admin/orgs/:id/budget  # Set org budget, warn threshold
```

### 3.2 Consistent Response Shape

```typescript
// Success
{ data: T, meta: { pagination: { page, limit, total }, traceId } }

// Error
{
  error: {
    code: 'VALIDATION_ERROR' | 'FORBIDDEN' | 'NOT_FOUND' | 'INTERNAL_ERROR',
    message: 'Human-readable',
    details: [{ field: 'email', issue: 'invalid format' }],
    traceId: 'uuid',
    timestamp: ISO8601,
    docs: 'https://docs.specforge.dev/errors#...'
  }
}
```

---

## Priority 4: Security Hardening

### 4.1 Input Validation

- [ ] All DTOs validated with Zod before reaching service layer
- [ ] Uploaded file scanning (virus, size, MIME type)
- [ ] Prompt injection detection (uploaded documents treated as data, not instructions)
- [ ] SQL injection: Prisma parameterization only (no raw queries)
- [ ] XSS: CSP headers, sanitized HTML output in frontend

### 4.2 Authentication & Authorization

- [ ] Auth.js configured with Google, GitHub, Magic Link
- [ ] RS256 JWT with 15-min expiry, refresh tokens 30-day
- [ ] Refresh token rotation on every use
- [ ] CASL enforced as `@RequireAbility('read', 'Spec')` decorators
- [ ] Row-level security: `SET LOCAL app.org_id` on every request
- [ ] API keys for service-to-service (worker calling API)

### 4.3 Network Security

- [ ] HTTPS only (Strict-Transport-Security header)
- [ ] CORS whitelist (no `*`)
- [ ] Rate limiting per IP + user ID
- [ ] DDoS protection: Cloudflare or similar
- [ ] CSRF tokens for state-changing requests
- [ ] Helmet.js security headers

### 4.4 Data Protection

- [ ] Secrets in .env (never committed), KMS-backed envelope encryption for integrations
- [ ] PII redaction before LLM calls (configurable per workspace)
- [ ] Database encryption at rest (Postgres pgcrypto)
- [ ] Backups encrypted, tested restore monthly
- [ ] Audit log immutable append-only (no delete)

### 4.5 Third-Party Security

- [ ] Dependency audit in CI (npm audit, snyk)
- [ ] SBOM generation (CycloneDX)
- [ ] License compliance check
- [ ] No hardcoded secrets (pre-commit hooks)

---

## Priority 5: Observability & Monitoring

### 5.1 Structured Logging

```typescript
// Every request gets correlation IDs
req.id = ulid()
req.traceId = getHeader('x-trace-id') || req.id

// Log context
logger.info('spec.created', {
  specId: spec.id,
  orgId: org.id,
  userId: user.id,
  duration: durationMs,
  traceId,
  version: pkg.version,
})
```

### 5.2 OpenTelemetry Setup

```typescript
// Traces
@Span('spec.create')
async createSpec() { }

// Metrics
counter.inc('specs_created', { org_id, user_role })
histogram.record('spec_create_duration_ms', durationMs, { org_id })

// Distributed tracing to Tempo / Jaeger
```

### 5.3 Metrics & Dashboards

```
Application Metrics:
  - Spec generation latency (p50, p95, p99)
  - AI run success rate (by model, by task)
  - Story coverage % (distribution by project)
  - API endpoint latency (by operation)
  - Queue depth and processing time
  - RLS policy violation attempts

Infrastructure Metrics:
  - Postgres connection pool usage
  - Redis memory usage
  - API memory/CPU
  - Worker queue processing time
  - S3 upload/download latency

Cost Metrics:
  - LLM cost per org (daily, monthly)
  - Token usage breakdown by task
  - Projected monthly spend
```

### 5.4 Alerting

```
Critical:
  - API error rate > 5% (5-min window)
  - Queue backed up (> 100 pending)
  - Database connection pool exhausted
  - Auth failures spike > 10/min

Warning:
  - API p95 latency > 2s
  - LLM token cost spike > 2σ
  - Worker memory > 80%
```

---

## Priority 6: Deployment & Infrastructure

### 6.1 Docker Setup

```dockerfile
# API service (NestJS)
FROM node:20-alpine AS builder
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm i -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build --filter=@specforge/api

FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
```

### 6.2 Kubernetes Manifests

```yaml
# api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: specforge-api
  labels:
    app: specforge
    component: api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  selector:
    matchLabels:
      app: specforge
      component: api
  template:
    metadata:
      labels:
        app: specforge
        component: api
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: component
                      operator: In
                      values: [api]
                topologyKey: kubernetes.io/hostname
      containers:
        - name: api
          image: ghcr.io/specforge/api:${VERSION}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3001
              name: http
          env:
            - name: NODE_ENV
              value: production
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: specforge-secrets
                  key: database-url
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 3001
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 3001
            initialDelaySeconds: 5
            periodSeconds: 5
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 500m
              memory: 1Gi
```

### 6.3 Infrastructure as Code (Terraform)

```hcl
# main.tf
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" { region = var.aws_region }

# RDS PostgreSQL
resource "aws_db_instance" "postgres" {
  identifier          = "specforge-db"
  engine              = "postgres"
  engine_version      = "16.1"
  instance_class      = "db.t4g.medium"
  allocated_storage   = 100
  storage_type        = "gp3"
  db_name             = "specforge"
  username            = "postgres"
  password            = random_password.db_password.result
  skip_final_snapshot = false
  backup_retention_period = 30
  enable_encryption   = true
  enable_iam_database_authentication = true
  
  tags = { Name = "specforge-postgres" }
}

# ElastiCache Redis
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "specforge-redis"
  engine               = "redis"
  engine_version       = "7.0"
  node_type           = "cache.t4g.medium"
  num_cache_nodes     = 3
  parameter_group_name = "default.redis7"
  port                 = 6379
  engine_log_enabled   = true
  auto_failover_enabled = true

  tags = { Name = "specforge-redis" }
}

# ECS Fargate API
resource "aws_ecs_service" "api" {
  name            = "specforge-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 3
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3001
  }
}

# S3 for uploads
resource "aws_s3_bucket" "uploads" {
  bucket = "specforge-${var.environment}-uploads"

  tags = { Name = "specforge-uploads" }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
```

### 6.4 CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test-lint-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      
      - name: Build & push Docker images
        run: |
          docker build -t ghcr.io/specforge/api:${{ github.sha }} apps/api/
          docker push ghcr.io/specforge/api:${{ github.sha }}

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=moderate
      - uses: aquasecurity/trivy-action@master
        with: { scan-type: 'fs', scan-ref: '.' }

  deploy:
    needs: [test-lint-build, security-scan]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: |
          aws eks update-kubeconfig --cluster-name specforge-prod
          kubectl set image deployment/specforge-api api=ghcr.io/specforge/api:${{ github.sha }}
          kubectl rollout status deployment/specforge-api
```

---

## Priority 7: Testing Strategy

### 7.1 Unit Tests

```typescript
// packages/domain/src/spec.test.ts
describe('Spec domain', () => {
  describe('publishVersion', () => {
    it('should create immutable content-hashed snapshot', () => {
      const spec = createTestSpec()
      const v1 = publishVersion(spec, 'hash-algo')
      
      expect(v1.hash).toMatch(/^[a-f0-9]{64}$/)
      expect(v1.snapshot).toEqual(spec)
    })

    it('should reject duplicate hashes', () => {
      const spec1 = publishVersion(spec, 'algo')
      const spec2 = publishVersion(spec, 'algo')
      expect(spec1.hash).toBe(spec2.hash)
    })
  })
})

// Coverage target: 85% (domain), 70% (controllers)
```

### 7.2 Integration Tests

```typescript
// apps/api/test/spec.integration.test.ts
describe('Spec workflow (integration)', () => {
  let app: INestApplication
  let db: PrismaClient
  let org: Org
  let user: User

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule]
    }).compile()
    app = moduleFixture.createNestApplication()
    await app.init()
    db = app.get(PrismaService)
    org = await createTestOrg(db)
    user = await createTestUser(db, org)
  })

  it('should generate spec from brief → publish → diff', async () => {
    // 1. Create project
    const project = await db.project.create({
      data: { orgId: org.id, workspaceId, name: 'Test' }
    })

    // 2. Post brief
    const brief = await request(app.getHttpServer())
      .post(`/api/v1/projects/${project.id}/briefs`)
      .set('x-org-id', org.id)
      .send({ raw: 'A yoga booking app...' })
      .expect(201)

    // 3. Generate spec (SSE)
    const events: string[] = []
    const stream = request(app.getHttpServer())
      .get(`/api/v1/runs/${brief.body.runId}/stream`)
      .set('x-org-id', org.id)
    
    stream.on('data', (chunk) => events.push(chunk.toString()))
    await new Promise(resolve => stream.on('end', resolve))

    expect(events.length).toBeGreaterThan(0)
    expect(events[events.length - 1]).toContain('event: done')

    // 4. Fetch spec
    const spec = await request(app.getHttpServer())
      .get(`/api/v1/specs/${brief.body.specId}`)
      .set('x-org-id', org.id)
      .expect(200)

    expect(spec.body.requirements.length).toBeGreaterThan(5)
    expect(spec.body.requirements[0].key).toMatch(/^FR-\d+$/)
  })
})
```

### 7.3 E2E Tests (Playwright)

```typescript
// e2e/spec-creation.spec.ts
import { test, expect } from '@playwright/test'

test('Create spec from brief to version diff', async ({ page, context }) => {
  // 1. Login
  await page.goto('http://localhost:3000/login')
  await page.fill('input[type="email"]', 'test@specforge.dev')
  await page.click('button:has-text("Login")')
  await page.waitForNavigation()

  // 2. Create project
  await page.click('button:has-text("New Project")')
  await page.fill('input[placeholder="Project name"]', 'Test App')
  await page.click('button:has-text("Create")')

  // 3. Paste brief
  await page.fill('textarea[placeholder="Paste brief..."]', 'A booking app for yoga studios')
  await page.click('button:has-text("Generate")')

  // 4. Watch streaming requirements
  const requirementCards = page.locator('[data-testid="requirement-card"]')
  await expect(requirementCards).toHaveCount(10, { timeout: 30000 })

  // 5. Accept all suggestions
  await page.click('button:has-text("Accept All")')

  // 6. Publish version
  await page.click('button:has-text("Publish")')
  const version1 = page.locator('[data-testid="current-version"]')
  await expect(version1).toContainText('v1')

  // 7. Modify and publish v2
  await page.click('[data-testid="requirement-0"] .edit-btn')
  await page.fill('[data-testid="requirement-title"]', 'Updated title')
  await page.click('button:has-text("Save")')
  await page.click('button:has-text("Publish")')

  // 8. Compare diffs
  await page.click('button:has-text("Compare")')
  const diffView = page.locator('[data-testid="diff-view"]')
  await expect(diffView).toContainText('modified')
})
```

### 7.4 Load Testing (k6)

```javascript
// infra/load-test.js
import http from 'k6/http'
import { check, group } from 'k6'

export const options = {
  scenarios: {
    ramp_up: {
      executor: 'rampingVUs',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.05'],
  },
}

export default function () {
  group('Deal Room view', () => {
    const res = http.get(__ENV.BASE_URL + '/api/v1/deal-rooms/test-token/public', {
      headers: { 'User-Agent': 'LoadTest' },
    })
    check(res, { 'status 200': r => r.status === 200 })
  })

  group('Spec generation', () => {
    const res = http.post(__ENV.BASE_URL + '/api/v1/specs/test/generate', {
      raw: 'A simple app',
    }, { headers: { 'x-org-id': __ENV.ORG_ID } })
    check(res, { 'status 202': r => r.status === 202 })
  })
}
```

---

## Priority 8: Documentation & Runbooks

### 8.1 ADRs (Architecture Decision Records)

```markdown
# ADR-001: TypeScript across domain, API, and UI

**Status:** Accepted  
**Date:** 2026-08-29  
**Deciders:** Dheeraj Gupta  

## Context
SpecForge requires end-to-end type safety from domain entities to LLM schemas to UI props.

## Decision
Use TypeScript exclusively; derive Zod schemas from a single source, codegen types for OpenAPI and frontend.

## Rationale
1. Type continuity prevents serialization bugs between domain and API
2. Zod-to-TypeScript means DTOs are never hand-written
3. OpenAPI-generated clients ensure API schema updates propagate to frontend

## Consequences
- Slower initial development (setup cost)
- Guaranteed runtime safety (if types are correct)
- Easy IDE refactoring across layers
```

### 8.2 Runbooks

```markdown
# Runbook: Scale to 10k concurrent users

**Symptoms:** API p95 latency >2s, database connections 90%+

**Steps:**

1. **Scale API horizontally (immediately)**
   ```bash
   kubectl scale deployment specforge-api --replicas=5
   kubectl autoscale deployment specforge-api --min=3 --max=10 --cpu-percent=70
   ```

2. **Optimize database queries (within 1 hour)**
   - Enable query slow-log: `ALTER SYSTEM SET log_min_duration_statement = 500;`
   - Review EXPLAIN output for N+1 and missing indexes
   - Add connection pooling (PgBouncer) in front of RDS

3. **Cache aggressively (within 4 hours)**
   - Cache spec graph reads in Redis (1h TTL)
   - Cache frequently accessed projects/specs (10m TTL)
   - Pre-compute coverage metrics on publish, not on read

4. **Queue prioritization**
   - Separate "high-priority" queue for real-time (spec view) vs batch (AI gen)
   - Increase worker concurrency (respect database limits)

5. **Monitor impact**
   - Watch `/metrics` dashboard
   - A/B test cache strategy with canary deployment

**Rollback:** `kubectl rollout undo deployment/specforge-api`
```

### 8.3 API Documentation (OpenAPI 3.0)

```yaml
# docs/openapi.yaml
openapi: 3.0.0
info:
  title: SpecForge API
  version: 1.0.0
  description: AI-powered spec management platform

servers:
  - url: https://api.specforge.dev/api/v1

paths:
  /specs:
    post:
      operationId: createSpec
      summary: Create a new spec
      tags: [Specs]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateSpecRequest'
      responses:
        '201':
          description: Spec created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Spec'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'

components:
  schemas:
    CreateSpecRequest:
      type: object
      required: [title, projectId]
      properties:
        title:
          type: string
          minLength: 3
          maxLength: 200
        projectId:
          type: string
          format: cuid
        tags:
          type: array
          items:
            type: string

    Spec:
      type: object
      properties:
        id:
          type: string
        title:
          type: string
        status:
          enum: [draft, review, approved, archived]
        requirements:
          type: array
          items:
            $ref: '#/components/schemas/Requirement'

  responses:
    BadRequest:
      description: Validation failed
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
```

---

## Implementation Timeline (Compressed)

| Week | Deliverable | Owner |
|------|-------------|-------|
| 1-2 | Prisma schema completion, API validation layer | Backend |
| 2-3 | UI system (design tokens, component lib, dark theme) | Frontend |
| 3-4 | Complete API endpoints + OpenAPI docs | Backend |
| 4-5 | Security hardening + rate limiting | Backend + DevOps |
| 5-6 | Docker + K8s manifests + CI/CD pipeline | DevOps |
| 6-7 | Integration tests + E2E tests | QA |
| 7-8 | Observability setup (OTel, Prometheus, Grafana) | DevOps + Backend |
| 8 | Documentation + ADRs + Runbooks | Technical Writer |

---

## Success Criteria (Production Readiness)

- [ ] **Security:** 100% of critical findings remediated, RLS negative tests passing, zero hardcoded secrets
- [ ] **Performance:** API p95 <1s, Deal Room page load <1.5s, spec generation SSE <10s for typical brief
- [ ] **Reliability:** 99.9% uptime SLO, automated backups + restore tested monthly, incident runbooks complete
- [ ] **Testing:** >85% code coverage (domain), >70% API layer, >80% critical user flows (E2E)
- [ ] **Monitoring:** All critical metrics dashboards live, alerts configured and tested, cost tracking per org
- [ ] **Documentation:** README shipping narrative, ARCHITECTURE.md comprehensive, 10 ADRs written, API docs auto-generated
- [ ] **Deployment:** Terraform IaC complete, CI/CD pipeline green, load test passing (50 concurrent users, p95 <2s), rolling deployments proven

---

## Known Blockers & Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| LLM API rate limits on high volume | HIGH | Implement request queuing, tiered model routing, budget caps per org |
| Database query N+1s under load | HIGH | Profile every endpoint, add indexes proactively, enable slow-log |
| Frontend state management complexity | MEDIUM | Stick to Zustand + TanStack Query, avoid Redux, keep stores small |
| Compliance (GDPR PII in specs) | MEDIUM | Implement configurable PII redaction, audit logging, data retention policies |
| Third-party integration outages (Linear, Slack) | LOW | Circuit breaker pattern, graceful degradation, outbox pattern for reliability |

