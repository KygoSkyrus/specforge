import { SpecFromBriefOutputSchema } from '@specforge/schemas';

export interface EvalCase {
  id: string;
  brief: string;
  minRequirements: number;
  mustIncludeKinds: Array<'functional' | 'assumption' | 'out_of_scope'>;
}

export interface EvalResult {
  caseId: string;
  passed: boolean;
  errors: string[];
}

export function scoreSchemaValidity(output: unknown): EvalResult {
  const parsed = SpecFromBriefOutputSchema.safeParse(output);
  if (!parsed.success) {
    return {
      caseId: 'schema',
      passed: false,
      errors: parsed.error.errors.map((e) => e.message),
    };
  }
  return { caseId: 'schema', passed: true, errors: [] };
}

export function scoreRequirementCoverage(
  output: { requirements: { kind: string }[] },
  testCase: EvalCase,
): EvalResult {
  const errors: string[] = [];
  if (output.requirements.length < testCase.minRequirements) {
    errors.push(`Expected ≥${testCase.minRequirements} requirements, got ${output.requirements.length}`);
  }
  for (const kind of testCase.mustIncludeKinds) {
    if (!output.requirements.some((r) => r.kind === kind)) {
      errors.push(`Missing requirement kind: ${kind}`);
    }
  }
  return { caseId: testCase.id, passed: errors.length === 0, errors };
}
