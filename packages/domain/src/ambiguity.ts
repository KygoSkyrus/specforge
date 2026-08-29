import type { Requirement } from '@specforge/schemas';

const VAGUE_TERMS = [
  'fast',
  'quick',
  'easy',
  'simple',
  'robust',
  'scalable',
  'user-friendly',
  'intuitive',
  'seamless',
  'efficient',
  'flexible',
  'appropriate',
  'reasonable',
  'etc',
  'and so on',
  'as needed',
  'TBD',
  'some',
  'many',
  'few',
  'several',
];

const ACTOR_PATTERNS = /\b(user|admin|customer|client|system|actor)\b/i;

export interface AmbiguityResult {
  score: number;
  signals: string[];
}

/** Deterministic pre-score for requirement ambiguity (0..1) */
export function ambiguityHeuristics(requirement: Pick<Requirement, 'title' | 'body'>): AmbiguityResult {
  const text = `${requirement.title} ${requirement.body}`.toLowerCase();
  const signals: string[] = [];
  let score = 0;

  for (const term of VAGUE_TERMS) {
    if (text.includes(term.toLowerCase())) {
      signals.push(`vague_term:${term}`);
      score += 0.08;
    }
  }

  if (!ACTOR_PATTERNS.test(requirement.body)) {
    signals.push('missing_actor');
    score += 0.15;
  }

  if (!/\berror|fail|invalid|exception|timeout\b/i.test(requirement.body)) {
    signals.push('missing_error_path');
    score += 0.1;
  }

  if (requirement.body.length < 30) {
    signals.push('too_brief');
    score += 0.12;
  }

  if (/\?\s*$/.test(requirement.body) || /\b(maybe|possibly|might|unclear)\b/i.test(text)) {
    signals.push('uncertain_language');
    score += 0.1;
  }

  return {
    score: Math.min(1, Math.round(score * 100) / 100),
    signals,
  };
}
