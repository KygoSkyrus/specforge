export {
  assignRequirementKey,
  hashSnapshot,
  publishVersion,
  diffRequirements,
  diffSnapshots,
} from './spec.js';
export type { PublishVersionInput, PublishedVersion } from './spec.js';

export { ambiguityHeuristics } from './ambiguity.js';
export type { AmbiguityResult } from './ambiguity.js';

export { assertStoryTraceability, coverage, DomainError } from './invariants.js';
