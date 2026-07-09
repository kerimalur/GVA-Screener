"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "420px", padding: "0 24px" }}>
        <div style={{
          width: "52px", height: "52px", borderRadius: "14px",
          background: "var(--color-down-dim)",
          border: "1px solid rgba(239,100,97,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 24px auto",
        }}>
          <i className="ph-bold ph-warning" style={{ fontSize: "22px", color: "var(--color-down)" }} />
        </div>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-text)", marginBottom: "10px" }}>
          Etwas ist schiefgelaufen
        </h1>
        <p style={{ fontSize: "14px", color: "var(--color-muted)", lineHeight: 1.6, marginBottom: "32px" }}>
          Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.
        </p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{
              padding: "10px 20px", borderRadius: "8px",
              background: "var(--color-accent)", color: "#fff",
              fontSize: "13.5px", fontWeight: 600,
              border: "none", cursor: "pointer",
            }}
          >
            Erneut versuchen
          </button>
          <a
            href="/dashboard"
            style={{
              padding: "10px 20px", borderRadius: "8px",
              background: "var(--color-surface2)",
              border: "1px solid var(--color-border)",
              color: "var(--color-muted)",
              fontSize: "13.5px", fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Dashboard
          </a>
        </div>
        {error.digest && (
          <p style={{ marginTop: "24px", fontSize: "11px", color: "var(--color-faint)", fontFamily: "var(--font-mono)" }}>
            Fehler-ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
