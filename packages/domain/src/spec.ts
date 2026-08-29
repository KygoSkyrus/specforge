import { createHash } from 'node:crypto';
import type {
  ReqKind,
  Requirement,
  SpecVersionSnapshot,
  StructuralDiff,
} from '@specforge/schemas';

const KEY_PREFIX: Record<ReqKind, string> = {
  functional: 'FR',
  non_functional: 'NFR',
  constraint: 'CON',
  assumption: 'ASM',
  out_of_scope: 'OOS',
};

/** Assign stable FR-### / NFR-### keys based on kind counters */
export function assignRequirementKey(
  kind: ReqKind,
  existingKeys: string[],
): string {
  const prefix = KEY_PREFIX[kind];
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const key of existingKeys) {
    const match = pattern.exec(key);
    if (match?.[1]) {
      max = Math.max(max, parseInt(match[1], 10));
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/** Deterministic JSON serialization: object keys sorted at every depth */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(',')}}`;
}

/** Content-addressed hash for immutable version snapshots */
export function hashSnapshot(snapshot: SpecVersionSnapshot): string {
  return createHash('sha256').update(stableStringify(snapshot)).digest('hex').slice(0, 16);
}

export interface PublishVersionInput {
  specId: string;
  orgId: string;
  version: number;
  snapshot: SpecVersionSnapshot;
  createdBy: string;
  summary?: string;
}

export interface PublishedVersion {
  id: string;
  orgId: string;
  specId: string;
  version: number;
  hash: string;
  snapshot: SpecVersionSnapshot;
  summary: string | null;
  createdBy: string;
  createdAt: string;
}

/** Create an immutable version snapshot with content hash */
export function publishVersion(input: PublishVersionInput): PublishedVersion {
  const hash = hashSnapshot(input.snapshot);
  return {
    id: `sv_${hash}`,
    orgId: input.orgId,
    specId: input.specId,
    version: input.version,
    hash,
    snapshot: input.snapshot,
    summary: input.summary ?? null,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
  };
}

function requirementFieldsEqual(a: Requirement, b: Requirement): boolean {
  return (
    a.key === b.key &&
    a.kind === b.kind &&
    a.title === b.title &&
    a.body === b.body &&
    a.priority === b.priority &&
    a.ambiguityScore === b.ambiguityScore &&
    JSON.stringify(a.openQuestions) === JSON.stringify(b.openQuestions) &&
    a.order === b.order
  );
}

/** Structural diff between two requirement sets */
export function diffRequirements(
  before: Requirement[],
  after: Requirement[],
): StructuralDiff {
  const beforeMap = new Map(before.map((r) => [r.id, r]));
  const afterMap = new Map(after.map((r) => [r.id, r]));

  const added: string[] = [];
  const removed: string[] = [];
  const modified: StructuralDiff['modified'] = [];
  const moved: StructuralDiff['moved'] = [];

  for (const [id] of afterMap) {
    if (!beforeMap.has(id)) added.push(id);
  }
  for (const [id] of beforeMap) {
    if (!afterMap.has(id)) removed.push(id);
  }

  for (const [id, afterReq] of afterMap) {
    const beforeReq = beforeMap.get(id);
    if (!beforeReq) continue;

    if (beforeReq.order !== afterReq.order) {
      moved.push({ id, fromOrder: beforeReq.order, toOrder: afterReq.order });
    }

    if (!requirementFieldsEqual(beforeReq, afterReq)) {
      const changes: StructuralDiff['modified'][number]['changes'] = [];
      const fields = ['key', 'kind', 'title', 'body', 'priority', 'ambiguityScore'] as const;
      for (const field of fields) {
        if (beforeReq[field] !== afterReq[field]) {
          changes.push({ field, before: beforeReq[field], after: afterReq[field] });
        }
      }
      if (changes.length > 0) {
        modified.push({ id, changes });
      }
    }
  }

  return { added, removed, modified, moved };
}

/** Diff two full spec version snapshots */
export function diffSnapshots(
  before: SpecVersionSnapshot,
  after: SpecVersionSnapshot,
): StructuralDiff {
  return diffRequirements(before.requirements, after.requirements);
}
