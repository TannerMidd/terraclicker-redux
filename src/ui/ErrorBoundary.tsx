import { Component, type ReactNode } from 'react';
import { exportToClipboard } from '../state/store';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** When everything goes wrong, the Guide has exactly one piece of advice. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="dont-panic">
        <div className="dp-inner">
          <h1>DON&rsquo;T PANIC</h1>
          <p className="dp-sub">
            Something improbable has happened to the interface. Your save is intact.
          </p>
          <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn" onClick={() => location.reload()}>
              Reload the Guide
            </button>
            <button
              className="btn"
              onClick={() => {
                void navigator.clipboard?.writeText(exportToClipboard());
              }}
            >
              Copy save export
            </button>
          </div>
          <p className="dp-err">{String(this.state.error?.message ?? this.state.error)}</p>
          <p className="dp-tip">
            The Guide notes that interfaces, like planets, are mostly harmless right up until
            they aren&rsquo;t.
          </p>
        </div>
      </div>
    );
  }
}
