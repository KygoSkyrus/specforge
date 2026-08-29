# SpecForge Security & Compliance Guide

---

## Table of Contents

- [Authentication & Authorization](#authentication--authorization)
- [Data Security](#data-security)
- [Network Security](#network-security)
- [Compliance](#compliance)
- [Security Checklist](#security-checklist)

---

## Authentication & Authorization

### Authentication Flow

**OAuth 2.0 + JWT**

```
User Login (Google/GitHub)
  ↓
OAuth Provider Callback
  ↓
NextAuth.js verifies code
  ↓
Create User in Postgres
  ↓
Issue JWT (expires 15m)
  ↓
Issue Refresh Token (expires 30d, HttpOnly cookie)
  ↓
API protected by JwtGuard (NestJS)
```

**Implementation:**

```typescript
// apps/api/src/auth/jwt.guard.ts
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException()
    }

    try {
      const token = authHeader.split(' ')[1]
      const payload = this.jwtService.verify(token, {
        publicKey: process.env.JWT_PUBLIC_KEY,
        algorithms: ['RS256'],
      })
      request.user = payload // { sub: userId, orgId, email }
      return true
    } catch {
      throw new UnauthorizedException('Invalid token')
    }
  }
}

// Usage in controller
@Controller('specs')
@UseGuards(JwtGuard)
export class SpecsController {
  @Get(':id')
  async getSpec(@Param('id') specId: string, @Request() req) {
    // req.user.orgId available here
    return this.specs.get(specId, req.user.orgId)
  }
}
```

### Role-Based Access Control (RBAC)

```typescript
// apps/api/src/auth/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<Role[]>('roles', context.getHandler())
    if (!requiredRoles) return true // No roles required

    const request = context.switchToHttp().getRequest()
    const userRole = request.user.role // From JWT payload

    return requiredRoles.includes(userRole)
  }
}

// Usage
@Get('specs')
@Roles(Role.ADMIN, Role.EDITOR)  // Only admins and editors
async listSpecs() {
  // ...
}
```

### Row-Level Security (Database)

```sql
-- Enable RLS on all tables
ALTER TABLE specs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read specs in their org
CREATE POLICY org_isolation ON specs
  FOR SELECT
  USING (org_id = current_setting('app.org_id')::uuid);

CREATE POLICY org_isolation_update ON specs
  FOR UPDATE
  USING (org_id = current_setting('app.org_id')::uuid);

CREATE POLICY org_isolation_delete ON specs
  FOR DELETE
  USING (org_id = current_setting('app.org_id')::uuid);
```

**Enforcement in NestJS:**

```typescript
// middleware/org-isolation.middleware.ts
@Injectable()
export class OrgIsolationMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Must run before any database query
    const orgId = req.user?.orgId
    if (!orgId) throw new UnauthorizedException()

    // Set RLS context for this request
    await this.prisma.$executeRawUnsafe(
      `SELECT set_config('app.org_id', $1, true)`,
      [orgId]
    )

    next()
  }
}
```

---

## Data Security

### Encryption at Rest

**Database:**
- Enable Transparent Data Encryption (TDE) at Azure Postgres
- Encryption key stored in Azure Key Vault (separate from app)

**Redis:**
- Use `rediss://` (TLS) for connections
- Enable encryption at rest in Azure Cache

**Application Secrets:**
```typescript
// Use envelope encryption for sensitive fields
import crypto from 'crypto'

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex')

export function encryptSecret(secret: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  let encrypted = cipher.update(secret, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`
}

export function decryptSecret(encrypted: string): string {
  const [ivStr, encryptedStr, authTagStr] = encrypted.split(':')
  const iv = Buffer.from(ivStr, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  decipher.setAuthTag(Buffer.from(authTagStr, 'hex'))
  let decrypted = decipher.update(encryptedStr, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
```

### Encryption in Transit

- **HTTPS/TLS 1.3** enforced on all connections
- **HSTS** header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- **Postgres:** Use `sslmode=require` in connection string
- **Redis:** Use `rediss://` scheme

```typescript
// NestJS main.ts
import helmet from '@nestjs/helmet'

app.use(
  helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  })
)
```

### Input Validation & Sanitization

```typescript
// Zod schema handles validation
import { z } from 'zod'

export const CreateSpecSchema = z.object({
  title: z.string()
    .min(3, 'Too short')
    .max(200, 'Too long')
    .trim()  // Remove whitespace
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Invalid characters'),
  projectId: z.string().cuid(),
  tags: z.array(z.string().max(50)).optional(),
})

// Sanitization for display (XSS prevention)
import xss from 'xss'

export function sanitizeHtml(html: string): string {
  return xss(html, {
    whiteList: {
      p: ['class'],
      strong: [],
      em: [],
      a: ['href', 'title'],
      code: ['class'],
      pre: ['class'],
    },
  })
}
```

### Secret Management

```bash
# Never commit secrets to Git
# Use environment-specific .env files

# .env.production (NEVER in Git, only on server)
JWT_SECRET=<rotate monthly>
OPENAI_API_KEY=<from 1Password>
AWS_SECRET_ACCESS_KEY=<from AWS Secrets Manager>

# Rotate secrets monthly
kubectl patch secret specforge-secrets -n specforge \
  -p '{"data":{"jwt-secret":"'$(echo -n 'new-secret' | base64)'"}}'

# Audit who accessed secrets
kubectl audit logs | grep secrets
```

### OWASP Top 10 Mitigation

| Vulnerability | Mitigation |
|---|---|
| Injection | Parameterized queries (Prisma), Zod validation |
| Broken Auth | JWT + RBAC, no session fixation |
| Sensitive Data | Encryption at rest/transit, no logs of secrets |
| XML External Entities | No XML parsing (JSON only) |
| Broken Access Control | RLS at DB, @Roles() guard at API |
| Security Misconfiguration | Infrastructure as Code (Terraform), security scanning in CI/CD |
| XSS | Input validation, output encoding, CSP header |
| Insecure Deserialization | No unsafe `eval()`, JSON.parse only trusted input |
| Using Components with Known Vulns | `pnpm audit`, renovate bot, cve-remediation |
| Insufficient Logging | Audit trail in AuditLog table, Sentry for errors |

---

## Network Security

### Ingress & WAF

```yaml
# infra/k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/enable-modsecurity: "true"
    nginx.ingress.kubernetes.io/enable-owasp-core-rules: "true"  # OWASP CRS
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "60s"
spec:
  tls:
    - hosts: [specforge.app]
      secretName: specforge-tls-cert
  rules:
    - host: specforge.app
      http:
        paths:
          - path: /
            backend:
              service:
                name: specforge-web
                port: 3000
```

### Network Policies

```yaml
# Block all traffic except allowed
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: specforge-deny-all
  namespace: specforge
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress

# Allow API to Postgres
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: specforge-api-to-postgres
spec:
  podSelector:
    matchLabels:
      component: api
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: specforge
      ports:
        - protocol: TCP
          port: 5432
```

### DDoS Protection

- **Rate limiting:** 100 req/min per IP (Nginx)
- **Connection limits:** Max 100 concurrent per IP
- **CloudFlare:** DDoS mitigation + caching (if in front of Kubernetes)

```typescript
// Rate limit by user (more granular)
import { ThrottlerGuard } from '@nestjs/throttler'

@UseGuards(ThrottlerGuard)
@Post('specs/:id/generate')
async generateSpec(@Param('id') specId: string) {
  // Max 5 requests per user per hour
}
```

---

## Compliance

### Data Retention & GDPR

```typescript
// Retention policies
export const RETENTION_POLICIES = {
  auditLogs: 365,          // 1 year
  deletedSpecs: 30,        // 30 days before permanent delete
  apiLogs: 90,             // 90 days
  aiRunLogs: 180,          // 180 days for compliance
  sessionTokens: 30,       // 30 days
}

// Implement "right to be forgotten"
@Delete('users/:id')
async deleteUser(@Param('id') userId: string) {
  // Soft delete user
  await this.prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  })

  // Schedule hard delete after retention period
  await this.queue.add('delete-user-data', { userId }, {
    delay: 30 * 24 * 60 * 60 * 1000, // 30 days
  })
}
```

### Audit Logging

```typescript
// Log all sensitive actions
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest()
    const { method, path, user } = request

    return next.handle().pipe(
      tap((data) => {
        this.auditService.log({
          action: `${method} ${path}`,
          actorId: user?.sub,
          resourceType: this.getResourceType(path),
          resourceId: this.getResourceId(path),
          status: 'success',
          timestamp: new Date(),
        })
      }),
      catchError((error) => {
        this.auditService.log({
          action: `${method} ${path}`,
          actorId: user?.sub,
          error: error.message,
          status: 'failed',
          timestamp: new Date(),
        })
        throw error
      })
    )
  }
}
```

### SOC 2 Controls

**A1: Access Control**
- ✅ Multi-factor authentication (OAuth providers support it)
- ✅ Role-based access control
- ✅ Session management (JWT + refresh tokens)

**A2: Logging & Monitoring**
- ✅ Audit trail (AuditLog table)
- ✅ Sentry for error tracking
- ✅ Prometheus metrics

**A3: Change Management**
- ✅ Version control (Git)
- ✅ Code review (GitHub PRs)
- ✅ Deployment pipeline (CI/CD)

**A4: Risk Management**
- ✅ Dependency scanning (pnpm audit)
- ✅ SAST (Semgrep)
- ✅ Image scanning (Trivy)

**A5: Incident Response**
- ✅ Runbook documentation
- ✅ Alert thresholds
- ✅ On-call rotation

---

## Security Checklist

**Pre-Production:**

- [ ] All secrets in environment variables (never hardcoded)
- [ ] HTTPS enforced (HSTS header set)
- [ ] Database encryption enabled
- [ ] Row-level security enabled on all tables
- [ ] JWT validation on all protected routes
- [ ] Input validation with Zod on all endpoints
- [ ] Rate limiting configured
- [ ] CORS properly configured (no * for credentials)
- [ ] Security headers set (CSP, X-Frame-Options, etc.)
- [ ] Dependencies audited (`pnpm audit`)
- [ ] No console.log of sensitive data
- [ ] Error messages don't leak internals

**Ongoing:**

- [ ] Monthly dependency updates
- [ ] Quarterly security audit
- [ ] Secrets rotation every 30 days
- [ ] Backup verification (monthly restore test)
- [ ] Penetration testing (annually)
- [ ] Access review (quarterly)

**Incident:**

- [ ] Security incident response plan documented
- [ ] On-call contact list updated
- [ ] Incident postmortem template ready
- [ ] Communication plan for data breaches

