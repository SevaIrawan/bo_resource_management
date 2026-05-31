import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '1.5rem',
        background: '#07060f',
        color: '#f4f4f8',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>Something went wrong</p>
      <p style={{ maxWidth: '28rem', fontSize: '0.75rem', color: '#a8a4c0' }}>
        {error.message}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          borderRadius: '0.5rem',
          background: '#6366f1',
          padding: '0.5rem 1rem',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Reload app
      </button>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}
