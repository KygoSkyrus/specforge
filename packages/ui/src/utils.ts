import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export { blueprintNoir, blueprintPaper, type ThemeTokens } from '@specforge/schemas';

/** CSS custom properties from theme tokens */
export function themeToCssVars(tokens: import('@specforge/schemas').ThemeTokens): Record<string, string> {
  return {
    '--sf-canvas': tokens.canvas,
    '--sf-surface': tokens.surface,
    '--sf-border': tokens.border,
    '--sf-accent-from': tokens.accentFrom,
    '--sf-accent-to': tokens.accentTo,
    '--sf-text-primary': tokens.textPrimary,
    '--sf-text-secondary': tokens.textSecondary,
    '--sf-font-ui': tokens.fontUi,
    '--sf-font-mono': tokens.fontMono,
    '--sf-semantic-ambiguity': tokens.semantic.ambiguity,
    '--sf-semantic-critical': tokens.semantic.critical,
    '--sf-semantic-approved': tokens.semantic.approved,
    '--sf-semantic-draft': tokens.semantic.draft,
  };
}
