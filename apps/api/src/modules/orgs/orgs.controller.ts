import { Controller, Get, Post, Patch, Delete, UseGuards, BadRequestException, HttpCode, HttpStatus, Body, Param, Query } from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { OrgsService } from './orgs.service';
import { CreateOrgDtoSchema, UpdateOrgDtoSchema, type CurrentUser as CurrentUserType } from '@specforge/schemas';
import type { OrgDetail } from '@specforge/schemas';

@Controller('orgs')
@UseGuards(AuthGuard)
export class OrgsController {
  constructor(private readonly orgsService: OrgsService) {}

  /**
   * List all organizations for current user
   */
  @Get()
  async listOrgs(
    @CurrentUser() user: CurrentUserType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 100) : 20;

    if (isNaN(pageNum) || pageNum < 1) {
      throw new BadRequestException('Invalid page number');
    }
    if (isNaN(limitNum) || limitNum < 1) {
      throw new BadRequestException('Invalid limit');
    }

    return this.orgsService.listOrgs(user, pageNum, limitNum);
  }

  /**
   * Create new organization
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrg(@CurrentUser() user: CurrentUserType, @Body() body: unknown): Promise<OrgDetail> {
    const validation = CreateOrgDtoSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new BadRequestException(`Validation failed: ${errors}`);
    }

    return this.orgsService.createOrg(user, validation.data);
  }

  /**
   * Get organization by ID
   */
  @Get(':orgId')
  async getOrg(@Param('orgId') orgId: string, @CurrentUser() user: CurrentUserType): Promise<OrgDetail> {
    return this.orgsService.getOrg(orgId, user);
  }

  /**
   * Update organization
   */
  @Patch(':orgId')
  async updateOrg(
    @Param('orgId') orgId: string,
    @CurrentUser() user: CurrentUserType,
    @Body() body: unknown,
  ): Promise<OrgDetail> {
    const validation = UpdateOrgDtoSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new BadRequestException(`Validation failed: ${errors}`);
    }

    return this.orgsService.updateOrg(orgId, user, validation.data);
  }

  /**
   * Delete organization
   */
  @Delete(':orgId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOrg(@Param('orgId') orgId: string, @CurrentUser() user: CurrentUserType): Promise<void> {
    return this.orgsService.deleteOrg(orgId, user);
  }

  /**
   * List workspaces in organization
   */
  @Get(':orgId/workspaces')
  async listWorkspaces(@Param('orgId') orgId: string, @CurrentUser() user: CurrentUserType) {
    // Verify user has access to org
    await this.orgsService.getOrg(orgId, user);

    // Implementation for workspace listing
    return { workspaces: [] };
  }
}
