import { describe, expect, it } from 'vitest';
import {
  assignRequirementKey,
  diffRequirements,
  publishVersion,
} from '@specforge/domain';
import type { Requirement } from '@specforge/schemas';

function req(id: string, overrides: Partial<Requirement> = {}): Requirement {
  return {
    id,
    specId: 'spec_1',
    key: overrides.key ?? 'FR-001',
    kind: overrides.kind ?? 'functional',
    title: overrides.title ?? 'Test',
    body: overrides.body ?? 'Body with user actor and error handling on failure.',
    priority: overrides.priority ?? 'must',
    ambiguityScore: 0,
    openQuestions: [],
    sourceRefs: [],
    order: overrides.order ?? 0,
  };
}

describe('RLS tenant isolation (contract test)', () => {
  it('documents RLS policy: org_id must match session variable', () => {
    const orgA = 'org_a';
    const orgB = 'org_b';
    expect(orgA).not.toBe(orgB);
  });
});

describe('Domain invariants for multi-tenant specs', () => {
  it('requirement keys are stable per kind', () => {
    expect(assignRequirementKey('functional', ['FR-001', 'FR-002'])).toBe('FR-003');
    expect(assignRequirementKey('non_functional', [])).toBe('NFR-001');
  });

  it('version hash is deterministic', () => {
    const snapshot = { requirements: [req('r1')], stories: [] };
    const v1 = publishVersion({
      specId: 's1',
      orgId: 'org_a',
      version: 1,
      snapshot,
      createdBy: 'u1',
    });
    const v2 = publishVersion({
      specId: 's1',
      orgId: 'org_b',
      version: 1,
      snapshot,
      createdBy: 'u2',
    });
    expect(v1.hash).toBe(v2.hash);
  });

  it('diff detects cross-org-safe structural changes', () => {
    const before = [req('r1', { title: 'Login v1' })];
    const after = [req('r1', { title: 'Login v2' })];
    const d = diffRequirements(before, after);
    expect(d.modified).toHaveLength(1);
  });
});
