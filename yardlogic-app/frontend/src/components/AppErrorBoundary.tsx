import { Component, ErrorInfo, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled application error", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24, background: "var(--paper)" }}>
        <section style={{ maxWidth: 460, textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <p style={{ color: "var(--ink-soft)" }}>Your data is safe. Reload the page to continue using YardLogic.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload YardLogic</button>
        </section>
      </main>
    );
  }
}