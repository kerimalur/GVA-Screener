"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ML-Modell-Panel: spricht das Python-Backend (Render) an — LightGBM-Modelle.
 * Predictions aller 28 Pairs, Walk-Forward-Report, Feature Importance, Training.
 */

const API = (process.env.NEXT_PUBLIC_GVA_API_URL || "https://gva-screener.onrender.com").replace(
  /\/+$/,
  "",
);

interface Prediction {
  pair: string;
  direction: "LONG" | "SHORT";
  probability: number;
  confidence: "high" | "medium" | "low";
  week_start: string;
}

interface FoldDetail {
  fold: number;
  test_from: string;
  test_to: string;
  n: number;
  oos_acc: number;
  oos_auc: number;
  high_conf_wr: number | null;
}

interface Report {
  created_at: string;
  summary: {
    folds: number;
    oos_n: number;
    oos_acc: number;
    oos_auc: number;
    oos_high_conf_wr: number | null;
    oos_high_conf_n: number;
  };
  fold_details: FoldDetail[];
  feature_importance: Array<{ feature: string; gain_pct: number }>;
}

interface TrainStatus {
  state: "idle" | "running" | "done" | "error";
  stage?: string;
  error?: string;
}

const isSeasonFeature = (f: string) =>
  f.startsWith("month") || ["week_of_month", "is_quarter_end", "half_year"].includes(f);

function confCls(c: Prediction["confidence"], dir: Prediction["direction"]): string {
  if (c === "low") return "text-faint";
  const base = dir === "LONG" ? "text-up" : "text-down";
  return c === "high" ? `${base} font-black` : base;
}

export default function MlModelPanel() {
  const [horizon, setHorizon] = useState(2);
  const [predictions, setPredictions] = useState<Prediction[] | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState<TrainStatus>({ state: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (h: number) => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, rRes] = await Promise.all([
        fetch(`${API}/ml/predict-all?horizon=${h}`),
        fetch(`${API}/ml/report?horizon=${h}`),
      ]);
      if (pRes.status === 404 || rRes.status === 404) {
        setPredictions(null);
        setReport(null);
        setError("Noch kein trainiertes Modell — Training starten.");
        return;
      }
      if (!pRes.ok || !rRes.ok) throw new Error(`Backend ${pRes.status}/${rRes.status}`);
      const pJson = await pRes.json();
      const rJson = await rRes.json();
      setPredictions(pJson.predictions ?? []);
      setReport(rJson);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backend nicht erreichbar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(horizon);
  }, [horizon, load]);

  useEffect(() => {
    fetch(`${API}/ml/status`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startTraining = async () => {
    try {
      const r = await fetch(`${API}/ml/train`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setStatus({ state: "running", stage: "starting" });
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const s: TrainStatus = await (await fetch(`${API}/ml/status`)).json();
          setStatus(s);
          if (s.state === "done" || s.state === "error") {
            if (pollRef.current) clearInterval(pollRef.current);
            if (s.state === "done") load(horizon);
          }
        } catch {
          /* Poll-Fehler ignorieren, nächster Tick */
        }
      }, 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Training-Start fehlgeschlagen");
    }
  };

  const seg = (active: boolean) =>
    `px-2.5 py-1 rounded text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
      active ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-text"
    }`;

  const s = report?.summary;
  const maxGain = report?.feature_importance[0]?.gain_pct ?? 1;

  return (
    <div className="space-y-5">
      {/* Kopfleiste */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((h) => (
            <button key={h} className={seg(horizon === h)} onClick={() => setHorizon(h)}>
              {h}W
            </button>
          ))}
        </div>
        <button
          onClick={startTraining}
          disabled={status.state === "running"}
          className={`px-3 py-1 rounded text-[11px] font-mono font-bold border transition-colors ${
            status.state === "running"
              ? "border-border text-faint cursor-not-allowed"
              : "border-up/50 text-up hover:bg-up/10 cursor-pointer"
          }`}
        >
          {status.state === "running"
            ? `Training läuft… (${status.stage ?? "…"})`
            : "Training starten"}
        </button>
        {status.state === "error" && (
          <span className="text-[11px] text-down font-mono">Training-Fehler: {status.error}</span>
        )}
        {status.state === "done" && (
          <span className="text-[11px] text-up font-mono">Training abgeschlossen ✓</span>
        )}
      </div>

      {loading && <p className="text-muted text-sm font-mono animate-pulse">Lade ML-Backend…</p>}
      {error && !loading && <p className="text-[12px] text-warn font-mono">{error}</p>}

      {/* Walk-Forward-Report */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">
              OOS-Winrate ({horizon}W)
            </div>
            <div
              className={`text-2xl font-black font-mono mt-1 ${
                s.oos_acc >= 0.53 ? "text-up" : s.oos_acc <= 0.47 ? "text-down" : "text-muted"
              }`}
            >
              {(s.oos_acc * 100).toFixed(1)}%
            </div>
            <div className="text-[10px] text-faint font-mono mt-0.5">
              n={s.oos_n.toLocaleString("de-CH")} · {s.folds} Folds · Walk-Forward
            </div>
          </div>
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">
              High-Conf-Winrate
            </div>
            <div
              className={`text-2xl font-black font-mono mt-1 ${
                (s.oos_high_conf_wr ?? 0) >= 0.55 ? "text-up" : "text-muted"
              }`}
            >
              {s.oos_high_conf_wr !== null ? `${(s.oos_high_conf_wr * 100).toFixed(1)}%` : "–"}
            </div>
            <div className="text-[10px] text-faint font-mono mt-0.5">
              p≥0.58 · n={s.oos_high_conf_n}
            </div>
          </div>
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">OOS-AUC</div>
            <div className="text-2xl font-black font-mono mt-1">{s.oos_auc.toFixed(3)}</div>
            <div className="text-[10px] text-faint font-mono mt-0.5">0.5 = Münzwurf</div>
          </div>
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider">
              Winrate je Fold
            </div>
            <div className="flex items-end gap-[2px] h-10 mt-1.5">
              {report!.fold_details.map((f) => (
                <div
                  key={f.fold}
                  title={`${f.test_from} → ${f.test_to}: ${(f.oos_acc * 100).toFixed(1)}%`}
                  className={`flex-1 rounded-t ${f.oos_acc >= 0.5 ? "bg-up/60" : "bg-down/60"}`}
                  style={{ height: `${Math.max(8, Math.min(100, (f.oos_acc - 0.4) * 500))}%` }}
                />
              ))}
            </div>
            <div className="text-[9px] text-faint font-mono mt-1">ältester → neuester Fold</div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {/* Predictions */}
        {predictions && (
          <div>
            <div className="text-[11px] text-muted font-mono uppercase tracking-wider mb-1.5">
              Predictions aktuelle Woche ({horizon}W) — sortiert nach Probability
            </div>
            <div className="overflow-y-auto max-h-[420px] border border-border rounded">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[9px] text-faint font-mono uppercase tracking-wider sticky top-0 bg-surface">
                    <th className="text-left py-1.5 px-2">Pair</th>
                    <th className="text-left py-1.5 px-2">Richtung</th>
                    <th className="text-right py-1.5 px-2">Probability</th>
                    <th className="text-right py-1.5 px-2">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.map((p) => (
                    <tr key={p.pair} className="border-t border-border">
                      <td className="py-1.5 px-2 font-mono font-medium">
                        {p.pair.replace("_", "/")}
                      </td>
                      <td className={`py-1.5 px-2 font-mono ${confCls(p.confidence, p.direction)}`}>
                        {p.direction}
                      </td>
                      <td className={`py-1.5 px-2 text-right font-mono ${confCls(p.confidence, p.direction)}`}>
                        {(p.probability * 100).toFixed(1)}%
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase ${
                            p.confidence === "high"
                              ? "bg-up/15 text-up"
                              : p.confidence === "medium"
                                ? "bg-warn/15 text-warn"
                                : "bg-surface2 text-faint"
                          }`}
                        >
                          {p.confidence}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Feature Importance */}
        {report && report.feature_importance.length > 0 && (
          <div>
            <div className="text-[11px] text-muted font-mono uppercase tracking-wider mb-1.5">
              Feature Importance Top 15 —{" "}
              <span className="text-accent">COT</span> · <span className="text-up">Saison</span>
            </div>
            <div className="space-y-1">
              {report.feature_importance.map((f) => (
                <div key={f.feature} className="flex items-center gap-2">
                  <div className="w-52 shrink-0 text-[10px] font-mono text-muted truncate" title={f.feature}>
                    {f.feature}
                  </div>
                  <div className="flex-1 h-3.5 bg-surface2 rounded overflow-hidden">
                    <div
                      className={`h-full rounded ${isSeasonFeature(f.feature) ? "bg-up/70" : "bg-accent/70"}`}
                      style={{ width: `${Math.max(2, (f.gain_pct / maxGain) * 100)}%` }}
                    />
                  </div>
                  <div className="w-12 text-right text-[10px] font-mono text-faint">
                    {f.gain_pct.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-faint leading-relaxed border-t border-border/50 pt-3">
        LightGBM, 4 Modelle (je Horizont), ~40 Features aus COT-Rohdaten (Non-Commercials,
        Commercials, TFF Leveraged/Asset-Manager: Perzentile, Flows, Beschleunigung, Divergenz, OI)
        + Saisonalität (as-of, ohne Lookahead). Walk-Forward: 156W Training / 52W Test / 26W Step —
        alle Metriken sind out-of-sample. High-Confidence = Probability ≥ 0.58.
      </p>
    </div>
  );
}
