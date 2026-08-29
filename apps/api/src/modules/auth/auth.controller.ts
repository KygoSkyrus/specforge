import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard, CurrentUser } from './auth.guard';
import { PolicyService } from './policy.service';
import { DevLoginDtoSchema, RefreshTokenDtoSchema, type DevLoginDto, type CurrentUser as CurrentUserType } from '@specforge/schemas';
import type { AuthTokenResponse, RefreshTokenResponse } from '@specforge/schemas';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly policy: PolicyService,
  ) {}

  /**
   * Dev-only login: Creates user, org, and workspace on first login
   * WARNING: Only enable in development. Remove for production.
   */
  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  async devLogin(@Body() body: unknown): Promise<AuthTokenResponse> {
    // Validate input with Zod
    const validation = DevLoginDtoSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new BadRequestException(`Validation failed: ${errors}`);
    }

    const dto = validation.data as DevLoginDto;

    try {
      // Get or create user, org, workspace
      const { user, org, workspace, membership } = await this.authService.devLogin(
        dto.email,
        dto.name,
        dto.orgName,
      );

      // Generate tokens
      const accessToken = this.authService.generateAccessToken({
        userId: user.id,
        email: user.email,
        orgId: org.id,
        workspaceId: workspace.id,
        role: membership.role,
      });

      const refreshToken = await this.authService.generateRefreshToken(user.id);

      return {
        accessToken,
        refreshToken,
        expiresIn: parseInt(process.env.JWT_EXPIRY || '900'),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        org: {
          id: org.id,
          name: org.name,
        },
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        role: membership.role as any,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Failed to authenticate');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown): Promise<RefreshTokenResponse> {
    // Validate input with Zod
    const validation = RefreshTokenDtoSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new BadRequestException(`Validation failed: ${errors}`);
    }

    const dto = validation.data;

    try {
      return await this.authService.refreshAccessToken(dto.refreshToken);
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw new BadRequestException('Failed to refresh token');
    }
  }

  /**
   * Logout: Invalidate refresh token
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  async logout(@CurrentUser() user: CurrentUserType): Promise<void> {
    await this.authService.invalidateRefreshToken(user.id);
  }

  /**
   * Get current user information
   */
  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() user: CurrentUserType): Promise<{
    user: CurrentUserType;
    permissions: {
      canManage: boolean;
      canPublish: boolean;
      canReview: boolean;
    };
  }> {
    const ability = this.policy.defineAbilityFor({
      role: user.role,
      orgId: user.orgId,
      userId: user.id,
    });

    return {
      user,
      permissions: {
        canManage: ability.can('manage', 'all'),
        canPublish: ability.can('publish', 'Spec'),
        canReview: ability.can('review', 'Spec'),
      },
    };
  }
}
