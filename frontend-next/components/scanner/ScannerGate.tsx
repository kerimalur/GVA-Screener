"use client";

import { useState, useEffect } from "react";

interface Props {
  children: React.ReactNode;
}

export default function ScannerGate({ children }: Props) {
  const [status, setStatus] = useState<"loading" | "locked" | "unlocked">("loading");
  const [code, setCode]     = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  // Pruefen ob bereits entsperrt (Cookie vorhanden via kurzer API-Anfrage)
  useEffect(() => {
    fetch("/api/auth/scanner-status")
      .then((r) => r.json())
      .then((d) => setStatus(d.unlocked ? "unlocked" : "locked"))
      .catch(() => setStatus("locked"));
  }, []);

  const unlock = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/scanner-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falscher Code");
        setLoading(false);
        return;
      }
      setStatus("unlocked");
    } catch {
      setError("Verbindungsfehler");
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <span style={{ color: "#566273", fontSize: 13, fontFamily: "'Geist Mono', monospace" }}>
          Pruefe Zugang...
        </span>
      </div>
    );
  }

  if (status === "unlocked") return <>{children}</>;

  const mono = "'Geist Mono', monospace";

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh" }}>
      <div style={{ background: "#0E131A", border: "1px solid #1A222D", borderRadius: 16, padding: "40px 36px", width: "100%", maxWidth: 380, textAlign: "center" as const }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(88,166,255,.1)", border: "1px solid rgba(88,166,255,.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <i className="ph-bold ph-lock-key" style={{ fontSize: 22, color: "#58A6FF" }} />
        </div>

        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.18em", color: "#566273", textTransform: "uppercase" as const, marginBottom: 8 }}>
          Markt-Scanner
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#F4F8FC", margin: "0 0 6px" }}>
          Zugangscode erforderlich
        </h2>
        <p style={{ fontSize: 12.5, color: "#566273", margin: "0 0 28px" }}>
          Dieser Bereich ist passwortgeschuetzt.
        </p>

        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && unlock()}
          placeholder="Zugangscode eingeben"
          autoFocus
          style={{ width: "100%", padding: "11px 14px", background: "#070C12", border: "1px solid #1A222D", borderRadius: 9, color: "#E7EDF5", fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 12, boxSizing: "border-box" as const, letterSpacing: "0.15em" }}
        />

        {error && (
          <div style={{ fontFamily: mono, fontSize: 11, color: "#F85149", marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button
          onClick={unlock}
          disabled={loading || !code.trim()}
          style={{ width: "100%", padding: "11px 0", borderRadius: 9, background: loading || !code.trim() ? "#0E1620" : "#1A6ED8", border: "none", color: loading || !code.trim() ? "#566273" : "#fff", fontSize: 14, fontWeight: 600, cursor: loading || !code.trim() ? "not-allowed" : "pointer", fontFamily: "inherit" }}
        >
          {loading ? "Pruefen..." : "Entsperren"}
        </button>
      </div>
    </div>
  );
}
