import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Sovereign Voice crashed', error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <section className="max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow-soft">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-red-50 text-danger">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-bold text-slate-950">Something broke</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Sovereign Voice hit an unexpected error. Reload the app and try again.
          </p>
          <Button type="button" className="mt-5" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </section>
      </main>
    );
  }
}
