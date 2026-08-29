import { describe, expect, it } from 'vitest';
import {
  RequirementSchema,
  SpecFromBriefOutputSchema,
  StorySchema,
  ThemeTokensSchema,
  blueprintNoir,
} from './index.js';

describe('RequirementSchema', () => {
  it('validates a complete requirement', () => {
    const result = RequirementSchema.safeParse({
      id: 'req_1',
      specId: 'spec_1',
      key: 'FR-001',
      kind: 'functional',
      title: 'User login',
      body: 'Users must be able to log in with email.',
      priority: 'must',
      ambiguityScore: 0.1,
      openQuestions: [],
      sourceRefs: [],
      order: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing requirementId traceability fields on story', () => {
    const result = StorySchema.safeParse({
      id: 'story_1',
      specId: 'spec_1',
      asA: 'user',
      iWant: 'to login',
      soThat: 'I can access my account',
    });
    expect(result.success).toBe(false);
  });
});

describe('SpecFromBriefOutputSchema', () => {
  it('validates LLM output shape', () => {
    const result = SpecFromBriefOutputSchema.safeParse({
      title: 'Auth System',
      requirements: [
        {
          kind: 'functional',
          title: 'Login',
          body: 'Email/password login',
          priority: 'must',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('ThemeTokensSchema', () => {
  it('validates blueprint noir preset', () => {
    expect(ThemeTokensSchema.safeParse(blueprintNoir).success).toBe(true);
  });
});
