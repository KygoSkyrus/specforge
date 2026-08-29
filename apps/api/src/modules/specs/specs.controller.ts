import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard';
import { PolicyService } from '../auth/policy.service';
import {
  ambiguityHeuristics,
  assignRequirementKey,
  diffSnapshots,
  hashSnapshot,
  publishVersion,
} from '@specforge/domain';
import type { Requirement, SpecVersionSnapshot } from '@specforge/schemas';
import { z } from 'zod';

const UpdateRequirementDto = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  priority: z.enum(['must', 'should', 'could', 'wont']).optional(),
  kind: z
    .enum(['functional', 'non_functional', 'constraint', 'assumption', 'out_of_scope'])
    .optional(),
  order: z.number().int().nonnegative().optional(),
  openQuestions: z.array(z.string()).optional(),
});

const CreateRequirementDto = UpdateRequirementDto.pick({
  title: true,
  body: true,
  priority: true,
  kind: true,
  openQuestions: true,
}).extend({
  title: z.string().min(1),
  body: z.string().min(1),
  priority: z.enum(['must', 'should', 'could', 'wont']),
  kind: z.enum(['functional', 'non_functional', 'constraint', 'assumption', 'out_of_scope']),
});

const SuggestionDecisionDto = z.object({
  feedback: z.string().optional(),
});

type RequirementRow = Omit<Requirement, 'openQuestions' | 'sourceRefs'> & {
  openQuestions: unknown;
  sourceRefs: unknown;
};

function toSnapshot(requirements: RequirementRow[]): SpecVersionSnapshot {
  return {
    requirements: requirements.map((r) => ({
      id: r.id,
      specId: r.specId,
      key: r.key,
      kind: r.kind,
      title: r.title,
      body: r.body,
      priority: r.priority,
      ambiguityScore: r.ambiguityScore,
      openQuestions: Array.isArray(r.openQuestions) ? (r.openQuestions as string[]) : [],
      sourceRefs: Array.isArray(r.sourceRefs) ? r.sourceRefs : [],
      order: r.order,
    })),
    stories: [],
  };
}

@Controller()
@UseGuards(AuthGuard)
export class SpecsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
  ) {}

  private abilityFor(user: AuthUser) {
    return this.policy.defineAbilityFor({
      role: user.role,
      orgId: user.orgId,
      userId: user.id,
    });
  }

  @Get('specs/:id')
  async getSpec(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.policy.assertCan(this.abilityFor(user), 'read', 'Spec');

    return this.prisma.withTenant({ orgId: user.orgId }, async (tx) => {
      const spec = await tx.spec.findFirst({
        where: { id, orgId: user.orgId },
        include: {
          requirements: { orderBy: { order: 'asc' } },
          versions: {
            orderBy: { version: 'desc' },
            select: { id: true, version: true, hash: true, createdAt: true },
          },
        },
      });
      if (!spec) throw new NotFoundException('Spec not found');
      return { spec };
    });
  }

  @Post('specs/:id/requirements')
  async addRequirement(
    @CurrentUser() user: AuthUser,
    @Param('id') specId: string,
    @Body() body: unknown,
  ) {
    this.policy.assertCan(this.abilityFor(user), 'create', 'Requirement');

    const parsed = CreateRequirementDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid requirement');
    }
    const input = parsed.data;
    const ambiguity = ambiguityHeuristics({ title: input.title, body: input.body });

    return this.prisma.withTenant({ orgId: user.orgId }, async (tx) => {
      const spec = await tx.spec.findFirst({ where: { id: specId, orgId: user.orgId } });
      if (!spec) throw new NotFoundException('Spec not found');

      const existing = await tx.requirement.findMany({
        where: { specId, kind: input.kind },
        select: { key: true },
      });
      const key = assignRequirementKey(input.kind, existing.map((r) => r.key));
      const maxOrder = await tx.requirement.aggregate({
        where: { specId },
        _max: { order: true },
      });

      const requirement = await tx.requirement.create({
        data: {
          orgId: user.orgId,
          specId,
          key,
          kind: input.kind,
          title: input.title,
          body: input.body,
          priority: input.priority,
          ambiguityScore: ambiguity.score,
          openQuestions: input.openQuestions ?? [],
          sourceRefs: [{ kind: 'manual', ref: `user:${user.id}` }],
          order: (maxOrder._max.order ?? -1) + 1,
        },
      });
      return { requirement };
    });
  }

  @Patch('requirements/:id')
  async updateRequirement(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.policy.assertCan(this.abilityFor(user), 'update', 'Requirement');

    const parsed = UpdateRequirementDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid update');
    }
    const input = parsed.data;

    return this.prisma.withTenant({ orgId: user.orgId }, async (tx) => {
      const existing = await tx.requirement.findFirst({ where: { id, orgId: user.orgId } });
      if (!existing) throw new NotFoundException('Requirement not found');

      const nextTitle = input.title ?? existing.title;
      const nextBody = input.body ?? existing.body;
      const ambiguity =
        input.title !== undefined || input.body !== undefined
          ? ambiguityHeuristics({ title: nextTitle, body: nextBody })
          : null;

      const requirement = await tx.requirement.update({
        where: { id },
        data: {
          title: input.title,
          body: input.body,
          priority: input.priority,
          kind: input.kind,
          order: input.order,
          openQuestions:
            input.openQuestions !== undefined ? input.openQuestions : undefined,
          ...(ambiguity ? { ambiguityScore: ambiguity.score } : {}),
        },
      });
      return { requirement };
    });
  }

  /** Publish an immutable content-hashed snapshot of the current spec */
  @Post('specs/:id/versions')
  async publish(@CurrentUser() user: AuthUser, @Param('id') specId: string) {
    const ability = this.abilityFor(user);
    this.policy.assertCan(ability, 'publish', 'Spec');

    return this.prisma.withTenant({ orgId: user.orgId }, async (tx) => {
      const spec = await tx.spec.findFirst({
        where: { id: specId, orgId: user.orgId },
        include: { requirements: { orderBy: { order: 'asc' } } },
      });
      if (!spec) throw new NotFoundException('Spec not found');
      if (spec.requirements.length === 0) {
        throw new BadRequestException('Cannot publish an empty spec');
      }

      const snapshot = toSnapshot(spec.requirements);
      const published = publishVersion({
        specId,
        orgId: user.orgId,
        version: spec.currentVersion + 1,
        snapshot,
        createdBy: user.id,
      });

      const version = await tx.specVersion.create({
        data: {
          orgId: user.orgId,
          specId,
          version: published.version,
          hash: hashSnapshot(snapshot),
          snapshot: snapshot as unknown as object,
          summary: published.summary,
          createdBy: user.id,
        },
      });
      await tx.spec.update({
        where: { id: specId },
        data: { currentVersion: version.version, status: 'approved' },
      });

      await tx.auditLog.create({
        data: {
          orgId: user.orgId,
          actorId: user.id,
          action: 'spec.publish',
          resourceType: 'SpecVersion',
          resourceId: version.id,
          afterHash: version.hash,
        },
      });

      return { version };
    });
  }

  @Get('specs/:id/versions')
  async listVersions(@CurrentUser() user: AuthUser, @Param('id') specId: string) {
    this.policy.assertCan(this.abilityFor(user), 'read', 'Spec');

    return this.prisma.withTenant({ orgId: user.orgId }, async (tx) => {
      const versions = await tx.specVersion.findMany({
        where: { specId, orgId: user.orgId },
        orderBy: { version: 'desc' },
        select: { id: true, version: true, hash: true, summary: true, createdAt: true },
      });
      return { versions };
    });
  }

  @Get('specs/:id/versions/:a/diff/:b')
  async diffVersions(
    @CurrentUser() user: AuthUser,
    @Param('id') specId: string,
    @Param('a') a: string,
    @Param('b') b: string,
  ) {
    this.policy.assertCan(this.abilityFor(user), 'read', 'Spec');

    const beforeVersion = Number.parseInt(a, 10);
    const afterVersion = Number.parseInt(b, 10);
    if (Number.isNaN(beforeVersion) || Number.isNaN(afterVersion)) {
      throw new BadRequestException('Versions must be integers');
    }

    return this.prisma.withTenant({ orgId: user.orgId }, async (tx) => {
      const [before, after] = await Promise.all([
        tx.specVersion.findFirst({
          where: { specId, orgId: user.orgId, version: beforeVersion },
        }),
        tx.specVersion.findFirst({
          where: { specId, orgId: user.orgId, version: afterVersion },
        }),
      ]);
      if (!before || !after) throw new NotFoundException('Version not found');

      const diff = diffSnapshots(
        before.snapshot as unknown as SpecVersionSnapshot,
        after.snapshot as unknown as SpecVersionSnapshot,
      );
      return {
        from: { version: before.version, hash: before.hash },
        to: { version: after.version, hash: after.hash },
        diff,
      };
    });
  }

  @Get('specs/:id/suggestions')
  async listSuggestions(@CurrentUser() user: AuthUser, @Param('id') specId: string) {
    this.policy.assertCan(this.abilityFor(user), 'read', 'Suggestion');

    return this.prisma.withTenant({ orgId: user.orgId }, async (tx) => {
      const suggestions = await tx.suggestion.findMany({
        where: { specId, orgId: user.orgId },
        orderBy: { id: 'desc' },
      });
      return { suggestions };
    });
  }

  @Post('suggestions/:id/accept')
  async acceptSuggestion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.policy.assertCan(this.abilityFor(user), 'update', 'Suggestion');
    const parsed = SuggestionDecisionDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid request');
    }

    return this.prisma.withTenant({ orgId: user.orgId }, async (tx) => {
      const suggestion = await tx.suggestion.findFirst({
        where: { id, orgId: user.orgId },
      });
      if (!suggestion) throw new NotFoundException('Suggestion not found');
      if (suggestion.state !== 'pending') {
        throw new BadRequestException(`Suggestion already ${suggestion.state}`);
      }

      // Apply the suggested patch to its target requirement
      const payload = suggestion.payload as {
        requirementId?: string;
        patch?: Record<string, unknown>;
      };
      if (payload.requirementId && payload.patch) {
        const target = await tx.requirement.findFirst({
          where: { id: payload.requirementId, orgId: user.orgId, specId: suggestion.specId },
        });
        if (!target) throw new NotFoundException('Suggestion target not found');

        const patch = payload.patch as Partial<Requirement> & Record<string, unknown>;
        const nextTitle = typeof patch.title === 'string' ? patch.title : target.title;
        const nextBody = typeof patch.body === 'string' ? patch.body : target.body;
        const ambiguity = ambiguityHeuristics({ title: nextTitle, body: nextBody });

        await tx.requirement.update({
          where: { id: target.id },
          data: {
            title: nextTitle,
            body: nextBody,
            priority: typeof patch.priority === 'string' ? patch.priority : undefined,
            ambiguityScore: ambiguity.score,
          },
        });
      }

      const updated = await tx.suggestion.update({
        where: { id },
        data: { state: 'accepted', feedback: parsed.data.feedback ?? null },
      });

      await tx.auditLog.create({
        data: {
          orgId: user.orgId,
          actorId: user.id,
          action: 'suggestion.accept',
          resourceType: 'Suggestion',
          resourceId: id,
        },
      });

      return { suggestion: updated };
    });
  }

  @Post('suggestions/:id/reject')
  async rejectSuggestion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.policy.assertCan(this.abilityFor(user), 'update', 'Suggestion');
    const parsed = SuggestionDecisionDto.safeParse(body);

    return this.prisma.withTenant({ orgId: user.orgId }, async (tx) => {
      const suggestion = await tx.suggestion.findFirst({
        where: { id, orgId: user.orgId },
      });
      if (!suggestion) throw new NotFoundException('Suggestion not found');
      if (suggestion.state !== 'pending') {
        throw new BadRequestException(`Suggestion already ${suggestion.state}`);
      }

      const updated = await tx.suggestion.update({
        where: { id },
        data: {
          state: 'rejected',
          feedback: parsed.success ? (parsed.data.feedback ?? null) : null,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId: user.orgId,
          actorId: user.id,
          action: 'suggestion.reject',
          resourceType: 'Suggestion',
          resourceId: id,
        },
      });

      return { suggestion: updated };
    });
  }
}
