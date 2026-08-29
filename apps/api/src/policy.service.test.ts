import { describe, expect, it } from 'vitest';
import { PolicyService } from './modules/auth/policy.service';

describe('PolicyService', () => {
  const policy = new PolicyService();

  it('owner can manage all', () => {
    const ability = policy.defineAbilityFor({
      role: 'owner',
      orgId: 'org_1',
      userId: 'user_1',
    });
    expect(ability.can('manage', 'all')).toBe(true);
  });

  it('viewer cannot create projects', () => {
    const ability = policy.defineAbilityFor({
      role: 'viewer',
      orgId: 'org_1',
      userId: 'user_1',
    });
    expect(ability.can('create', 'Project')).toBe(false);
    expect(ability.can('read', 'Project')).toBe(true);
  });

  it('editor can publish specs', () => {
    const ability = policy.defineAbilityFor({
      role: 'editor',
      orgId: 'org_1',
      userId: 'user_1',
    });
    expect(ability.can('publish', 'Spec')).toBe(true);
  });

  it('reviewer can review but not publish', () => {
    const ability = policy.defineAbilityFor({
      role: 'reviewer',
      orgId: 'org_1',
      userId: 'user_1',
    });
    expect(ability.can('review', 'Spec')).toBe(true);
    expect(ability.can('publish', 'Spec')).toBe(false);
  });
});
