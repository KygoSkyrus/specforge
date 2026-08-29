export interface PromptTemplate {
  id: string;
  version: number;
  system: string;
  user: (context: Record<string, string>) => string;
}

export const specFromBriefV1: PromptTemplate = {
  id: 'spec.fromBrief',
  version: 1,
  system: `You are a senior product analyst. Extract structured requirements from client briefs.
Output JSON matching the schema. Include functional, non_functional, assumptions, and out_of_scope items.
Use MoSCoW priorities. Never invent scope not implied by the brief.`,
  user: (ctx) => `Brief:\n---\n${ctx.brief ?? ''}\n---\nExtract requirements.`,
};

export const promptRegistry: Record<string, PromptTemplate> = {
  'spec.fromBrief@v1': specFromBriefV1,
};

export function getPrompt(templateId: string): PromptTemplate {
  const template = promptRegistry[templateId];
  if (!template) {
    throw new Error(`Unknown prompt template: ${templateId}`);
  }
  return template;
}
