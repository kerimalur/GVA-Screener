"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { savePref } from "@/lib/journal/prefs";
import { ONBOARDING_PREF_KEY } from "@/components/onboarding/OnboardingTour";

type SubStatus = "active" | "trialing" | "past_due" | "canceled" | "inactive" | null;

interface DataJob {
  key: string;
  label: string;
  freq: string;
  status: "ok" | "error" | "skipped" | "deferred" | null;
  lastRun: string | null;
  since: string | null;
  detail: Record<string, unknown> | null;
}

const SUB_STATUS: Record<NonNullable<SubStatus>, { label: string; color: string }> = {
  active:   { label: "Aktiv",         color: "#3FB950" },
  trialing: { label: "Testphase",     color: "#58A6FF" },
  past_due: { label: "Zahlung offen", color: "#D8A430" },
  canceled: { label: "Gekuendigt",    color: "#F85149" },
  inactive: { label: "Inaktiv",       color: "#566273" },
};

const JOB_STATUS: Record<string, { label: string; color: string }> = {
  ok:       { label: "OK",            color: "#3FB950" },
  error:    { label: "Fehler",        color: "#F85149" },
  skipped:  { label: "Uebersprungen", color: "#D8A430" },
  deferred: { label: "Verzoegert",    color: "#D8A430" },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });

const fmtRelative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return `vor ${mins} Min.`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `vor ${hrs} Std.`;
  const days = Math.floor(hrs / 24);
  return `vor ${days} Tag${days > 1 ? "en" : ""}`;
};

const fmtSince = (iso: string) =>
  new Date(iso).toLocaleDateString("de-CH", { day: "2-digit", month: "short", year: "numeric" });

export default function EinstellungenPage() {
  const [email, setEmail]                         = useState("");
  const [isAdmin, setIsAdmin]                     = useState(false);
  const [subStatus, setSubStatus]                 = useState<SubStatus>(null);
  const [periodEnd, setPeriodEnd]                 = useState<string | null>(null);
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);
  const [subLoading, setSubLoading]               = useState(true);
  const [portalLoading, setPortalLoading]         = useState(false);
  const [portalError, setPortalError]             = useState("");
  const [jobs, setJobs]                           = useState<DataJob[]>([]);
  const [nextRun, setNextRun]                     = useState<string | null>(null);
  const [dataLoading, setDataLoading]             = useState(true);
  const [tourLoading, setTourLoading]             = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((me) => {
        setEmail(me.email ?? "");
        setIsAdmin(me.isAdmin === true);
      });

    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("subscriptions")
        .select("status, current_period_end, stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          setSubStatus((data?.status as SubStatus) ?? "inactive");
          setPeriodEnd(data?.current_period_end ?? null);
          setHasStripeCustomer(!!data?.stripe_customer_id);
          setSubLoading(false);
        });
    });
  }, []);

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

  const restartTour = async () => {
    setTourLoading(true);
    try {
      // completed:false → OnboardingTour startet beim nächsten Seitenaufbau,
      // unabhängig vom Account-Alter (bewusster Neustart).
      await savePref(ONBOARDING_PREF_KEY, { completed: false, version: 1 });
      window.location.href = "/dashboard";
    } catch {
      setTourLoading(false);
    }
  };

  const mono = "'Geist Mono', monospace";
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

  const subInfo = subStatus ? SUB_STATUS[subStatus] : null;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>

      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", color: "#58A6FF", textTransform: "uppercase" as const, marginBottom: 8 }}>
          Einstellungen
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "#F4F8FC", margin: 0 }}>
          Konto &amp; Abonnement
        </h1>
      </div>

      <div style={card}>
        <div style={sectionLabel}>Konto</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(88,166,255,.15)", border: "1px solid rgba(88,166,255,.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#58A6FF", fontWeight: 700, fontSize: 14 }}>{email.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 14, color: "#E7EDF5", fontWeight: 500 }}>{email || "---"}</div>
              {isAdmin && (
                <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", padding: "2px 7px", borderRadius: 5, background: "rgba(216,164,48,.15)", color: "#D8A430", border: "1px solid rgba(216,164,48,.3)", textTransform: "uppercase" as const }}>
                  Admin
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: "#566273", marginTop: 2 }}>Google / GitHub Login</div>
          </div>
        </div>
        <div style={{ borderTop: "1px solid #1A222D", marginTop: 18, paddingTop: 14 }}>
          <button
            onClick={restartTour}
            disabled={tourLoading}
            style={{ background: "transparent", border: "none", padding: 0, color: "#7E8B9C", fontSize: 12.5, cursor: tourLoading ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "inherit" }}
          >
            <i className="ph-bold ph-play-circle" style={{ fontSize: 14 }} />
            {tourLoading ? "Starte Tour..." : "Onboarding-Tour erneut ansehen"}
          </button>
        </div>
      </div>

      <div style={card}>
        <div style={sectionLabel}>Abonnement</div>
        {subLoading ? (
          <div style={{ fontSize: 13, color: "#566273" }}>Laedt...</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#F4F8FC" }}>FX Terminal Pro</div>
                <div style={{ fontSize: 12.5, color: "#7E8B9C", marginTop: 3 }}>CHF 34.95 / Monat</div>
              </div>
              {subInfo && (
                <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, padding: "4px 10px", borderRadius: 6, background: `${subInfo.color}18`, color: subInfo.color, border: `1px solid ${subInfo.color}40` }}>
                  {subInfo.label}
                </span>
              )}
            </div>
            {periodEnd && (
              <div style={{ fontSize: 12.5, color: "#7E8B9C", marginBottom: 18 }}>
                {subStatus === "canceled"
                  ? `Zugang bis: ${fmtDate(periodEnd)}`
                  : `Naechste Abrechnung: ${fmtDate(periodEnd)}`}
              </div>
            )}
            <div style={{ borderTop: "1px solid #1A222D", paddingTop: 18 }}>
              {hasStripeCustomer ? (
                <>
                  <button
                    onClick={openPortal}
                    disabled={portalLoading}
                    style={{ padding: "10px 18px", borderRadius: 9, background: "transparent", border: "1px solid #2E3844", color: "#C7D1DD", fontSize: 13.5, fontWeight: 600, cursor: portalLoading ? "not-allowed" : "pointer", opacity: portalLoading ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}
                  >
                    <i className="ph-bold ph-credit-card" style={{ fontSize: 15 }} />
                    {portalLoading ? "Weiterleitung..." : "Abo verwalten / kuendigen"}
                  </button>
                  <div style={{ fontSize: 11.5, color: "#566273", marginTop: 10 }}>
                    Oeffnet das Stripe Kundenportal
                  </div>
                  {portalError && <div style={{ fontSize: 12, color: "#F85149", marginTop: 8 }}>{portalError}</div>}
                </>
              ) : isAdmin ? (
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#D8A430" }}>
                    <i className="ph-bold ph-info" style={{ fontSize: 14 }} />
                    Admin-Konto -- kein Stripe-Kunde verknuepft.
                  </div>
                  <a
                    href="https://dashboard.stripe.com/customers"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: "10px 18px", borderRadius: 9, background: "transparent", border: "1px solid #2E3844", color: "#C7D1DD", fontSize: 13.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}
                  >
                    <i className="ph-bold ph-arrow-square-out" style={{ fontSize: 15 }} />
                    Stripe Dashboard oeffnen
                  </a>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#566273" }}>Kein aktives Abonnement.</div>
              )}
            </div>
          </>
        )}
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={sectionLabel}>Daten</div>
          {nextRun && !dataLoading && (
            <span style={{ fontFamily: mono, fontSize: 10, color: "#566273" }}>
              Naechster Lauf: {new Date(nextRun).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })} Uhr
            </span>
          )}
        </div>
        {dataLoading ? (
          <div style={{ fontSize: 13, color: "#566273" }}>Laedt...</div>
        ) : jobs.length === 0 ? (
          <div style={{ fontSize: 13, color: "#566273" }}>Noch keine Daten geladen.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 0 }}>
            {jobs.map((job, i) => {
              const st = job.status ? JOB_STATUS[job.status] : null;
              return (
                <div key={job.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: i < jobs.length - 1 ? "1px solid #161D27" : "none" }}>
                  <div>
                    <div style={{ fontSize: 13.5, color: "#C7D1DD", fontWeight: 500 }}>{job.label}</div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: "#566273", marginTop: 3 }}>{job.freq}</div>
                    {job.since && (
                      <div style={{ fontFamily: mono, fontSize: 10, color: "#3A4A5C", marginTop: 2 }}>
                        seit {fmtSince(job.since)}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                    {job.lastRun ? (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: st?.color ?? "#566273", display: "inline-block" }} />
                          <span style={{ fontFamily: mono, fontSize: 10.5, color: st?.color ?? "#566273" }}>{st?.label ?? "---"}</span>
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
          <span style={{ fontFamily: mono, fontSize: 10, color: "#566273" }}>Automatisch taeglich um 06:30 Uhr (Schweizer Zeit)</span>
        </div>
      </div>

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
