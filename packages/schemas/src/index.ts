import { z } from 'zod';

export const RoleSchema = z.enum(['owner', 'admin', 'editor', 'reviewer', 'viewer']);
export type Role = z.infer<typeof RoleSchema>;

export const ProjectStatusSchema = z.enum(['draft', 'active', 'archived', 'won', 'lost']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ReqKindSchema = z.enum([
  'functional',
  'non_functional',
  'constraint',
  'assumption',
  'out_of_scope',
]);
export type ReqKind = z.infer<typeof ReqKindSchema>;

export const MoscowSchema = z.enum(['must', 'should', 'could', 'wont']);
export type Moscow = z.infer<typeof MoscowSchema>;

export const SpecStatusSchema = z.enum(['draft', 'review', 'approved', 'archived']);
export type SpecStatus = z.infer<typeof SpecStatusSchema>;

export const SuggestionStateSchema = z.enum(['pending', 'accepted', 'rejected']);
export type SuggestionState = z.infer<typeof SuggestionStateSchema>;

export const SourceRefSchema = z.object({
  kind: z.enum(['transcript', 'email', 'rfp', 'brief', 'manual']),
  ref: z.string(),
  label: z.string().optional(),
  timestamp: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const RequirementSchema = z.object({
  id: z.string(),
  specId: z.string(),
  key: z.string(),
  kind: ReqKindSchema,
  title: z.string().min(1),
  body: z.string(),
  priority: MoscowSchema,
  ambiguityScore: z.number().min(0).max(1).default(0),
  openQuestions: z.array(z.string()).default([]),
  sourceRefs: z.array(SourceRefSchema).default([]),
  order: z.number().int().nonnegative().default(0),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const AcceptanceCriterionSchema = z.object({
  given: z.string(),
  when: z.string(),
  then: z.string(),
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

export const EstimateSchema = z.object({
  points: z.number().int().positive(),
  confidence: z.enum(['low', 'med', 'high']),
  basis: z.string(),
});
export type Estimate = z.infer<typeof EstimateSchema>;

export const ExternalRefSchema = z.object({
  provider: z.enum(['linear', 'trello', 'jira']),
  id: z.string(),
  url: z.string().url(),
  syncedAt: z.string().datetime(),
  status: z.string().optional(),
});
export type ExternalRef = z.infer<typeof ExternalRefSchema>;

export const StorySchema = z.object({
  id: z.string(),
  specId: z.string(),
  requirementId: z.string(),
  asA: z.string().min(1),
  iWant: z.string().min(1),
  soThat: z.string().min(1),
  criteria: z.array(AcceptanceCriterionSchema).default([]),
  estimate: EstimateSchema.optional(),
  labels: z.array(z.string()).default([]),
  milestoneId: z.string().optional(),
  external: ExternalRefSchema.optional(),
});
export type Story = z.infer<typeof StorySchema>;

export const SpecVersionSnapshotSchema = z.object({
  requirements: z.array(RequirementSchema),
  stories: z.array(StorySchema).default([]),
});
export type SpecVersionSnapshot = z.infer<typeof SpecVersionSnapshotSchema>;

export const DiffChangeSchema = z.object({
  field: z.string(),
  before: z.unknown(),
  after: z.unknown(),
});
export type DiffChange = z.infer<typeof DiffChangeSchema>;

export const StructuralDiffSchema = z.object({
  added: z.array(z.string()),
  removed: z.array(z.string()),
  modified: z.array(
    z.object({
      id: z.string(),
      changes: z.array(DiffChangeSchema),
    }),
  ),
  moved: z.array(
    z.object({
      id: z.string(),
      fromOrder: z.number(),
      toOrder: z.number(),
    }),
  ),
});
export type StructuralDiff = z.infer<typeof StructuralDiffSchema>;

export const OrgSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  plan: z.string().default('free'),
  createdAt: z.string().datetime(),
});
export type Org = z.infer<typeof OrgSchema>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  image: z.string().url().nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const MembershipSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  userId: z.string(),
  role: RoleSchema,
});
export type Membership = z.infer<typeof MembershipSchema>;

export const WorkspaceSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string().min(1),
  themeTokens: z.record(z.unknown()).nullable(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

// Auth DTOs
export const DevLoginDtoSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name required').optional(),
  orgName: z.string().min(1, 'Org name required').optional(),
});
export type DevLoginDto = z.infer<typeof DevLoginDtoSchema>;

export const AuthTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
  }),
  org: z.object({
    id: z.string(),
    name: z.string(),
  }),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
  }),
  role: RoleSchema,
});
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;

export const RefreshTokenDtoSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token required'),
});
export type RefreshTokenDto = z.infer<typeof RefreshTokenDtoSchema>;

export const RefreshTokenResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
});
export type RefreshTokenResponse = z.infer<typeof RefreshTokenResponseSchema>;

export const CurrentUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  orgId: z.string(),
  role: RoleSchema,
  workspaceId: z.string(),
});
export type CurrentUser = z.infer<typeof CurrentUserSchema>;

// Org DTOs
export const CreateOrgDtoSchema = z.object({
  name: z.string().min(1, 'Name required').max(255),
  slug: z.string().min(1, 'Slug required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
});
export type CreateOrgDto = z.infer<typeof CreateOrgDtoSchema>;

export const UpdateOrgDtoSchema = z.object({
  name: z.string().min(1, 'Name required').max(255).optional(),
  plan: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});
export type UpdateOrgDto = z.infer<typeof UpdateOrgDtoSchema>;

export const OrgDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
  plan: z.string(),
  createdAt: z.string().datetime(),
  settings: z.record(z.unknown()).optional(),
  memberCount: z.number().optional(),
});
export type OrgDetail = z.infer<typeof OrgDetailSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  workspaceId: z.string(),
  name: z.string().min(1),
  clientName: z.string().nullable(),
  status: ProjectStatusSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const BriefKindSchema = z.enum(['text', 'file', 'transcript', 'voice']);
export type BriefKind = z.infer<typeof BriefKindSchema>;

export const BriefSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  projectId: z.string(),
  kind: BriefKindSchema,
  raw: z.string(),
  storageKey: z.string().nullable(),
});
export type Brief = z.infer<typeof BriefSchema>;

export const SpecSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  projectId: z.string(),
  title: z.string().min(1),
  status: SpecStatusSchema,
  currentVersion: z.number().int().nonnegative(),
});
export type Spec = z.infer<typeof SpecSchema>;

export const SpecVersionSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  specId: z.string(),
  version: z.number().int().positive(),
  hash: z.string(),
  snapshot: SpecVersionSnapshotSchema,
  summary: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
});
export type SpecVersion = z.infer<typeof SpecVersionSchema>;

export const SuggestionSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  specId: z.string(),
  target: z.string(),
  payload: z.record(z.unknown()),
  state: SuggestionStateSchema,
  aiRunId: z.string(),
  feedback: z.string().nullable(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const AiRunStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'degraded',
]);
export type AiRunStatus = z.infer<typeof AiRunStatusSchema>;

export const AiRunSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  kind: z.string(),
  template: z.string(),
  model: z.string(),
  status: AiRunStatusSchema,
  promptTokens: z.number().int().nullable(),
  completionTokens: z.number().int().nullable(),
  costUsd: z.number().nullable(),
  latencyMs: z.number().int().nullable(),
  error: z.string().nullable(),
});
export type AiRun = z.infer<typeof AiRunSchema>;

export const AuditLogSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  actorId: z.string().nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  beforeHash: z.string().nullable(),
  afterHash: z.string().nullable(),
  ip: z.string().nullable(),
  ua: z.string().nullable(),
  at: z.string().datetime(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

/** LLM structured output: requirements generated from a brief */
export const GeneratedRequirementSchema = z.object({
  kind: ReqKindSchema,
  title: z.string().min(1),
  body: z.string(),
  priority: MoscowSchema,
  openQuestions: z.array(z.string()).default([]),
  sourceRefs: z.array(SourceRefSchema).default([]),
});
export type GeneratedRequirement = z.infer<typeof GeneratedRequirementSchema>;

export const SpecFromBriefOutputSchema = z.object({
  title: z.string().min(1),
  requirements: z.array(GeneratedRequirementSchema).min(1),
});
export type SpecFromBriefOutput = z.infer<typeof SpecFromBriefOutputSchema>;

/** Payload published to the ai-generation queue */
export const AiJobPayloadSchema = z.object({
  runId: z.string(),
  orgId: z.string(),
  projectId: z.string(),
  briefId: z.string(),
  specId: z.string(),
  template: z.string(),
});
export type AiJobPayload = z.infer<typeof AiJobPayloadSchema>;

export * from './theme.js';
