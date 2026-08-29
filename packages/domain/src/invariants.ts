import type { Requirement, Story } from '@specforge/schemas';

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/** Story must trace to a requirement — hard invariant */
export function assertStoryTraceability(
  story: Pick<Story, 'requirementId'>,
  requirements: Requirement[],
): void {
  const exists = requirements.some((r) => r.id === story.requirementId);
  if (!exists) {
    throw new DomainError(
      `Story references unknown requirement: ${story.requirementId}`,
      'STORY_TRACEABILITY_VIOLATION',
    );
  }
}

/** Coverage = requirements with ≥1 story / total */
export function coverage(spec: {
  requirements: Requirement[];
  stories: Story[];
}): { percent: number; covered: number; total: number; uncoveredIds: string[] } {
  const total = spec.requirements.length;
  if (total === 0) {
    return { percent: 0, covered: 0, total: 0, uncoveredIds: [] };
  }

  const coveredSet = new Set(spec.stories.map((s) => s.requirementId));
  const uncoveredIds = spec.requirements
    .filter((r) => !coveredSet.has(r.id))
    .map((r) => r.id);

  const covered = total - uncoveredIds.length;
  const percent = Math.round((covered / total) * 100);

  return { percent, covered, total, uncoveredIds };
}
