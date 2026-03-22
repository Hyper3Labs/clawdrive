import { useState } from "react";

type ViewMode = "agent" | "human";

export function App() {
  const [view, setView] = useState<ViewMode>("agent");

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* TopBar placeholder */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(0,0,0,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontWeight: "bold", fontSize: 15 }}>ClawDrive</span>
          <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: 2 }}>
            <button
              onClick={() => setView("agent")}
              style={{
                padding: "6px 16px", borderRadius: 5, border: "none", cursor: "pointer",
                background: view === "agent" ? "rgba(99,102,241,0.3)" : "transparent",
                color: "#e4e4e7", fontSize: 13,
              }}
            >Agent View</button>
            <button
              onClick={() => setView("human")}
              style={{
                padding: "6px 16px", borderRadius: 5, border: "none", cursor: "pointer",
                background: view === "human" ? "rgba(99,102,241,0.3)" : "transparent",
                color: "#e4e4e7", fontSize: 13,
              }}
            >Human View</button>
          </div>
        </div>
        <div style={{ opacity: 0.5, fontSize: 13 }}>Cmd+K Search</div>
      </header>
      {/* Content */}
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ opacity: 0.3 }}>{view === "agent" ? "3D Embedding Space" : "Taxonomy Browser"} — coming soon</p>
      </main>
    </div>
  );
}
