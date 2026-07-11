"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Autarker Trainings-Button + Live-Status. Spricht direkt das Python-Backend
 * (Render) an — unabhängig von der schweren /ml-Server-Berechnung, damit der
 * Button immer sofort verfügbar ist.
 */

const API = (process.env.NEXT_PUBLIC_GVA_API_URL || "https://gva-screener.onrender.com").replace(
  /\/+$/,
  "",
);

interface TrainStatus {
  state: "idle" | "running" | "done" | "error";
  stage?: string;
  error?: string;
  dataset_rows?: number;
}

export default function TrainingButton() {
  const [status, setStatus] = useState<TrainStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`${API}/ml/status`)
      .then((r) => r.json())
      .then((s) => {
        setStatus(s);
        if (s.state === "running") startPolling();
      })
      .catch(() => setStatus({ state: "idle" }));
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s: TrainStatus = await (await fetch(`${API}/ml/status`)).json();
        setStatus(s);
        if (s.state === "done" || s.state === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        /* nächster Tick */
      }
    }, 5000);
  };

  const start = async () => {
    setMsg(null);
    try {
      const r = await fetch(`${API}/ml/train`, { method: "POST" });
      if (r.status === 401) {
        setMsg("Training ist schreibgeschützt (ML_TRAIN_KEY gesetzt).");
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setStatus({ state: "running", stage: "starting" });
      startPolling();
    } catch (e) {
      setMsg(
        e instanceof Error
          ? `Backend nicht erreichbar (${e.message}). Render-Service evtl. eingeschlafen — kurz warten und erneut.`
          : "Fehler",
      );
    }
  };

  const running = status?.state === "running";

  return (
    <div className="mt-2 space-y-2">
      <button
        onClick={start}
        disabled={running}
        className={`px-4 py-1.5 rounded text-[12px] font-mono font-bold border transition-colors ${
          running
            ? "border-border text-faint cursor-not-allowed"
            : "border-up/50 text-up hover:bg-up/10 cursor-pointer"
        }`}
      >
        {running ? `Training läuft… (${status?.stage ?? "…"})` : "Training starten"}
      </button>
      {status?.state === "done" && (
        <div className="text-[11px] text-up font-mono">
          Training abgeschlossen ✓ — Ergebnisse auf „Daten-Check“ im ML-Modell-Panel.
        </div>
      )}
      {status?.state === "error" && (
        <div className="text-[11px] text-down font-mono">Training-Fehler: {status.error}</div>
      )}
      {msg && <div className="text-[11px] text-warn font-mono">{msg}</div>}
    </div>
  );
}
