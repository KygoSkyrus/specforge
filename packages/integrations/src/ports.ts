import type { Story } from '@specforge/schemas';

export interface TrackerTarget {
  id: string;
  name: string;
  type: 'project' | 'board' | 'team';
}

export interface ExternalRefResult {
  storyId: string;
  provider: string;
  externalId: string;
  url: string;
}

export interface StoryDraft {
  story: Story;
  title: string;
  description: string;
}

export interface IssuePatch {
  title?: string;
  description?: string;
  status?: string;
}

/** Port for tracker integrations — Linear, Trello, Jira */
export interface TrackerPort {
  createIssues(batch: StoryDraft[], target: TrackerTarget): Promise<ExternalRefResult[]>;
  updateIssue(ref: ExternalRefResult, patch: IssuePatch): Promise<void>;
  listContainers(): Promise<TrackerTarget[]>;
  handleWebhook(evt: unknown): Promise<unknown[]>;
}

export interface NotificationPayload {
  channel: string;
  title: string;
  body: string;
  blocks?: unknown[];
}

/** Port for messaging integrations — Slack, email, in-app */
export interface NotifierPort {
  send(payload: NotificationPayload): Promise<{ messageId: string }>;
  updateMessage(messageId: string, payload: NotificationPayload): Promise<void>;
}
