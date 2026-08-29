# SpecForge API Documentation

Complete REST API specification for SpecForge backend.

---

## Base URL

```
Development:  http://localhost:3001/api/v1
Production:   https://api.specforge.app/api/v1
```

---

## Authentication

All endpoints require Bearer token authentication:

```
Authorization: Bearer <JWT_TOKEN>
```

**Token Format:**
- Algorithm: RS256 (RSA)
- Expiry: 15 minutes
- Refresh: Use refresh token to get new access token
- Storage: HttpOnly cookie + Authorization header

**Obtaining a Token:**

Development:
```bash
curl -X POST http://localhost:3001/api/v1/auth/dev-login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJSUzI1NiIs...",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "orgId": "org-123"
  }
}
```

Production (OAuth):
```bash
# Google
GET /api/v1/auth/google/callback?code=xxx

# GitHub
GET /api/v1/auth/github/callback?code=xxx

# Magic Link
POST /api/v1/auth/magic-link \
  -d '{"email":"user@example.com"}'
```

---

## Error Handling

All errors follow consistent format:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [
    {
      "field": "title",
      "error": "Too short (minimum 3 characters)"
    }
  ],
  "traceId": "req-123-456"
}
```

**Status Codes:**

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (invalid token) |
| 403 | Forbidden (no permission) |
| 404 | Not Found |
| 409 | Conflict (duplicate, already exists) |
| 422 | Unprocessable Entity (business logic error) |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |

---

## Rate Limiting

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1630000000
```

Limits:
- **Global:** 100 requests per minute per IP
- **Per User:** 500 requests per hour per user
- **Per Endpoint:** Varies (see endpoint docs)

---

## Pagination

For list endpoints, use query parameters:

```
GET /api/v1/specs?page=1&limit=20&sort=-createdAt
```

Response:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

## Endpoints

### Authentication

#### Dev Login
```
POST /api/v1/auth/dev-login
```

*Development only. Creates/logs in user.*

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:** `200 OK`
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "orgId": "org-123"
  }
}
```

#### Refresh Token
```
POST /api/v1/auth/refresh
```

*Get new access token using refresh token.*

**Request:**
```json
{
  "refreshToken": "..."
}
```

**Response:** `200 OK`
```json
{
  "accessToken": "...",
  "expiresIn": 900
}
```

#### Logout
```
POST /api/v1/auth/logout
```

*Invalidate session.*

**Response:** `204 No Content`

---

### Organizations

#### List Organizations
```
GET /api/v1/orgs
```

*List all organizations for current user.*

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `sort`: Sort field (e.g., -createdAt)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "org-123",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "createdAt": "2025-08-29T00:00:00Z",
      "members": 5
    }
  ],
  "pagination": {}
}
```

#### Create Organization
```
POST /api/v1/orgs
```

*Create new organization.*

**Request:**
```json
{
  "name": "Acme Corp",
  "slug": "acme-corp"
}
```

**Response:** `201 Created`
```json
{
  "id": "org-123",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "createdAt": "2025-08-29T00:00:00Z"
}
```

#### Get Organization
```
GET /api/v1/orgs/:orgId
```

*Get organization details.*

**Response:** `200 OK`
```json
{
  "id": "org-123",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "createdAt": "2025-08-29T00:00:00Z",
  "settings": {
    "aiMonthlyBudget": 5000,
    "timezone": "UTC"
  }
}
```

#### Update Organization
```
PATCH /api/v1/orgs/:orgId
```

*Update organization settings.*

**Request:**
```json
{
  "name": "Acme Corp Updated",
  "settings": {
    "aiMonthlyBudget": 10000
  }
}
```

**Response:** `200 OK`
```json
{
  "id": "org-123",
  "name": "Acme Corp Updated"
}
```

#### Delete Organization
```
DELETE /api/v1/orgs/:orgId
```

*Delete organization (soft delete, 30-day retention).*

**Response:** `204 No Content`

---

### Projects

#### List Projects
```
GET /api/v1/projects
```

*List all projects in org.*

**Query Parameters:**
- `page`: Page number
- `limit`: Items per page
- `filter`: Status (active, archived)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "proj-123",
      "name": "Platform Redesign",
      "description": "...",
      "status": "active",
      "createdAt": "2025-08-29T00:00:00Z"
    }
  ],
  "pagination": {}
}
```

#### Create Project
```
POST /api/v1/projects
```

*Create new project.*

**Request:**
```json
{
  "name": "Platform Redesign",
  "description": "Modernize platform UI",
  "template": "software-project"
}
```

**Response:** `201 Created`
```json
{
  "id": "proj-123",
  "name": "Platform Redesign",
  "createdAt": "2025-08-29T00:00:00Z"
}
```

#### Get Project
```
GET /api/v1/projects/:projectId
```

**Response:** `200 OK`
```json
{
  "id": "proj-123",
  "name": "Platform Redesign",
  "specs": 5,
  "requirements": 42,
  "stories": 18
}
```

#### Update Project
```
PATCH /api/v1/projects/:projectId
```

**Response:** `200 OK`

#### Delete Project
```
DELETE /api/v1/projects/:projectId
```

**Response:** `204 No Content`

---

### Specs

#### List Specs
```
GET /api/v1/specs
```

*List all specs in project.*

**Query Parameters:**
- `projectId`: Filter by project (required or implied from context)
- `status`: draft, published, archived
- `page`, `limit`, `sort`

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "spec-123",
      "title": "User Authentication System",
      "projectId": "proj-123",
      "status": "published",
      "version": 3,
      "createdAt": "2025-08-29T00:00:00Z",
      "updatedAt": "2025-08-30T00:00:00Z"
    }
  ],
  "pagination": {}
}
```

#### Create Spec
```
POST /api/v1/specs
```

*Create new spec.*

**Request:**
```json
{
  "title": "User Authentication System",
  "projectId": "proj-123",
  "tags": ["auth", "security"],
  "description": "OAuth2 + JWT implementation"
}
```

**Response:** `201 Created`
```json
{
  "id": "spec-123",
  "title": "User Authentication System",
  "status": "draft",
  "version": 1
}
```

#### Get Spec
```
GET /api/v1/specs/:specId
```

*Get spec with full content.*

**Query Parameters:**
- `version`: Get specific version (default: latest)

**Response:** `200 OK`
```json
{
  "id": "spec-123",
  "title": "User Authentication System",
  "status": "published",
  "version": 3,
  "content": {
    "overview": "...",
    "requirements": [...],
    "acceptance_criteria": [...]
  },
  "versions": [
    {
      "version": 3,
      "createdAt": "2025-08-30T00:00:00Z",
      "author": "user-123"
    },
    {
      "version": 2,
      "createdAt": "2025-08-29T12:00:00Z"
    }
  ]
}
```

#### Update Spec
```
PATCH /api/v1/specs/:specId
```

*Update spec content (creates new draft version).*

**Request:**
```json
{
  "title": "User Authentication System v2",
  "content": {
    "overview": "Updated overview..."
  }
}
```

**Response:** `200 OK`
```json
{
  "id": "spec-123",
  "version": 4,
  "status": "draft"
}
```

#### Publish Spec
```
POST /api/v1/specs/:specId/publish
```

*Publish spec (creates immutable version).*

**Request:**
```json
{
  "notes": "Ready for implementation"
}
```

**Response:** `200 OK`
```json
{
  "id": "spec-123",
  "version": 4,
  "status": "published",
  "publishedAt": "2025-08-30T10:30:00Z"
}
```

#### Generate Spec
```
POST /api/v1/specs/:specId/generate
```

*Generate spec from brief using AI.*

**Request:**
```json
{
  "briefId": "brief-123",
  "model": "gpt-4o",
  "template": "spec.fromBrief@v1"
}
```

**Response:** `202 Accepted`
```json
{
  "runId": "run-123",
  "status": "queued",
  "estimatedTime": "60 seconds"
}
```

#### Get AI Run Status
```
GET /api/v1/specs/:specId/runs/:runId
```

*Poll for generation status.*

**Response:** `200 OK`
```json
{
  "id": "run-123",
  "status": "completed",
  "tokenUsage": {
    "input": 1250,
    "output": 3400
  },
  "costUsd": 0.15,
  "result": {
    "title": "Generated Spec",
    "content": {}
  }
}
```

#### Delete Spec
```
DELETE /api/v1/specs/:specId
```

**Response:** `204 No Content`

---

### Stories (Backlog)

#### List Stories
```
GET /api/v1/stories
```

*List all stories in project.*

**Query Parameters:**
- `projectId`: Filter by project
- `status`: backlog, selected_for_dev, in_progress, in_review, done, blocked
- `assignee`: Filter by assignee
- `page`, `limit`

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "story-123",
      "requirementId": "req-123",
      "title": "As a user, I can login with OAuth",
      "status": "in_progress",
      "estimate": {
        "points": 8,
        "confidence": "high"
      },
      "assignee": "user-456"
    }
  ],
  "pagination": {}
}
```

#### Create Story
```
POST /api/v1/stories
```

*Create story from requirement.*

**Request:**
```json
{
  "requirementId": "req-123",
  "title": "As a user, I can login with OAuth",
  "acceptanceCriteria": [
    {
      "kind": "gherkin",
      "text": "Given I'm on the login page\nWhen I click 'Login with Google'\nThen I'm redirected to OAuth flow"
    }
  ]
}
```

**Response:** `201 Created`
```json
{
  "id": "story-123",
  "requirementId": "req-123",
  "status": "backlog",
  "estimate": null
}
```

#### Update Story
```
PATCH /api/v1/stories/:storyId
```

**Request:**
```json
{
  "status": "in_progress",
  "estimate": {
    "unit": "story_points",
    "value": 8,
    "confidence": "high"
  },
  "assignee": "user-456"
}
```

**Response:** `200 OK`

#### Complete Story
```
POST /api/v1/stories/:storyId/complete
```

*Mark story as done.*

**Response:** `200 OK`
```json
{
  "id": "story-123",
  "status": "done",
  "completedAt": "2025-08-30T15:00:00Z"
}
```

---

### Diagrams (Visual Documentation)

#### List Diagrams
```
GET /api/v1/diagrams
```

*List all diagrams in project.*

**Query Parameters:**
- `projectId`: Filter by project
- `kind`: user_journey, system_context, sequence, erd, phase_map

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "diagram-123",
      "title": "User Journey: Login Flow",
      "kind": "user_journey",
      "createdAt": "2025-08-29T00:00:00Z"
    }
  ]
}
```

#### Create Diagram
```
POST /api/v1/diagrams
```

*Create diagram (generates Mermaid source & SVG).*

**Request:**
```json
{
  "title": "System Context",
  "kind": "system_context",
  "projectId": "proj-123",
  "description": "High-level system architecture"
}
```

**Response:** `201 Created`
```json
{
  "id": "diagram-123",
  "source": "graph TB\n...",
  "svg": "<svg>...</svg>"
}
```

#### Get Diagram
```
GET /api/v1/diagrams/:diagramId
```

**Response:** `200 OK`
```json
{
  "id": "diagram-123",
  "title": "System Context",
  "kind": "system_context",
  "source": "graph TB\n...",
  "svg": "<svg>...</svg>"
}
```

---

### Deal Rooms (Stakeholder Collaboration)

#### List Deal Rooms
```
GET /api/v1/deal-rooms
```

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "room-123",
      "slug": "acme-platform-redesign",
      "title": "Platform Redesign Proposal",
      "status": "pending_approval",
      "createdAt": "2025-08-29T00:00:00Z"
    }
  ]
}
```

#### Create Deal Room
```
POST /api/v1/deal-rooms
```

*Create deal room with sections.*

**Request:**
```json
{
  "slug": "acme-platform",
  "title": "Platform Redesign",
  "sections": [
    {
      "name": "Overview",
      "kind": "overview",
      "content": ""
    },
    {
      "name": "Timeline",
      "kind": "timeline",
      "content": ""
    }
  ],
  "password": "optional-password",
  "requiresApproval": true,
  "expiresAt": "2025-09-29T00:00:00Z"
}
```

**Response:** `201 Created`
```json
{
  "id": "room-123",
  "slug": "acme-platform",
  "shareLink": "https://deal.specforge.app/room/acme-platform/share-token-xxx"
}
```

#### Get Deal Room
```
GET /api/v1/deal-rooms/:roomId
```

*Public endpoint (requires password if protected).*

**Query Parameters:**
- `token`: Share link token (if using share link)
- `password`: Password (if protected)

**Response:** `200 OK`
```json
{
  "id": "room-123",
  "sections": [...],
  "comments": [...],
  "approvals": [...]
}
```

#### Submit Approval
```
POST /api/v1/deal-rooms/:roomId/approve
```

*Sign off on deal room.*

**Request:**
```json
{
  "signatureBase64": "data:image/png;base64,..."
}
```

**Response:** `200 OK`
```json
{
  "approvedBy": "user-123",
  "approvedAt": "2025-08-30T10:00:00Z"
}
```

---

### Integrations

#### List Integrations
```
GET /api/v1/integrations
```

*List connected integrations.*

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "cred-123",
      "provider": "linear",
      "status": "connected",
      "lastSync": "2025-08-30T10:00:00Z"
    }
  ]
}
```

#### Connect Integration
```
POST /api/v1/integrations/connect
```

*Start OAuth flow or paste credentials.*

**Request:**
```json
{
  "provider": "linear",
  "authCode": "oauth-code-from-provider"
}
```

**Response:** `201 Created`
```json
{
  "id": "cred-123",
  "provider": "linear",
  "status": "connected"
}
```

#### Disconnect Integration
```
DELETE /api/v1/integrations/:integrationId
```

**Response:** `204 No Content`

#### Push Stories
```
POST /api/v1/integrations/:integrationId/push
```

*Push stories to external tracker.*

**Request:**
```json
{
  "storyIds": ["story-123", "story-456"],
  "targetProject": "PROJ-1"
}
```

**Response:** `202 Accepted`
```json
{
  "jobId": "push-123",
  "status": "in_progress",
  "estimatedTime": "30 seconds"
}
```

#### Get Push Job Status
```
GET /api/v1/integrations/:integrationId/push/:jobId
```

**Response:** `200 OK`
```json
{
  "id": "push-123",
  "status": "completed",
  "successful": 2,
  "failed": 0,
  "results": [
    {
      "storyId": "story-123",
      "externalId": "LINEAR-123",
      "status": "success"
    }
  ]
}
```

---

## WebSocket Subscriptions (Real-time Updates)

Connect to WebSocket for real-time updates:

```
wss://api.specforge.app/api/v1/ws
```

**Subscribe to spec changes:**
```json
{
  "action": "subscribe",
  "resource": "spec",
  "resourceId": "spec-123"
}
```

**Receive updates:**
```json
{
  "type": "spec.updated",
  "data": {
    "id": "spec-123",
    "version": 4,
    "timestamp": "2025-08-30T10:00:00Z"
  }
}
```

---

## Batch Operations

### Bulk Update Stories
```
POST /api/v1/stories/bulk-update
```

**Request:**
```json
{
  "storyIds": ["story-123", "story-456"],
  "updates": {
    "status": "in_progress",
    "assignee": "user-789"
  }
}
```

**Response:** `200 OK`
```json
{
  "updated": 2,
  "results": [...]
}
```

### Export Spec as PDF
```
GET /api/v1/specs/:specId/export?format=pdf
```

**Response:** `200 OK` (PDF file)

### Generate Delivery Plan
```
POST /api/v1/delivery-plans
```

*AI-generated timeline and budget.*

**Request:**
```json
{
  "projectId": "proj-123",
  "stories": ["story-123", "story-456"],
  "teamSize": 3,
  "velocityPointsPerWeek": 20
}
```

**Response:** `202 Accepted`
```json
{
  "planId": "plan-123",
  "status": "generating"
}
```

---

## Webhooks

Configure webhooks for events:

```
POST /api/v1/webhooks
```

**Request:**
```json
{
  "url": "https://example.com/webhook",
  "events": ["spec.published", "story.completed"],
  "secret": "webhook-secret"
}
```

**Payload Format:**
```json
{
  "event": "spec.published",
  "timestamp": "2025-08-30T10:00:00Z",
  "data": {
    "specId": "spec-123",
    "version": 3
  },
  "signature": "sha256=..."
}
```

---

## SDK & Client Libraries

### TypeScript/JavaScript

```bash
npm install @specforge/client
```

```typescript
import { SpecForgeClient } from '@specforge/client'

const client = new SpecForgeClient({
  apiUrl: 'https://api.specforge.app/api/v1',
  token: 'access-token'
})

// List specs
const specs = await client.specs.list({ projectId: 'proj-123' })

// Create spec
const spec = await client.specs.create({
  title: 'New Spec',
  projectId: 'proj-123'
})

// Subscribe to changes
client.subscribe('spec', 'spec-123', (update) => {
  console.log('Spec updated:', update)
})
```

---

## Rate Limiting & Quotas

**Free Tier**
- 1,000 API requests/month
- 1 project
- AI generation: disabled

**Pro Tier** ($99/month)
- 100,000 API requests/month
- 10 projects
- AI generation: $0.01 per 1k tokens

**Enterprise** (custom)
- Unlimited API requests
- Custom projects
- Custom AI pricing

---

## Changelog

### v1.0.0 (2025-08-30)
- Initial public API release
- Specs, Stories, Diagrams endpoints
- Deal Rooms, Integrations
- WebSocket support

---

*For support, email api@specforge.app or visit docs.specforge.app*
