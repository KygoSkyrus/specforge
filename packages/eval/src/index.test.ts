import { describe, expect, it } from 'vitest';
import { scoreRequirementCoverage, scoreSchemaValidity, type EvalCase } from './index.js';

const validOutput = {
  title: 'Todo app',
  requirements: [
    {
      kind: 'functional',
      title: 'Task creation',
      body: 'Users can create tasks with a title and due date.',
      priority: 'must',
      openQuestions: [],
      sourceRefs: [],
    },
    {
      kind: 'assumption',
      title: 'Single timezone',
      body: 'All users operate in one timezone.',
      priority: 'should',
      openQuestions: [],
      sourceRefs: [],
    },
  ],
};

describe('scoreSchemaValidity', () => {
  it('passes for schema-valid output', () => {
    expect(scoreSchemaValidity(validOutput).passed).toBe(true);
  });

  it('fails when output violates the contract', () => {
    const result = scoreSchemaValidity({ title: '', requirements: [] });
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('scoreRequirementCoverage', () => {
  const testCase: EvalCase = {
    id: 'todo-app-v1',
    brief: 'A simple todo app.',
    minRequirements: 2,
    mustIncludeKinds: ['functional', 'assumption'],
  };

  it('passes when counts and kinds are met', () => {
    const result = scoreRequirementCoverage(validOutput, testCase);
    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails on insufficient requirement count', () => {
    const result = scoreRequirementCoverage(
      { requirements: validOutput.requirements.slice(0, 1) },
      testCase,
    );
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('≥2');
  });

  it('fails on missing required kind', () => {
    const functionalOnly = {
      requirements: [
        validOutput.requirements.find((r) => r.kind === 'functional') ?? {
          kind: 'functional',
        },
      ],
    };
    const result = scoreRequirementCoverage(functionalOnly, testCase);
    expect(result.errors.some((e) => e.includes('assumption'))).toBe(true);
  });
});
