"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchScreener, markPair, type MarketData } from "@/lib/gva/api";
import { loadAppSettings } from "@/lib/settings/client";
import { adoptHitPair } from "@/lib/setup/adopt";
import { toast } from "@/components/ui/Toaster";
import RadarView from "./RadarView";
import HeatmapView from "./HeatmapView";
import DetailsModal from "./DetailsModal";

interface ScannerShellProps {
  mode: "radar" | "heatmap";
}

export default function ScannerShell({ mode }: ScannerShellProps) {
  const [data, setData] = useState<MarketData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MarketData | null>(null);

  const load = useCallback(async () => {
    try {
      const snap = await fetchScreener();
      const rows = snap.data;
      setData(rows);
      setError(null);
      // Modal-Item aktualisieren, falls offen
      setSelected((sel) => (sel ? rows.find((r) => r.pair === sel.pair) ?? sel : sel));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
    // Intervall aus App-Settings (Einstellungen → Markt-Scanner)
    const pollMs = loadAppSettings().scanner.pollSec * 1000;
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [load]);

  const handleMark = useCallback(
    async (pair: string, action: "pending" | "done") => {
      await markPair(pair, action);
      if (action === "done") setSelected(null);
      await load();
    },
    [load],
  );

  // „Pending" → manuelle Übernahme: Cockpit (Getroffen) + Outlook („Aktiv").
  // Nur auf Klick — keine automatische Massenübernahme aller Hits.
  const handleAdopt = useCallback(
    async (item: MarketData) => {
      const level =
        item.near === "SHORT" ? item.short : item.near === "LONG" ? item.long : null;
      try {
        const res = await adoptHitPair(item.pair, item.near, level);
        toast.success(
          res === "aktiviert"
            ? `${item.pair} übernommen · Outlook auf „Aktiv"`
            : `${item.pair} übernommen · Outlook („Aktiv") angelegt`,
        );
      } catch {
        toast.error("Übernahme fehlgeschlagen");
      }
      setSelected(null);
      await load();
    },
    [load],
  );

  if (loading) {
    return (
      <div className="h-60 flex items-center justify-center text-muted text-sm font-mono">
        Lade Screener-Daten …
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <div className="h-60 flex flex-col items-center justify-center gap-2 text-sm">
        <span className="text-down font-semibold">Backend nicht erreichbar</span>
        <span className="text-muted font-mono text-xs">{error}</span>
        <span className="text-faint text-xs">
          FastAPI-Backend (Render) prüfen — NEXT_PUBLIC_GVA_API_URL
        </span>
      </div>
    );
  }

  return (
    <>
      {mode === "radar" ? (
        <RadarView data={data} onSelect={setSelected} />
      ) : (
        <HeatmapView data={data} onSelect={setSelected} />
      )}
      {selected && (
        <DetailsModal
          item={selected}
          onClose={() => setSelected(null)}
          onMark={handleMark}
          onAdopt={handleAdopt}
        />
      )}
    </>
  );
}
