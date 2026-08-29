import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { CurrentUser } from '@specforge/schemas';
import type { CreateOrgDto, UpdateOrgDto, OrgDetail } from '@specforge/schemas';

@Injectable()
export class OrgsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all orgs for current user
   */
  async listOrgs(user: CurrentUser, page: number = 1, limit: number = 20): Promise<{
    data: OrgDetail[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const skip = (page - 1) * limit;

    // Get all orgs for user via memberships
    const total = await this.prisma.membership.count({
      where: { userId: user.id },
    });

    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id },
      include: { org: true },
      skip,
      take: limit,
      orderBy: { org: { createdAt: 'desc' } },
    });

    const data = memberships.map((m) => ({
      id: m.org.id,
      name: m.org.name,
      plan: m.org.plan,
      createdAt: m.org.createdAt.toISOString(),
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Create new org
   */
  async createOrg(user: CurrentUser, dto: CreateOrgDto): Promise<OrgDetail> {
    // Check if user is already owner of max orgs (prevent abuse)
    const ownedCount = await this.prisma.membership.count({
      where: { userId: user.id, role: 'owner' },
    });

    if (ownedCount >= 10) {
      throw new ConflictException('User has reached maximum number of organizations');
    }

    const org = await this.prisma.org.create({
      data: {
        name: dto.name,
      },
    });

    // Add user as owner
    await this.prisma.membership.create({
      data: {
        orgId: org.id,
        userId: user.id,
        role: 'owner',
      },
    });

    // Create default workspace
    await this.prisma.workspace.create({
      data: {
        orgId: org.id,
        name: 'Default Workspace',
      },
    });

    return {
      id: org.id,
      name: org.name,
      plan: org.plan,
      createdAt: org.createdAt.toISOString(),
    };
  }

  /**
   * Get org by ID
   */
  async getOrg(orgId: string, user: CurrentUser): Promise<OrgDetail> {
    // Verify user has access to org
    const membership = await this.prisma.membership.findUnique({
      where: { userId_orgId: { userId: user.id, orgId } },
    });

    if (!membership) {
      throw new ForbiddenException('Access denied to this organization');
    }

    const org = await this.prisma.org.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const memberCount = await this.prisma.membership.count({
      where: { orgId },
    });

    return {
      id: org.id,
      name: org.name,
      plan: org.plan,
      createdAt: org.createdAt.toISOString(),
      memberCount,
    };
  }

  /**
   * Update org
   */
  async updateOrg(orgId: string, user: CurrentUser, dto: UpdateOrgDto): Promise<OrgDetail> {
    // Verify user has owner role
    const membership = await this.prisma.membership.findUnique({
      where: { userId_orgId: { userId: user.id, orgId } },
    });

    if (!membership || membership.role !== 'owner') {
      throw new ForbiddenException('Only organization owners can update settings');
    }

    const org = await this.prisma.org.update({
      where: { id: orgId },
      data: {
        name: dto.name,
        plan: dto.plan,
      },
    });

    return {
      id: org.id,
      name: org.name,
      plan: org.plan,
      createdAt: org.createdAt.toISOString(),
    };
  }

  /**
   * Delete org (soft delete)
   */
  async deleteOrg(orgId: string, user: CurrentUser): Promise<void> {
    // Verify user has owner role
    const membership = await this.prisma.membership.findUnique({
      where: { userId_orgId: { userId: user.id, orgId } },
    });

    if (!membership || membership.role !== 'owner') {
      throw new ForbiddenException('Only organization owners can delete');
    }

    // Mark all resources as deleted/archived
    await this.prisma.org.update({
      where: { id: orgId },
      data: {
        // Soft delete by marking as archived
        plan: 'deleted',
      },
    });
  }
}
