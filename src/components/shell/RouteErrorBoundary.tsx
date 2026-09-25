import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '@/lib/reportError';

interface Props {
  children: ReactNode;
  /** Changing this (e.g. the pathname) clears the error so navigation recovers. */
  resetKey?: string;
}
interface State {
  error: Error | null;
  key: string | undefined;
}

/** Catches render errors in a screen so the shell (nav, header) keeps working. */
export class RouteErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { componentStack: info.componentStack });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen" style={{ maxWidth: 640 }}>
        <div className="card" role="alert">
          <h2 className="card-title">This screen hit a problem</h2>
          <p className="note" style={{ margin: '8px 0 14px' }}>
            The error has been reported. You can try again, or use the navigation to go somewhere else.
          </p>
          <div className="hstack">
            <button type="button" className="btn btn--primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
