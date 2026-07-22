"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toaster";
import type { AccountType, Trade } from "@/lib/journal/types";
import { saveTrade } from "@/lib/journal/trades";
import { parseTradesCsv, markDuplicates, type MarkedTrade } from "@/lib/journal/csvImport";

const MONO = "'JetBrains Mono',monospace";

interface Props {
  accountType: AccountType;
  existingTrades: Trade[];
  onClose: () => void;
  onImported: () => void;
}

export default function CsvImportModal({ accountType, existingTrades, onClose, onImported }: Props) {
  const [marked, setMarked] = useState<MarkedTrade[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  const dupCount = useMemo(() => marked.filter((m) => m.duplicate).length, [marked]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseTradesCsv(String(reader.result ?? ""));
      if (parsed.length === 0) {
        setMarked([]);
        setSelected(new Set());
        setError("Keine Trades erkannt. Erwartet: Broker-CSV mit Spalten wie Symbol, Type, Close Time, Profit (MT4/MT5/Vantage-Export).");
        return;
      }
      const m = markDuplicates(parsed, existingTrades);
      setMarked(m);
      // Neue Trades vorausgewählt, Duplikate nicht.
      setSelected(new Set(m.map((x, i) => (x.duplicate ? -1 : i)).filter((i) => i >= 0)));
      setFileName(f.name);
      setError("");
    };
    reader.readAsText(f);
  };

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const doImport = async () => {
    setImporting(true);
    let ok = 0;
    let fail = 0;
    for (const i of selected) {
      const p = marked[i].trade;
      try {
        await saveTrade({
          type: accountType,
          pair: p.pair,
          direction: p.direction,
          date: p.date,
          result: p.result,
          rMultiple: p.rMultiple,
          profitAmount: p.profitAmount,
          entryPrice: p.entryPrice,
          exitPrice: p.exitPrice,
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit,
          lotSize: p.lotSize,
          session: p.session,
          sessionType: "live",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setImporting(false);
    if (ok > 0) toast.success(`${ok} Trade${ok === 1 ? "" : "s"} importiert${fail ? `, ${fail} fehlgeschlagen` : ""}`);
    else if (fail > 0) toast.error("Import fehlgeschlagen");
    onImported();
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Trades aus CSV importieren"
      subtitle={`Broker-Export (MT4/MT5/Vantage) → Konto ${accountType === "funded" ? "Funded" : "Eigenkapital"}`}
      footer={
        marked.length > 0 ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={importing}>Abbrechen</Button>
            <Button icon="ph-download-simple" onClick={doImport} disabled={importing || selected.size === 0}>
              {importing ? "Importiere…" : `${selected.size} importieren`}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>Schließen</Button>
        )
      }
    >
      {marked.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <p style={{ fontSize: "13px", color: "var(--color-muted)", lineHeight: 1.6 }}>
            Wähle den CSV-Export deines Brokers. Erkannt werden Pair, Richtung, Schlussdatum, Ergebnis
            und — wo Ein-/Ausstieg und Stop vorhanden — das R-Vielfache. Bereits erfasste Trades werden
            als Duplikat markiert und nicht doppelt angelegt. Manuelles Erfassen bleibt unverändert.
          </p>
          <label
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "28px", borderRadius: "12px", border: "1.5px dashed var(--color-border2)", background: "var(--color-surface2)", cursor: "pointer" }}
          >
            <i className="ph-bold ph-upload-simple" style={{ fontSize: "24px", color: "var(--color-accent)" }} />
            <span style={{ fontSize: "13px", fontWeight: 600 }}>CSV-Datei wählen</span>
            <input type="file" accept=".csv,.txt,text/csv" onChange={onFile} style={{ display: "none" }} />
          </label>
          {error && <p style={{ fontSize: "12px", color: "var(--color-down)", lineHeight: 1.5 }}>{error}</p>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "12px", fontFamily: MONO, color: "var(--color-faint)" }}>
            <span>{fileName}</span>
            <span>{marked.length} erkannt</span>
            <span style={{ color: "var(--color-up)" }}>{marked.length - dupCount} neu</span>
            {dupCount > 0 && <span style={{ color: "var(--color-warn)" }}>{dupCount} Duplikat{dupCount === 1 ? "" : "e"}</span>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "46vh", overflowY: "auto" }}>
            {marked.map((m, i) => {
              const t = m.trade;
              const checked = selected.has(i);
              return (
                <label
                  key={i}
                  style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", padding: "9px 10px", borderRadius: "9px", border: "1px solid var(--color-border)", background: "var(--color-surface2)", fontSize: "12px", fontFamily: MONO, cursor: "pointer", opacity: m.duplicate && !checked ? 0.55 : 1 }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(i)} style={{ width: "17px", height: "17px", accentColor: "var(--color-accent)", flexShrink: 0 }} />
                  <span style={{ color: "var(--color-faint)" }}>{t.date}</span>
                  <span style={{ fontWeight: 700, color: "var(--color-text)" }}>{t.pair}</span>
                  <span style={{ color: t.direction === "long" ? "var(--color-up)" : "var(--color-down)" }}>{t.direction.toUpperCase()}</span>
                  <span style={{ fontWeight: 700, color: t.rMultiple > 0 ? "var(--color-up)" : t.rMultiple < 0 ? "var(--color-down)" : "var(--color-faint)" }}>
                    {t.rMultiple > 0 ? "+" : ""}{t.rMultiple.toFixed(2)}R
                  </span>
                  {t.profitAmount != null && (
                    <span style={{ color: "var(--color-faint)" }}>{t.profitAmount > 0 ? "+" : ""}{t.profitAmount}</span>
                  )}
                  <span style={{ marginLeft: "auto", display: "flex", gap: "6px", alignItems: "center" }}>
                    {t.session && <span style={{ fontSize: "10px", color: "var(--color-faint)" }}>{t.session}</span>}
                    {m.duplicate && <Badge tone="warn">Duplikat</Badge>}
                  </span>
                </label>
              );
            })}
          </div>
          <p style={{ fontSize: "11px", color: "var(--color-faint)", lineHeight: 1.5 }}>
            Ohne Stop-Loss in der Datei bleibt das R-Vielfache 0 — später im Trade nachtragen. Session
            aus der Eintritts-Uhrzeit abgeleitet (Broker-Serverzeit).
          </p>
        </div>
      )}
    </Modal>
  );
}
