import { CanActivate, ExecutionContext, Injectable, createParamDecorator, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { CurrentUser as CurrentUserType } from '@specforge/schemas';
import { AuthService } from './auth.service';

export type AuthUser = CurrentUserType;

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  return request.user;
});

/**
 * Authentication guard: supports both JWT tokens and dev headers
 * Production: Uses JWT tokens from Authorization header (Bearer <token>)
 * Development: Falls back to x-org-id, x-user-id, x-user-role headers
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();

    // Try JWT token first (production)
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = this.authService.verifyToken(token);
      if (!payload) {
        throw new UnauthorizedException('Invalid or expired token');
      }

      (request as Request & { user?: AuthUser }).user = {
        id: payload.userId,
        email: payload.email,
        name: null,
        orgId: payload.orgId,
        role: payload.role as any,
        workspaceId: payload.workspaceId,
      };
      return true;
    }

    // Fallback to dev headers (development only)
    if (process.env.NODE_ENV !== 'production') {
      const getHeader = (name: string): string | undefined => {
        const value = request.headers[name];
        return Array.isArray(value) ? value[0] : value;
      };

      const orgId = getHeader('x-org-id');
      const userId = getHeader('x-user-id');
      const role = getHeader('x-user-role');
      const email = getHeader('x-user-email');
      const workspaceId = getHeader('x-workspace-id');

      if (!orgId || !userId || !role || !email || !workspaceId) {
        throw new UnauthorizedException('Missing auth headers (x-org-id, x-user-id, x-user-role, x-user-email, x-workspace-id)');
      }

      (request as Request & { user?: AuthUser }).user = {
        id: userId,
        email,
        name: null,
        orgId,
        role: role as any,
        workspaceId,
      };
      return true;
    }

    throw new UnauthorizedException('Missing or invalid authorization');
  }
}
