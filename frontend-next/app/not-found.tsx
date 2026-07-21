import Link from "next/link";

export default function NotFound() {
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
          fontSize: "72px", fontWeight: 800, letterSpacing: "-4px",
          color: "var(--color-surface2)", lineHeight: 1, marginBottom: "24px",
          fontVariantNumeric: "tabular-nums",
        }}>
          404
        </div>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-text)", marginBottom: "10px" }}>
          Seite nicht gefunden
        </h1>
        <p style={{ fontSize: "14px", color: "var(--color-muted)", lineHeight: 1.6, marginBottom: "32px" }}>
          Diese Seite existiert nicht oder wurde verschoben.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "10px 20px", borderRadius: "8px",
            background: "var(--color-accent)", color: "var(--color-sidebar)",
            fontSize: "13.5px", fontWeight: 600, textDecoration: "none",
            transition: "opacity 150ms",
          }}
        >
          Zur Übersicht
        </Link>
      </div>
    </div>
  );
}
