import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

export function Button({ className, variant = 'primary', icon, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' &&
          'bg-gradient-to-r from-saffron to-sovereign text-white shadow-soft hover:translate-y-[-1px]',
        variant === 'secondary' && 'border border-slate-200 bg-white text-slate-900 hover:border-sovereign/40',
        variant === 'ghost' && 'text-slate-700 hover:bg-slate-100',
        variant === 'danger' && 'bg-danger text-white hover:bg-red-600',
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
