# SpecForge Development Guide

Complete local development setup and testing workflows.

---

## Table of Contents

- [Local Setup](#local-setup)
- [Development Workflow](#development-workflow)
- [Testing Strategy](#testing-strategy)
- [Debugging](#debugging)
- [Performance Profiling](#performance-profiling)

---

## Local Setup

### Prerequisites

```bash
# macOS / Linux / WSL2
Node 20.14+ (use nvm)
pnpm 9.15.0
PostgreSQL 16 (local or Docker)
Redis 7 (Docker)
Docker Desktop

# Verify versions
node --version     # v20.14.0+
pnpm --version     # 9.15.0
docker --version   # 25.0.0+
```

### Installation

```bash
# Clone repository
git clone https://github.com/specforge/specforge.git
cd specforge

# Install dependencies
pnpm install

# Setup environment files
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local

# Start services (Docker)
docker-compose -f infra/docker/docker-compose.yml up -d

# Verify database
pnpm db:push  # Or pnpm db:migrate (if migrations exist)

# Seed development data
pnpm db:seed
```

### .env.local Files

**apps/api/.env.local**
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/specforge_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-key-change-in-prod
OPENAI_API_KEY=sk-proj-xxxxx  # Get from OpenAI
NODE_ENV=development
LOG_LEVEL=debug
```

**apps/web/.env.local**
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-secret-key-change-in-prod
```

### Docker Compose

```yaml
# infra/docker/docker-compose.yml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - '5432:5432'
    environment:
      POSTGRES_DB: specforge_dev
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

  pgadmin:
    image: dpage/pgadmin4
    ports:
      - '5050:80'
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@example.com
      PGADMIN_DEFAULT_PASSWORD: admin

volumes:
  postgres_data:
```

---

## Development Workflow

### Start Dev Servers

```bash
# Terminal 1: API
cd apps/api
pnpm dev

# Terminal 2: Web
cd apps/web
pnpm dev

# Terminal 3: Worker
cd apps/worker
pnpm dev

# API runs on http://localhost:3001
# Web runs on http://localhost:3000
# Worker processes jobs from BullMQ
```

### File Watching & Hot Reload

All apps have hot reload configured:
- **NestJS:** watches `.ts` files, auto-restarts on change
- **Next.js:** hot module replacement (HMR) for components
- **pnpm workspaces:** watch mode for shared packages

### Making Changes

```bash
# Example: Add new endpoint
1. Create DTO in packages/schemas/src/dtos/
2. Implement service in apps/api/src/modules/*/
3. Add controller endpoint
4. Write tests
5. Test with curl or Postman
6. Commit with conventional commits

git add .
git commit -m "feat(specs): add create spec endpoint"
git push origin feature/new-endpoint
```

### Code Generation

```bash
# Generate Prisma client after schema changes
pnpm db:generate

# Generate OpenAPI docs
pnpm openapi:generate

# Generate frontend API client
pnpm gen:client

# Generate all
pnpm gen
```

---

## Testing Strategy

### Unit Tests (>85% coverage target)

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage

# Example: Test domain function
// packages/domain/src/spec.test.ts
import { publishVersion } from './spec'

describe('Spec Domain', () => {
  it('should increment version on publish', () => {
    const spec = { id: '1', version: 1, content: {} }
    const published = publishVersion(spec, 'sha256')
    
    expect(published.version).toBe(2)
    expect(published.hash).toBeDefined()
  })

  it('should freeze snapshot', () => {
    const spec = { id: '1', version: 1, content: { foo: 'bar' } }
    const published = publishVersion(spec, 'sha256')
    
    expect(() => {
      published.snapshot.content.foo = 'changed'
    }).toThrow()  // Object.freeze enforced
  })
})
```

### API Integration Tests (>70% coverage target)

```bash
# Run API tests (requires Postgres + Redis)
cd apps/api
pnpm test:api

# Example: Test controller endpoint
// apps/api/src/modules/specs/specs.controller.test.ts
import { Test } from '@nestjs/testing'
import { SpecsController } from './specs.controller'
import { SpecsService } from './specs.service'

describe('SpecsController', () => {
  let controller: SpecsController
  let service: SpecsService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SpecsController],
      providers: [
        {
          provide: SpecsService,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: '1' }),
          },
        },
      ],
    }).compile()

    controller = module.get(SpecsController)
    service = module.get(SpecsService)
  })

  it('should create spec', async () => {
    const dto = { title: 'Test Spec', projectId: '1' }
    const result = await controller.create(dto, { user: { orgId: '1' } })
    
    expect(service.create).toHaveBeenCalledWith(dto, '1')
    expect(result.id).toBe('1')
  })
})
```

### E2E Tests (>80% coverage target)

```bash
# Run E2E tests (full stack, including database)
pnpm test:e2e

# Example: E2E test for spec workflow
// apps/api/test/specs.e2e.test.ts
import request from 'supertest'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module'

describe('Specs E2E', () => {
  let app
  let jwtToken

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = module.createNestApplication()
    await app.init()

    // Login and get JWT
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/dev-login')
      .send({ email: 'test@example.com' })
    
    jwtToken = loginRes.body.accessToken
  })

  it('should create and publish spec', async () => {
    // Create spec
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/specs')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        title: 'Test Spec',
        projectId: 'proj-1',
        tags: ['test'],
      })
    
    expect(createRes.status).toBe(201)
    const specId = createRes.body.id

    // Get spec
    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/specs/${specId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
    
    expect(getRes.status).toBe(200)
    expect(getRes.body.title).toBe('Test Spec')

    // Publish version
    const publishRes = await request(app.getHttpServer())
      .post(`/api/v1/specs/${specId}/publish`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send()
    
    expect(publishRes.status).toBe(200)
    expect(publishRes.body.version).toBe(2)
  })

  afterAll(async () => {
    await app.close()
  })
})
```

### Load Testing

```bash
# Install k6
brew install k6  # macOS

# Run load test
k6 run test/load/specs.js

// test/load/specs.js
import http from 'k6/http'
import { check } from 'k6'

export const options = {
  vus: 100,  // 100 virtual users
  duration: '30s',
}

export default function () {
  const res = http.get('http://localhost:3001/api/v1/specs')
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  })
}
```

---

## Debugging

### Browser DevTools

```bash
# Debug Next.js app
# Open http://localhost:3000
# Open browser DevTools (F12)
# Sources tab to set breakpoints in component code
# Console to inspect React state
```

### Node Debugger (API)

```bash
# Terminal 1: Start API with debugger
node --inspect-brk ./apps/api/dist/main.js

# Terminal 2: Connect with Chrome DevTools
# Visit chrome://inspect

# Or use VS Code debugger
# .vscode/launch.json
{
  "type": "node",
  "request": "attach",
  "name": "Attach to API",
  "port": 9229,
  "protocol": "inspector"
}
```

### Logging Best Practices

```typescript
// Use pino for structured logging
import { Logger } from '@nestjs/common'

export class SpecsService {
  private logger = new Logger(SpecsService.name)

  async create(dto: CreateSpecDto) {
    this.logger.debug({
      msg: 'Creating spec',
      dto,
      orgId: dto.orgId,
    })

    try {
      const spec = await this.prisma.spec.create({ data: dto })
      this.logger.log({
        msg: 'Spec created',
        specId: spec.id,
      })
      return spec
    } catch (error) {
      this.logger.error({
        msg: 'Failed to create spec',
        error: error.message,
        stack: error.stack,
      })
      throw error
    }
  }
}
```

### Database Debugging

```bash
# Connect to local Postgres
psql -h localhost -U postgres -d specforge_dev

# Common queries
\dt                           # List tables
\d specs                      # Describe table
SELECT * FROM specs LIMIT 10; # Query data
EXPLAIN ANALYZE SELECT ...;   # Query plan
```

### Redis Debugging

```bash
# Connect to local Redis
redis-cli

# Check queue status
LLEN bull:generate-spec:wait        # Pending jobs
LLEN bull:generate-spec:active      # Active jobs
LLEN bull:generate-spec:completed   # Completed jobs

# Inspect job details
HGETALL bull:generate-spec:1        # Get job payload
```

---

## Performance Profiling

### CPU Profiling (Node.js)

```bash
# Start with profiling
node --prof ./apps/api/dist/main.js

# Run load test for 1 minute, then stop (Ctrl+C)
# This creates isolate-0x...-v8.log

# Convert to readable format
node --prof-process isolate-*.log > profile.txt

# View results
cat profile.txt | grep -A 20 "JavaScript"
```

### Memory Profiling

```bash
# Install clinic
npm install -g clinic

# Profile memory
clinic doctor -- node ./apps/api/dist/main.js

# Run load test
k6 run test/load/specs.js

# Open clinic report
# clinic will show memory leaks, CPU, latency
```

### Database Query Profiling

```bash
# Enable query logging in Postgres
ALTER DATABASE specforge_dev SET log_statement = 'all';
ALTER DATABASE specforge_dev SET log_duration = 'on';
ALTER DATABASE specforge_dev SET log_min_duration_statement = 100;  # Log queries > 100ms

# View slow queries
tail -f /var/log/postgresql/postgresql.log | grep -i "duration\|slow"

# Or use pg_stat_statements extension
CREATE EXTENSION pg_stat_statements;
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### Frontend Performance

```bash
# Lighthouse CI
npm install -g @lhci/cli@latest

# Run lighthouse audit
lhci autorun

# Check results
# https://specforge.lhci.app

# DevTools Performance tab
# 1. Open Chrome DevTools
# 2. Performance tab
# 3. Click record
# 4. Interact with page
# 5. Stop recording
# 6. Analyze flamegraph
```

### Real User Monitoring (Future)

```typescript
// Planned for P8: Sentry + DataDog integration
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,  // Sample 10% of requests
  environment: process.env.NODE_ENV,
})

// Frontend
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT,
})
```

