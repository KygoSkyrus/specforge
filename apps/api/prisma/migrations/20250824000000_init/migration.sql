-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'admin', 'editor', 'reviewer', 'viewer');
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'active', 'archived', 'won', 'lost');
CREATE TYPE "SpecStatus" AS ENUM ('draft', 'review', 'approved', 'archived');
CREATE TYPE "SuggestionState" AS ENUM ('pending', 'accepted', 'rejected');
CREATE TYPE "BriefKind" AS ENUM ('text', 'file', 'transcript', 'voice');
CREATE TYPE "ReqKind" AS ENUM ('functional', 'non_functional', 'constraint', 'assumption', 'out_of_scope');
CREATE TYPE "Moscow" AS ENUM ('must', 'should', 'could', 'wont');

-- CreateTable
CREATE TABLE "orgs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "orgs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'viewer',
    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "themeTokens" JSONB,
    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "briefs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "BriefKind" NOT NULL,
    "raw" TEXT NOT NULL,
    "storageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "briefs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "specs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SpecStatus" NOT NULL DEFAULT 'draft',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "specs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spec_versions" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "specId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "summary" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "spec_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "requirements" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "specId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "ReqKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" "Moscow" NOT NULL,
    "ambiguityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openQuestions" JSONB NOT NULL DEFAULT '[]',
    "sourceRefs" JSONB NOT NULL DEFAULT '[]',
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suggestions" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "specId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "state" "SuggestionState" NOT NULL DEFAULT 'pending',
    "aiRunId" TEXT NOT NULL,
    "feedback" TEXT,
    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_runs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "specId" TEXT,
    "kind" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "costUsd" DECIMAL(10,6),
    "latencyMs" INTEGER,
    "error" TEXT,
    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "beforeHash" TEXT,
    "afterHash" TEXT,
    "ip" TEXT,
    "ua" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");
CREATE UNIQUE INDEX "memberships_orgId_userId_key" ON "memberships"("orgId", "userId");
CREATE INDEX "memberships_orgId_idx" ON "memberships"("orgId");
CREATE INDEX "workspaces_orgId_idx" ON "workspaces"("orgId");
CREATE INDEX "projects_orgId_idx" ON "projects"("orgId");
CREATE INDEX "projects_workspaceId_idx" ON "projects"("workspaceId");
CREATE INDEX "briefs_orgId_idx" ON "briefs"("orgId");
CREATE INDEX "briefs_projectId_idx" ON "briefs"("projectId");
CREATE INDEX "specs_orgId_idx" ON "specs"("orgId");
CREATE INDEX "specs_projectId_idx" ON "specs"("projectId");
CREATE UNIQUE INDEX "spec_versions_specId_version_key" ON "spec_versions"("specId", "version");
CREATE INDEX "spec_versions_orgId_idx" ON "spec_versions"("orgId");
CREATE UNIQUE INDEX "requirements_specId_key_key" ON "requirements"("specId", "key");
CREATE INDEX "requirements_orgId_idx" ON "requirements"("orgId");
CREATE INDEX "requirements_specId_idx" ON "requirements"("specId");
CREATE INDEX "suggestions_orgId_idx" ON "suggestions"("orgId");
CREATE INDEX "suggestions_specId_idx" ON "suggestions"("specId");
CREATE INDEX "ai_runs_orgId_idx" ON "ai_runs"("orgId");
CREATE INDEX "audit_logs_orgId_idx" ON "audit_logs"("orgId");
CREATE INDEX "audit_logs_at_idx" ON "audit_logs"("at");

-- Foreign Keys
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "specs" ADD CONSTRAINT "specs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "spec_versions" ADD CONSTRAINT "spec_versions_specId_fkey" FOREIGN KEY ("specId") REFERENCES "specs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_specId_fkey" FOREIGN KEY ("specId") REFERENCES "specs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_specId_fkey" FOREIGN KEY ("specId") REFERENCES "specs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "ai_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_specId_fkey" FOREIGN KEY ("specId") REFERENCES "specs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE spec_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON memberships USING ("orgId" = current_setting('app.org_id', true));
CREATE POLICY tenant_isolation ON workspaces USING ("orgId" = current_setting('app.org_id', true));
CREATE POLICY tenant_isolation ON projects USING ("orgId" = current_setting('app.org_id', true));
CREATE POLICY tenant_isolation ON briefs USING ("orgId" = current_setting('app.org_id', true));
CREATE POLICY tenant_isolation ON specs USING ("orgId" = current_setting('app.org_id', true));
CREATE POLICY tenant_isolation ON spec_versions USING ("orgId" = current_setting('app.org_id', true));
CREATE POLICY tenant_isolation ON requirements USING ("orgId" = current_setting('app.org_id', true));
CREATE POLICY tenant_isolation ON suggestions USING ("orgId" = current_setting('app.org_id', true));
CREATE POLICY tenant_isolation ON ai_runs USING ("orgId" = current_setting('app.org_id', true));
CREATE POLICY tenant_isolation ON audit_logs USING ("orgId" = current_setting('app.org_id', true));
