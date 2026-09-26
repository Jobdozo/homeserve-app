import { Component } from "react";

// Catches a crash in any screen so the app shows a way out instead of a blank
// white page: reload, or go back to the start.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Screen crashed", error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>Something went wrong</p>
        <p style={{ fontSize: 13, color: "#5b5b6e", margin: 0, maxWidth: 300 }}>This screen hit a problem. Reloading usually fixes it.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => window.location.reload()} style={{ background: "#5B3FE0", color: "#fff", border: 0, borderRadius: 12, padding: "10px 18px", fontWeight: 600, fontSize: 14 }}>
            Reload
          </button>
          <button
            onClick={() => {
              window.location.hash = "#/";
              window.location.reload();
            }}
            style={{ background: "#fff", color: "#5b5b6e", border: "1px solid #ddd", borderRadius: 12, padding: "10px 18px", fontWeight: 600, fontSize: 14 }}
          >
            Go to start
          </button>
        </div>
      </div>
    );
  }
}
