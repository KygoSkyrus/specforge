import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
  type MongoQuery,
} from '@casl/ability';
import type { Role } from '@specforge/schemas';

type Actions = 'manage' | 'create' | 'read' | 'update' | 'delete' | 'publish' | 'review';
type Subjects =
  | 'Org'
  | 'Workspace'
  | 'Project'
  | 'Brief'
  | 'Spec'
  | 'Requirement'
  | 'Suggestion'
  | 'Story'
  | 'DealRoom'
  | 'Integration'
  | 'AuditLog'
  | 'all';

export type AppAbility = MongoAbility<[Actions, Subjects], MongoQuery>;

export interface AbilityContext {
  role: Role;
  orgId: string;
  userId: string;
}

@Injectable()
export class PolicyService {
  defineAbilityFor(ctx: AbilityContext): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    switch (ctx.role) {
      case 'owner':
      case 'admin':
        can('manage', 'all');
        break;
      case 'editor':
        can(['create', 'read', 'update', 'publish'], ['Project', 'Spec', 'Requirement', 'Story']);
        can(['create', 'read', 'update'], ['Brief', 'Suggestion']);
        can('read', ['Workspace', 'Org', 'AuditLog']);
        cannot('delete', 'Org');
        break;
      case 'reviewer':
        can('read', ['Project', 'Spec', 'Requirement', 'Story', 'Brief', 'Suggestion', 'Workspace']);
        can(['review', 'update'], 'Spec');
        can(['review', 'update'], 'Suggestion');
        break;
      case 'viewer':
        can('read', ['Project', 'Spec', 'Requirement', 'Story', 'Brief', 'Suggestion', 'Workspace']);
        break;
    }

    return build();
  }

  assertCan(ability: AppAbility, action: Actions, subject: Subjects): void {
    if (!ability.can(action, subject)) {
      throw new ForbiddenException(`Forbidden: cannot ${action} ${subject}`);
    }
  }
}
