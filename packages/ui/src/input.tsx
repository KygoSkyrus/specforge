import type { InputHTMLAttributes } from 'react';
import { cn } from './utils.js';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm text-[var(--sf-text-secondary)]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'rounded-md border border-[var(--sf-border)] bg-[var(--sf-surface)] px-3 py-2 text-sm text-[var(--sf-text-primary)] placeholder:text-[var(--sf-text-secondary)] focus:border-[var(--sf-accent-from)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-accent-from)]',
          error && 'border-red-500',
          className,
        )}
        {...props}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
