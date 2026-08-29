import { describe, expect, it } from 'vitest';
import {
  assignRequirementKey,
  ambiguityHeuristics,
  coverage,
  diffRequirements,
  hashSnapshot,
  publishVersion,
  assertStoryTraceability,
  DomainError,
} from './index.js';
import type { Requirement, SpecVersionSnapshot, Story } from '@specforge/schemas';

function makeReq(overrides: Partial<Requirement> & { id: string }): Requirement {
  return {
    id: overrides.id,
    specId: 'spec_1',
    key: overrides.key ?? 'FR-001',
    kind: overrides.kind ?? 'functional',
    title: overrides.title ?? 'Test',
    body: overrides.body ?? 'The user can do something with clear error handling on failure.',
    priority: overrides.priority ?? 'must',
    ambiguityScore: overrides.ambiguityScore ?? 0,
    openQuestions: overrides.openQuestions ?? [],
    sourceRefs: overrides.sourceRefs ?? [],
    order: overrides.order ?? 0,
  };
}

describe('assignRequirementKey', () => {
  it('starts at FR-001 for functional', () => {
    expect(assignRequirementKey('functional', [])).toBe('FR-001');
  });

  it('increments from existing keys', () => {
    expect(assignRequirementKey('functional', ['FR-001', 'FR-002'])).toBe('FR-003');
  });

  it('uses NFR prefix for non_functional', () => {
    expect(assignRequirementKey('non_functional', ['NFR-005'])).toBe('NFR-006');
  });

  it('ignores keys of other kinds', () => {
    expect(assignRequirementKey('functional', ['NFR-001'])).toBe('FR-001');
  });
});

describe('publishVersion', () => {
  it('creates content-addressed hash', () => {
    const snapshot: SpecVersionSnapshot = { requirements: [makeReq({ id: 'r1' })], stories: [] };
    const v1 = publishVersion({
      specId: 'spec_1',
      orgId: 'org_1',
      version: 1,
      snapshot,
      createdBy: 'user_1',
    });
    const v2 = publishVersion({
      specId: 'spec_1',
      orgId: 'org_1',
      version: 2,
      snapshot,
      createdBy: 'user_1',
    });
    expect(v1.hash).toBe(v2.hash);
    expect(v1.hash).toHaveLength(16);
  });

  it('different snapshots produce different hashes', () => {
    const s1: SpecVersionSnapshot = { requirements: [makeReq({ id: 'r1', title: 'A' })], stories: [] };
    const s2: SpecVersionSnapshot = { requirements: [makeReq({ id: 'r1', title: 'B' })], stories: [] };
    expect(hashSnapshot(s1)).not.toBe(hashSnapshot(s2));
  });
});

describe('diffRequirements', () => {
  it('detects added and removed', () => {
    const before = [makeReq({ id: 'r1' })];
    const after = [makeReq({ id: 'r1' }), makeReq({ id: 'r2', key: 'FR-002' })];
    const d = diffRequirements(before, after);
    expect(d.added).toEqual(['r2']);
    expect(d.removed).toEqual([]);
  });

  it('detects field modifications', () => {
    const before = [makeReq({ id: 'r1', title: 'Old' })];
    const after = [makeReq({ id: 'r1', title: 'New' })];
    const d = diffRequirements(before, after);
    expect(d.modified).toHaveLength(1);
    expect(d.modified[0]?.changes[0]?.field).toBe('title');
  });

  it('detects reordering', () => {
    const before = [makeReq({ id: 'r1', order: 0 }), makeReq({ id: 'r2', key: 'FR-002', order: 1 })];
    const after = [makeReq({ id: 'r2', key: 'FR-002', order: 0 }), makeReq({ id: 'r1', order: 1 })];
    const d = diffRequirements(before, after);
    expect(d.moved).toHaveLength(2);
  });

  it('handles empty sets', () => {
    const d = diffRequirements([], []);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });
});

describe('ambiguityHeuristics', () => {
  it('flags vague terms', () => {
    const result = ambiguityHeuristics({
      title: 'Fast login',
      body: 'The system should be fast and seamless.',
    });
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals.some((s) => s.startsWith('vague_term'))).toBe(true);
  });

  it('flags missing actor', () => {
    const result = ambiguityHeuristics({
      title: 'Login',
      body: 'Must authenticate via email with error handling on failure.',
    });
    expect(result.signals).toContain('missing_actor');
  });

  it('returns low score for well-formed requirement', () => {
    const result = ambiguityHeuristics({
      title: 'User login',
      body: 'As a registered user, I can log in with email and password. Invalid credentials show an error message.',
    });
    expect(result.score).toBeLessThan(0.3);
  });
});

describe('coverage', () => {
  const reqs = [
    makeReq({ id: 'r1' }),
    makeReq({ id: 'r2', key: 'FR-002' }),
    makeReq({ id: 'r3', key: 'FR-003' }),
  ];

  it('computes coverage percent', () => {
    const stories: Story[] = [
      {
        id: 's1',
        specId: 'spec_1',
        requirementId: 'r1',
        asA: 'user',
        iWant: 'login',
        soThat: 'access',
        criteria: [],
        labels: [],
      },
      {
        id: 's2',
        specId: 'spec_1',
        requirementId: 'r2',
        asA: 'user',
        iWant: 'logout',
        soThat: 'secure',
        criteria: [],
        labels: [],
      },
    ];
    const result = coverage({ requirements: reqs, stories });
    expect(result.percent).toBe(67);
    expect(result.uncoveredIds).toEqual(['r3']);
  });
});

describe('assertStoryTraceability', () => {
  it('passes when requirement exists', () => {
    const reqs = [makeReq({ id: 'r1' })];
    expect(() =>
      assertStoryTraceability({ requirementId: 'r1' }, reqs),
    ).not.toThrow();
  });

  it('throws when requirement missing', () => {
    expect(() =>
      assertStoryTraceability({ requirementId: 'missing' }, []),
    ).toThrow(DomainError);
  });
});
