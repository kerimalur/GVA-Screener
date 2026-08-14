"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui";

interface DataJob {
  key: string;
  label: string;
  freq: string;
  status: "ok" | "error" | "skipped" | "deferred" | null;
  lastRun: string | null;
  since: string | null;
  detail: Record<string, unknown> | null;
}

const JOB_STATUS: Record<string, { label: string; cls: string }> = {
  ok:       { label: "OK",            cls: "bg-up text-up" },
  error:    { label: "Fehler",        cls: "bg-down text-down" },
  skipped:  { label: "Uebersprungen", cls: "bg-warn text-warn" },
  deferred: { label: "Verzoegert",    cls: "bg-warn text-warn" },
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

  return (
    <div className="max-w-[640px] mx-auto space-y-4">
      <Panel title="Konto" hint="Login & Rolle">
        <div className="flex items-center gap-3">
          <div className="w-[38px] h-[38px] rounded-full shrink-0 flex items-center justify-center bg-accent-dim border border-accent/30">
            <span className="text-accent font-bold text-[14px]">{email.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-[14px] font-medium">{email || "---"}</div>
              {isAdmin && (
                <span className="inline-block px-1.5 py-0.5 rounded-(--radius-tag) border text-[10px] font-black font-mono uppercase tracking-wider bg-warn-dim text-warn border-warn/30">
                  Admin
                </span>
              )}
            </div>
            <div className="text-[11.5px] text-faint mt-0.5">Google / GitHub Login</div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Daten"
        hint="Cron-Jobs & Frische der Quellen"
        right={
          nextRun && !dataLoading ? (
            <span className="font-mono text-[10px] text-faint">
              Naechster Lauf:{" "}
              {new Date(nextRun).toLocaleTimeString("de-CH", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Zurich",
              })}{" "}
              Uhr
            </span>
          ) : undefined
        }
      >
        {dataLoading ? (
          <div className="text-[13px] text-faint">Laedt...</div>
        ) : jobs.length === 0 ? (
          <div className="text-[13px] text-faint">Noch keine Daten geladen.</div>
        ) : (
          <div className="flex flex-col">
            {jobs.map((job, i) => {
              const st = job.status ? JOB_STATUS[job.status] : null;
              const [dotCls, textCls] = st ? st.cls.split(" ") : ["bg-faint", "text-faint"];
              return (
                <div
                  key={job.key}
                  className={`flex items-center justify-between py-3 ${
                    i < jobs.length - 1 ? "border-b border-border/60" : ""
                  }`}
                >
                  <div>
                    <div className="text-[13.5px] font-medium">{job.label}</div>
                    <div className="font-mono text-[10px] text-faint mt-0.5">{job.freq}</div>
                    {job.since && (
                      <div className="font-mono text-[10px] text-faint/70 mt-0.5">seit {fmtSince(job.since)}</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {job.lastRun ? (
                      <>
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className={`w-1.5 h-1.5 rounded-full inline-block ${dotCls}`} />
                          <span className={`font-mono text-[10.5px] ${textCls}`}>{st?.label ?? "---"}</span>
                        </div>
                        <div className="font-mono text-[10px] text-faint mt-0.5">{fmtRelative(job.lastRun)}</div>
                      </>
                    ) : (
                      <span className="font-mono text-[10.5px] text-faint">Noch nicht geladen</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 pt-3.5 border-t border-border flex items-center gap-[7px]">
          <span className="w-[5px] h-[5px] rounded-full bg-up inline-block" />
          <span className="font-mono text-[10px] text-faint">
            Automatisch taeglich um 06:30 Uhr (Schweizer Zeit)
          </span>
        </div>
      </Panel>
    </div>
  );
}
