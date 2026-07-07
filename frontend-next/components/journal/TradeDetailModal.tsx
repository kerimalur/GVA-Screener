"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { Trade } from "@/lib/journal/types";
import { SETUP_DEFINITIONS } from "@/lib/journal/types";
import { loadScreenshot } from "@/lib/journal/screenshots";

interface TradeDetailModalProps {
  trade: Trade;
  onClose: () => void;
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-border/60 last:border-0">
      <span className="text-[11px] text-muted uppercase tracking-wide">{label}</span>
      <span className="text-[13px] font-mono">{value}</span>
    </div>
  );
}

export default function TradeDetailModal({
  trade,
  onClose,
  onEdit,
  onDelete,
}: TradeDetailModalProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    loadScreenshot(trade.id).then((d) => d && setScreenshot(d));
  }, [trade.id]);

  const profit = trade.profitAmount ?? 0;
  const activeSetups = Object.values(SETUP_DEFINITIONS).filter(
    (s) => trade[s.key as keyof Trade],
  );

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`${trade.pair} · ${trade.direction.toUpperCase()}`}
        subtitle={trade.date}
        size="lg"
        footer={
          <>
            <Button variant="danger" size="sm" icon="ph-trash" onClick={() => onDelete(trade)}>
              Löschen
            </Button>
            <Button variant="ghost" size="sm" icon="ph-pencil-simple" onClick={() => onEdit(trade)}>
              Bearbeiten
            </Button>
            <Button size="sm" onClick={onClose}>
              Schließen
            </Button>
          </>
        }
      >
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge tone={trade.result === "win" ? "up" : trade.result === "loss" ? "down" : "neutral"}>
                {trade.result === "win" ? "Win" : trade.result === "loss" ? "Loss" : "Breakeven"}
              </Badge>
              <Badge tone={trade.direction === "long" ? "up" : "down"} icon={trade.direction === "long" ? "ph-trend-up" : "ph-trend-down"}>
                {trade.direction}
              </Badge>
              {trade.sessionType === "backtest" && <Badge tone="warn">Backtest</Badge>}
              {activeSetups.map((s) => (
                <span
                  key={s.key}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold"
                  style={{ backgroundColor: `${s.color}20`, color: s.color }}
                  title={s.description}
                >
                  {s.short}
                </span>
              ))}
            </div>

            <Row
              label="R-Multiple"
              value={
                <span className={trade.rMultiple > 0 ? "text-up" : trade.rMultiple < 0 ? "text-down" : ""}>
                  {trade.rMultiple > 0 ? "+" : ""}
                  {trade.rMultiple.toFixed(2)} R
                </span>
              }
            />
            <Row
              label="P&L"
              value={
                <span className={profit > 0 ? "text-up" : profit < 0 ? "text-down" : ""}>
                  {profit > 0 ? "+" : ""}
                  {profit.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                </span>
              }
            />
            <Row label="Risiko" value={`${trade.riskPercent ?? "—"} % · ${(trade.riskAmount ?? 0).toLocaleString("de-DE")}`} />
            {trade.entryPrice != null && <Row label="Entry" value={trade.entryPrice} />}
            {trade.stopLoss != null && <Row label="Stop Loss" value={trade.stopLoss} />}
            {trade.takeProfit != null && <Row label="Take Profit" value={trade.takeProfit} />}
            {trade.lotSize != null && <Row label="Lot Size" value={trade.lotSize} />}
            {trade.accountBalanceAfter != null && (
              <Row
                label="Kontostand danach"
                value={trade.accountBalanceAfter.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
              />
            )}

            {(trade.confluences?.length ?? 0) > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-muted uppercase tracking-wide mb-1.5">Confluences</p>
                <div className="flex flex-wrap gap-1.5">
                  {trade.confluences!.map((c) => (
                    <Badge key={c} tone="accent">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {trade.comment && (
              <div className="mt-3">
                <p className="text-[11px] text-muted uppercase tracking-wide mb-1.5">Kommentar</p>
                <p className="text-[13px] whitespace-pre-wrap">{trade.comment}</p>
              </div>
            )}
            {trade.notes && (
              <div className="mt-3">
                <p className="text-[11px] text-muted uppercase tracking-wide mb-1.5">Kontext-Notiz</p>
                <p className="text-[12px] font-mono whitespace-pre-wrap text-muted">{trade.notes}</p>
              </div>
            )}
          </div>

          <div>
            {screenshot ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={screenshot}
                alt="Trade Screenshot"
                className="w-full rounded-md border border-border2 cursor-zoom-in"
                onClick={() => setFullscreen(true)}
              />
            ) : (
              <div className="h-full min-h-40 flex items-center justify-center rounded-md border border-dashed border-border2 text-muted text-[12px]">
                Kein Screenshot
              </div>
            )}
          </div>
        </div>
      </Modal>

      {fullscreen && screenshot && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-6 cursor-zoom-out anim-fade-in"
          onClick={() => setFullscreen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={screenshot} alt="Screenshot" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </>
  );
}
