import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './utils.js';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-gradient-to-r from-[var(--sf-accent-from)] to-[var(--sf-accent-to)] text-[#0B0D10] hover:opacity-90',
  secondary: 'bg-[var(--sf-surface)] border border-[var(--sf-border)] text-[var(--sf-text-primary)] hover:bg-white/5',
  ghost: 'text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] hover:bg-white/5',
  danger: 'bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-opacity duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-accent-from)] disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
