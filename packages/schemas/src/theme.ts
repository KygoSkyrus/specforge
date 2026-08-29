import { z } from 'zod';

export const ThemeTokensSchema = z.object({
  mode: z.enum(['dark', 'light']).default('dark'),
  canvas: z.string(),
  surface: z.string(),
  border: z.string(),
  accentFrom: z.string(),
  accentTo: z.string(),
  textPrimary: z.string(),
  textSecondary: z.string(),
  fontUi: z.string().default('Inter Tight, system-ui, sans-serif'),
  fontMono: z.string().default('JetBrains Mono, monospace'),
  semantic: z.object({
    ambiguity: z.string(),
    critical: z.string(),
    approved: z.string(),
    draft: z.string(),
  }),
});
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;

export const blueprintNoir: ThemeTokens = {
  mode: 'dark',
  canvas: '#0B0D10',
  surface: '#12151A',
  border: 'rgba(255,255,255,0.07)',
  accentFrom: '#5EE7FF',
  accentTo: '#8B7CFF',
  textPrimary: '#F4F5F7',
  textSecondary: '#9BA3B0',
  fontUi: 'Inter Tight, system-ui, sans-serif',
  fontMono: 'JetBrains Mono, monospace',
  semantic: {
    ambiguity: '#F59E0B',
    critical: '#EF4444',
    approved: '#10B981',
    draft: '#64748B',
  },
};

export const blueprintPaper: ThemeTokens = {
  mode: 'light',
  canvas: '#FAF9F6',
  surface: '#FFFFFF',
  border: 'rgba(20,24,29,0.08)',
  accentFrom: '#5EE7FF',
  accentTo: '#8B7CFF',
  textPrimary: '#14181D',
  textSecondary: '#5C6570',
  fontUi: 'Inter Tight, system-ui, sans-serif',
  fontMono: 'JetBrains Mono, monospace',
  semantic: {
    ambiguity: '#D97706',
    critical: '#DC2626',
    approved: '#059669',
    draft: '#94A3B8',
  },
};
