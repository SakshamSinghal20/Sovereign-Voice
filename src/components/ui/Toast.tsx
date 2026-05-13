import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastMessage } from '../../types';
import { cn } from '../../lib/utils';

interface ToastViewportProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div className="fixed right-3 top-20 z-50 flex w-[calc(100vw-1.5rem)] max-w-sm flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? AlertCircle : Info;

        return (
          <article
            key={toast.id}
            className={cn(
              'rounded-lg border bg-white p-3 shadow-soft',
              toast.tone === 'success' && 'border-emerald-200',
              toast.tone === 'error' && 'border-red-200',
              toast.tone === 'info' && 'border-purple-200'
            )}
          >
            <div className="flex gap-3">
              <Icon
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  toast.tone === 'success' && 'text-success',
                  toast.tone === 'error' && 'text-danger',
                  toast.tone === 'info' && 'text-sovereign'
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-slate-950">{toast.title}</h2>
                {toast.description && <p className="mt-1 text-xs leading-5 text-slate-600">{toast.description}</p>}
              </div>
              <button
                type="button"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Dismiss notification"
                onClick={() => onDismiss(toast.id)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
