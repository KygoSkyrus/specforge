import { cn } from './utils.js';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-[var(--sf-border)]',
        className,
      )}
    />
  );
}
