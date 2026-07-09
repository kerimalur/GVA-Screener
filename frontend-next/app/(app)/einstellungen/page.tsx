"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────
type SubStatus = "active" | "trialing" | "past_due" | "canceled" | "inactive" | null;

interface DataJob {
  key: string;
  label: string;
  freq: string;
  status: "ok" | "error" | "skipped" | "deferred" | null;
  lastRun: string | null;
  detail: Record<string, unknown> | null;
}

// ── Constants ─────────────────────────────────────────────────────────────
const SUB_STATUS: Record<NonNullable<SubStatus>, { label: string; color: string }> = {
  active:   { label: "Aktiv",         color: "#3FB950" },
  trialing: { label: "Testphase",     color: "#58A6FF" },
  past_due: { label: "Zahlung offen", color: "#D8A430" },
  canceled: { label: "Gekündigt",     color: "#F85149" },
  inactive: { label: "Inaktiv",       color: "#566273" },
};

const JOB_STATUS: Record<string, { label: string; color: string }> = {
  ok:       { label: "OK",         color: "#3FB950" },
  error:    { label: "Fehler",     color: "#F85149" },
  skipped:  { label: "Übersprungen", color: "#D8A430" },
  deferred: { label: "Verzögert",  color: "#D8A430" },
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });

const fmtRelative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)   return `vor ${mins} Min.`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)    return `vor ${hrs} Std.`;
  const days = Math.floor(hrs / 24);
  return `vor ${days} Tag${days > 1 ? "en" : ""}`;
};

// ── Component ──────────────────────────────────────────────────────────────
export default function EinstellungenPage() {
  const [email, setEmail]                   = useState("");
  const [subStatus, setSubStatus]           = useState<SubStatus>(null);
  const [periodEnd, setPeriodEnd]           = useState<string | null>(null);
  const [subLoading, setSubLoading]         = useState(true);
  const [portalLoading, setPortalLoading]   = useState(false);
  const [portalError, setPortalError]       = useState("");
  const [jobs, setJobs]                     = useState<DataJob[]>([]);
  const [nextRun, setNextRun]               = useState<string | null>(null);
  const [dataLoading, setDataLoading]       = useState(true);

  // Load subscription
  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setEmail(user.email ?? "");
      supabase
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          setSubStatus((data?.status as SubStatus) ?? "inactive");
          setPeriodEnd(data?.current_period_end ?? null);
          setSubLoading(false);
        });
    });
  }, []);

  // Load data status
  useEffect(() => {
    fetch("/api/data/status")
      .then((r) => r.json())
      .then((d) => {
        setJobs(d.jobs ?? []);
        setNextRun(d.nextRun ?? null);
        setDataLoading(false);
      })
      .catch(() => setDataLoading(false));
  }, []);

  const openPortal = async () => {
    setPortalLoading(true);
    setPortalError("");
    try {
      const res  = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fehler");
      window.location.href = data.url;
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : "Fehler");
      setPortalLoading(false);
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────────
  const mono  = "'Geist Mono', monospace";
  const card: React.CSSProperties = {
    background: "#0E131A",
    border: "1px solid #1A222D",
    borderRadius: 12,
    padding: "22px 26px",
    marginBottom: 16,
  };
  const sectionLabel: React.CSSProperties = {
    fontFamily: mono,
    fontSize: 9.5,
    letterSpacing: "0.18em",
    color: "#566273",
    textTransform: "uppercase",
    marginBottom: 16,
  };

  const subInfo  = subStatus ? SUB_STATUS[subStatus] : null;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", color: "#58A6FF", textTransform: "uppercase", marginBottom: 8 }}>
          Einstellungen
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "#F4F8FC", margin: 0 }}>
          Konto & Abonnement
        </h1>
      </div>

      {/* ── Account ── */}
      <div style={card}>
        <div style={sectionLabel}>Konto</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(88,166,255,.15)", border: "1px solid rgba(88,166,255,.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#58A6FF", fontWeight: 700, fontSize: 14 }}>{email.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <div style={{ fontSize: 14, color: "#E7EDF5", fontWeight: 500 }}>{email || "—"}</div>
            <div style={{ fontSize: 11.5, color: "#566273", marginTop: 2 }}>Google / GitHub Login</div>
          </div>
        </div>
      </div>

      {/* ── Abonnement ── */}
      <div style={card}>
        <div style={sectionLabel}>Abonnement</div>
        {subLoading ? (
          <div style={{ fontSize: 13, color: "#566273" }}>Lädt…</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#F4F8FC" }}>FX Terminal Pro</div>
                <div style={{ fontSize: 12.5, color: "#7E8B9C", marginTop: 3 }}>CHF 34.95 / Monat</div>
              </div>
              {subInfo && (
                <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 6, background: `${subInfo.color}18`, color: subInfo.color, border: `1px solid ${subInfo.color}40` }}>
                  {subInfo.label}
                </span>
              )}
            </div>
            {periodEnd && (
              <div style={{ fontSize: 12.5, color: "#7E8B9C", marginBottom: 18 }}>
                {subStatus === "canceled"
                  ? `Zugang bis: ${fmtDate(periodEnd)}`
                  : `Nächste Abrechnung: ${fmtDate(periodEnd)}`}
              </div>
            )}
            <div style={{ borderTop: "1px solid #1A222D", paddingTop: 18 }}>
              <button
                onClick={openPortal}
                disabled={portalLoading || subStatus === "inactive"}
                style={{ padding: "10px 18px", borderRadius: 9, background: "transparent", border: "1px solid #2E3844", color: "#C7D1DD", fontSize: 13.5, fontWeight: 600, cursor: portalLoading || subStatus === "inactive" ? "not-allowed" : "pointer", opacity: portalLoading || subStatus === "inactive" ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}
              >
                <i className="ph-bold ph-credit-card" style={{ fontSize: 15 }} />
                {portalLoading ? "Weiterleitung…" : "Abo verwalten / kündigen"}
              </button>
              <div style={{ fontSize: 11.5, color: "#566273", marginTop: 10 }}>
                Öffnet das Stripe Kundenportal — Zahlungsmethode ändern, Rechnungen herunterladen, Abo kündigen.
              </div>
              {portalError && <div style={{ fontSize: 12, color: "#F85149", marginTop: 8 }}>{portalError}</div>}
            </div>
          </>
        )}
      </div>

      {/* ── Daten ── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={sectionLabel}>Daten</div>
          {nextRun && !dataLoading && (
            <span style={{ fontFamily: mono, fontSize: 10, color: "#566273" }}>
              Nächste Aktualisierung: {new Date(nextRun).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })} Uhr
            </span>
          )}
        </div>

        {dataLoading ? (
          <div style={{ fontSize: 13, color: "#566273" }}>Lädt…</div>
        ) : jobs.length === 0 ? (
          <div style={{ fontSize: 13, color: "#566273" }}>Noch keine Daten geladen.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {jobs.map((job, i) => {
              const st = job.status ? JOB_STATUS[job.status] : null;
              return (
                <div key={job.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: i < jobs.length - 1 ? "1px solid #161D27" : "none" }}>
                  <div>
                    <div style={{ fontSize: 13.5, color: "#C7D1DD", fontWeight: 500 }}>{job.label}</div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: "#566273", marginTop: 3 }}>{job.freq}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {job.lastRun ? (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: st?.color ?? "#566273", display: "inline-block", flexShrink: 0 }} />
                          <span style={{ fontFamily: mono, fontSize: 10.5, color: st?.color ?? "#566273" }}>{st?.label ?? "—"}</span>
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 10, color: "#566273", marginTop: 3 }}>{fmtRelative(job.lastRun)}</div>
                      </>
                    ) : (
                      <span style={{ fontFamily: mono, fontSize: 10.5, color: "#566273" }}>Noch nicht geladen</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #161D27", display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#3FB950", display: "inline-block" }} />
          <span style={{ fontFamily: mono, fontSize: 10, color: "#566273" }}>Automatisch täglich um 06:30 Uhr (Schweizer Zeit)</span>
        </div>
      </div>

      {/* ── Rechtliches ── */}
      <div style={{ ...card, marginBottom: 0 }}>
        <div style={sectionLabel}>Rechtliches</div>
        <div style={{ display: "flex", gap: 20, fontSize: 13 }}>
          {([["AGB", "/agb"], ["Datenschutz", "/datenschutz"], ["Impressum", "/impressum"]] as [string, string][]).map(([label, href]) => (
            <a key={href} href={href} style={{ color: "#7E8B9C", textDecoration: "none" }}>{label}</a>
          ))}
        </div>
      </div>

    </div>
  );
}
