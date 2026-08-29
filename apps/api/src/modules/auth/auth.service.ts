import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { sign, verify } from 'jsonwebtoken';
import { CurrentUser } from '@specforge/schemas';

interface JwtPayload {
  userId: string;
  email: string;
  orgId: string;
  workspaceId: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  private readonly JWT_EXPIRY = process.env.JWT_EXPIRY || '900'; // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '2592000'; // 30 days

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Dev login: Create or retrieve user, org, and workspace
   * Used for local development and testing only
   */
  async devLogin(email: string, name?: string, orgName?: string) {
    const normalizedEmail = email.toLowerCase().trim();

    // Try to find existing user
    let user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Create new user if doesn't exist
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          name: name || normalizedEmail.split('@')[0],
        },
      });

      // Create org for new user
      const org = await this.prisma.org.create({
        data: {
          name: orgName || `${user.name}'s Org`,
        },
      });

      // Add user as owner of org
      await this.prisma.membership.create({
        data: {
          orgId: org.id,
          userId: user.id,
          role: 'owner',
        },
      });

      // Create default workspace
      const workspace = await this.prisma.workspace.create({
        data: {
          orgId: org.id,
          name: 'Default Workspace',
        },
      });

      return {
        user,
        org,
        workspace,
        membership: { role: 'owner' as const },
      };
    }

    // Existing user: get their org and workspace
    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id },
      include: {
        org: true,
      },
    });

    if (!membership) {
      throw new Error('User has no org membership');
    }

    const workspace = await this.prisma.workspace.findFirst({
      where: { orgId: membership.org.id },
    });

    if (!workspace) {
      throw new Error('Org has no workspace');
    }

    return {
      user,
      org: membership.org,
      workspace,
      membership: { role: membership.role },
    };
  }

  /**
   * Generate JWT access token
   */
  generateAccessToken(payload: JwtPayload): string {
    return sign(payload, this.JWT_SECRET, {
      expiresIn: parseInt(this.JWT_EXPIRY),
      algorithm: 'HS256',
    });
  }

  /**
   * Generate refresh token and store in Redis
   */
  async generateRefreshToken(userId: string): Promise<string> {
    const token = sign({ userId }, this.JWT_SECRET, {
      expiresIn: parseInt(this.REFRESH_TOKEN_EXPIRY),
      algorithm: 'HS256',
    });

    // Store in Redis for revocation capability
    await this.redis.set(`refresh_token:${userId}`, token, 'EX', parseInt(this.REFRESH_TOKEN_EXPIRY));

    return token;
  }

  /**
   * Verify and decode JWT token
   */
  verifyToken(token: string): JwtPayload | null {
    try {
      return verify(token, this.JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
    } catch {
      return null;
    }
  }

  /**
   * Verify refresh token and generate new access token
   */
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    const payload = this.verifyToken(refreshToken) as any;
    if (!payload || !payload.userId) {
      throw new Error('Invalid refresh token');
    }

    // Verify token exists in Redis
    const storedToken = await this.redis.get(`refresh_token:${payload.userId}`);
    if (!storedToken || storedToken !== refreshToken) {
      throw new Error('Refresh token not found or invalidated');
    }

    // Get user and generate new access token
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id },
    });

    if (!membership) {
      throw new Error('User has no org membership');
    }

    const workspace = await this.prisma.workspace.findFirst({
      where: { orgId: membership.orgId },
    });

    if (!workspace) {
      throw new Error('Org has no workspace');
    }

    const accessToken = this.generateAccessToken({
      userId: user.id,
      email: user.email,
      orgId: membership.orgId,
      workspaceId: workspace.id,
      role: membership.role,
    });

    return {
      accessToken,
      expiresIn: parseInt(this.JWT_EXPIRY),
    };
  }

  /**
   * Invalidate refresh token (logout)
   */
  async invalidateRefreshToken(userId: string): Promise<void> {
    await this.redis.del(`refresh_token:${userId}`);
  }

  /**
   * Get current user info from token
   */
  async getCurrentUser(payload: JwtPayload): Promise<CurrentUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      orgId: payload.orgId,
      role: payload.role as any,
      workspaceId: payload.workspaceId,
    };
  }
}
