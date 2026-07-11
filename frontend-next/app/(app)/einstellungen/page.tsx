"use client";

import { useEffect, useState } from "react";

interface DataJob {
  key: string;
  label: string;
  freq: string;
  status: "ok" | "error" | "skipped" | "deferred" | null;
  lastRun: string | null;
  since: string | null;
  detail: Record<string, unknown> | null;
}

const JOB_STATUS: Record<string, { label: string; color: string }> = {
  ok:       { label: "OK",            color: "#3FB950" },
  error:    { label: "Fehler",        color: "#F85149" },
  skipped:  { label: "Uebersprungen", color: "#D8A430" },
  deferred: { label: "Verzoegert",    color: "#D8A430" },
};

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
  const [email, setEmail]             = useState("");
  const [isAdmin, setIsAdmin]         = useState(false);
  const [jobs, setJobs]               = useState<DataJob[]>([]);
  const [nextRun, setNextRun]         = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((me) => {
        setEmail(me.email ?? "");
        setIsAdmin(me.isAdmin === true);
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

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>

      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", color: "#58A6FF", textTransform: "uppercase" as const, marginBottom: 8 }}>
          Einstellungen
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "#F4F8FC", margin: 0 }}>
          Konto &amp; Daten
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
      </div>

      <div style={{ ...card, marginBottom: 0 }}>
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

    </div>
  );
}
