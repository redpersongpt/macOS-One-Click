import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback — receives error and reset function */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] caught:', error, info.componentStack);
    }
  }

  reset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }

    return <DefaultErrorFallback error={this.state.error} onReset={this.reset} />;
  }
}

function DefaultErrorFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
      <div className="p-3 rounded-lg bg-[--color-red-1] border border-[--color-red-3]">
        <AlertOctagon size={20} className="text-[--color-red-5]" aria-hidden />
      </div>

      <div className="flex flex-col gap-1.5 max-w-sm">
        <p className="text-[0.875rem] font-semibold text-[--text-primary] leading-snug">
          Something went wrong
        </p>
        <p className="text-[0.75rem] text-[--text-tertiary] font-mono break-words leading-relaxed">
          {error.message}
        </p>
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={onReset}
        leadingIcon={<RotateCcw size={13} />}
      >
        Try again
      </Button>
    </div>
  );
}
