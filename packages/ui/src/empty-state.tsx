import type { ReactNode } from 'react';
import { cn } from './utils.js';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--sf-border)] bg-[var(--sf-surface)]/50 px-8 py-12 text-center',
        className,
      )}
    >
      {icon && <div className="mb-4 text-[var(--sf-text-secondary)]">{icon}</div>}
      <h3 className="text-lg font-medium text-[var(--sf-text-primary)]">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-[var(--sf-text-secondary)]">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
