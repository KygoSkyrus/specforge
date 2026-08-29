import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AiQueueService } from '../../infrastructure/queue/ai-queue.service';
import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard';
import { PolicyService } from '../auth/policy.service';
import { resolveModel, resolveModelTier } from '@specforge/prompts';
import { z } from 'zod';

interface CreateProjectDto {
  workspaceId: string;
  name: string;
  clientName?: string;
}

const CreateBriefDto = z.object({
  kind: z.enum(['text', 'file', 'transcript', 'voice']).optional().default('text'),
  raw: z.string().min(1, 'Brief text is required'),
});

const GenerateSpecDto = z
  .object({
    briefId: z.string().optional(),
    raw: z.string().min(1).optional(),
    kind: z.enum(['text', 'file', 'transcript', 'voice']).optional(),
  })
  .refine((v) => v.briefId !== undefined || v.raw !== undefined, {
    message: 'Either briefId or raw brief text is required',
  });

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly queue: AiQueueService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    this.policy.assertCan(
      this.policy.defineAbilityFor({ role: user.role, orgId: user.orgId, userId: user.id }),
      'read',
      'Project',
    );

    return this.prisma.withTenant({ orgId: user.orgId }, async (tx) => {
      const projects = await tx.project.findMany({
        where: { orgId: user.orgId },
        orderBy: { updatedAt: 'desc' },
      });
      return { projects };
    });
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateProjectDto) {
    this.policy.assertCan(
      this.policy.defineAbilityFor({ role: user.role, orgId: user.orgId, userId: user.id }),
      'create',
      'Project',
    );

    const project = await this.prisma.withTenant({ orgId: user.orgId }, async (tx) => {
      return tx.project.create({
        data: {
          orgId: user.orgId,
          workspaceId: body.workspaceId,
          name: body.name,
          clientName: body.clientName ?? null,
        },
      });
    });

    await this.prisma.auditLog.create({
      data: {
        orgId: user.orgId,
        actorId: user.id,
        action: 'project.create',
        resourceType: 'Project',
        resourceId: project.id,
      },
    });

    return { project };
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.prisma.withTenant({ orgId: user.orgId }, async (tx) => {
      const project = await tx.project.findFirst({
        where: { id, orgId: user.orgId },
        include: { specs: true },
      });
      if (!project) throw new NotFoundException('Project not found');
      return { project };
    });
  }

  @Post(':id/briefs')
  async createBrief(
    @CurrentUser() user: AuthUser,
    @Param('id') projectId: string,
    @Body() body: unknown,
  ) {
    const ability = this.policy.defineAbilityFor({
      role: user.role,
      orgId: user.orgId,
      userId: user.id,
    });
    this.policy.assertCan(ability, 'create', 'Brief');

    const parsed = CreateBriefDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid brief');
    }

    const brief = await this.prisma.withTenant({ orgId: user.orgId }, async (tx) => {
      const project = await tx.project.findFirst({ where: { id: projectId, orgId: user.orgId } });
      if (!project) throw new NotFoundException('Project not found');
      return tx.brief.create({
        data: {
          orgId: user.orgId,
          projectId,
          kind: parsed.data.kind,
          raw: parsed.data.raw,
        },
      });
    });

    return { brief };
  }

  /** Async spec generation: creates a draft spec + queued AiRun, returns runId for the SSE stream */
  @Post(':id/specs/generate')
  async generateSpec(
    @CurrentUser() user: AuthUser,
    @Param('id') projectId: string,
    @Body() body: unknown,
  ) {
    const ability = this.policy.defineAbilityFor({
      role: user.role,
      orgId: user.orgId,
      userId: user.id,
    });
    this.policy.assertCan(ability, 'create', 'Spec');

    const parsed = GenerateSpecDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid request');
    }
    const input = parsed.data;
    const template = 'spec.fromBrief@v1';
    const model = resolveModel(resolveModelTier('spec.fromBrief'));

    const { runId, specId, briefId } = await this.prisma.withTenant(
      { orgId: user.orgId },
      async (tx) => {
        const project = await tx.project.findFirst({ where: { id: projectId, orgId: user.orgId } });
        if (!project) throw new NotFoundException('Project not found');

        let briefId = input.briefId ?? null;
        if (!briefId && input.raw) {
          const brief = await tx.brief.create({
            data: {
              orgId: user.orgId,
              projectId,
              kind: input.kind ?? 'text',
              raw: input.raw,
            },
          });
          briefId = brief.id;
        } else if (briefId) {
          const existing = await tx.brief.findFirst({
            where: { id: briefId, projectId, orgId: user.orgId },
          });
          if (!existing) throw new NotFoundException('Brief not found');
        }
        if (!briefId) throw new NotFoundException('Brief not found');

        const spec = await tx.spec.create({
          data: { orgId: user.orgId, projectId, title: 'Untitled spec', status: 'draft' },
        });
        const run = await tx.aiRun.create({
          data: { orgId: user.orgId, specId: spec.id, kind: 'spec.generate', template, model, status: 'queued' },
        });
        return { runId: run.id, specId: spec.id, briefId };
      },
    );

    await this.queue.enqueueGeneration({
      runId,
      orgId: user.orgId,
      projectId,
      briefId,
      specId,
      template,
    });

    await this.prisma.auditLog.create({
      data: {
        orgId: user.orgId,
        actorId: user.id,
        action: 'spec.generate.queued',
        resourceType: 'Spec',
        resourceId: specId,
      },
    });

    return { runId, specId };
  }
}
