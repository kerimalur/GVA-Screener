"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Segmented from "@/components/ui/Segmented";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/Field";
import { toast } from "@/components/ui/Toaster";
import TradeFormModal, { type TradePrefill } from "./TradeFormModal";
import TradeDetailModal from "./TradeDetailModal";
import { AccountSetupModal, AccountManageModal } from "./AccountModals";
import type { AccountConfigs, AccountType, Trade, TradeFilters } from "@/lib/journal/types";
import { PAIR_LIST, SETUP_DEFINITIONS } from "@/lib/journal/types";
import * as tradeService from "@/lib/journal/trades";
import { saveScreenshot, deleteScreenshot } from "@/lib/journal/screenshots";
import {
  loadAccountConfigs,
  saveAccountConfig,
  loadTransactions,
  setDefaultAccount,
} from "@/lib/journal/accounts";
import { recomputeBalances } from "@/lib/journal/calculations";
import { updateOutlook } from "@/lib/journal/outlooks";

const ACCOUNT_TYPE_KEY = "journal_account_type";

interface JournalViewProps {
  prefill?: TradePrefill | null;
}

export default function JournalView({ prefill: prefillProp }: JournalViewProps) {
  const [accountType, setAccountType] = useState<AccountType>("funded");
  const [configs, setConfigs] = useState<AccountConfigs | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefill, setPrefill] = useState<(TradePrefill & { outlookId?: string; signalId?: string }) | null>(
    prefillProp ?? null,
  );

  const [showForm, setShowForm] = useState(!!prefillProp);
  const [editingTrade, setEditingTrade] = useState<Trade | undefined>();
  const [viewingTrade, setViewingTrade] = useState<Trade | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [filters, setFilters] = useState<TradeFilters>({});
  const [filterResult, setFilterResult] = useState<string>("all");
  const [filterPair, setFilterPair] = useState<string>("all");

  useEffect(() => {
    const saved = localStorage.getItem(ACCOUNT_TYPE_KEY);
    if (saved === "ek" || saved === "funded") setAccountType(saved);
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("tradePrefill");
      if (raw) {
        sessionStorage.removeItem("tradePrefill");
        setPrefill(JSON.parse(raw));
        setShowForm(true);
      }
    } catch { /* ignore */ }
  }, []);

  const config = configs?.[accountType] ?? null;
  const accountsOfType =
    (accountType === "ek" ? configs?.ekAccounts : configs?.fundedAccounts) ?? [];

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgs, data] = await Promise.all([
        loadAccountConfigs(),
        tradeService.loadTrades(accountType),
      ]);
      setConfigs(cfgs);
      setTrades(data);
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Laden der Trades");
    } finally {
      setLoading(false);
    }
  }, [accountType]);

  useEffect(() => { reload(); }, [reload]);

  const switchType = (t: AccountType) => {
    setAccountType(t);
    localStorage.setItem(ACCOUNT_TYPE_KEY, t);
  };

  const recomputeAccount = useCallback(async () => {
    const cfgs = await loadAccountConfigs();
    const cfg = cfgs[accountType];
    if (!cfg) return;
    const all = await tradeService.loadTrades(accountType);
    const txs = (await loadTransactions()).filter((t) => t.type === accountType);
    const netTx = txs.reduce(
      (s, t) => s + (t.transactionType === "deposit" ? t.amount : -t.amount), 0,
    );
    const baseline = (cfg.initialStartBalance || 0) + netTx;
    const { trades: recomputed, finalBalance } = recomputeBalances(all, baseline);
    for (const t of recomputed) {
      const orig = all.find((o) => o.id === t.id);
      if (!orig) continue;
      if (orig.accountBalanceBefore !== t.accountBalanceBefore || orig.accountBalanceAfter !== t.accountBalanceAfter || orig.runningBalance !== t.runningBalance) {
        try { await tradeService.saveTrade(t); } catch (e) { console.error("Balance-Update:", e); }
      }
    }
    if (Math.round((cfg.currentBalance || 0) * 100) !== Math.round(finalBalance * 100)) {
      await saveAccountConfig({ ...cfg, currentBalance: finalBalance });
    }
  }, [accountType]);

  const handleSaveTrade = async (tradeData: Omit<Trade, "id"> & { id?: string }, screenshot: string | null) => {
    try {
      const saved = await tradeService.saveTrade({ ...tradeData, type: accountType });
      if (screenshot && saved.id) await saveScreenshot(saved.id, screenshot);
      else if (!screenshot && tradeData.id) await deleteScreenshot(tradeData.id);
      if (prefill?.outlookId && !tradeData.id) {
        try { await updateOutlook(prefill.outlookId, { status: "executed", executedTradeId: saved.id, journaledTo: [accountType] }); } catch { /* ignore */ }
        setPrefill(null);
      }
      await recomputeAccount();
      toast.success(tradeData.id ? "Trade aktualisiert" : "Trade gespeichert");
      setShowForm(false);
      setEditingTrade(undefined);
      await reload();
    } catch (err) {
      console.error(err);
      toast.error("Speichern fehlgeschlagen");
      throw err;
    }
  };

  const handleDeleteTrade = async (trade: Trade) => {
    if (!confirm(`Trade vom ${trade.date} wirklich löschen?`)) return;
    try {
      await tradeService.deleteTrade(trade.id);
      await recomputeAccount();
      toast.success("Trade gelöscht");
      setViewingTrade(null);
      await reload();
    } catch { toast.error("Fehler beim Löschen"); }
  };

  const filteredTrades = useMemo(
    () => trades.filter((trade) => {
      if (filterResult !== "all" && trade.result !== filterResult) return false;
      if (filterPair !== "all" && trade.pair !== filterPair) return false;
      for (const key of Object.keys(SETUP_DEFINITIONS)) {
        if (filters[key as keyof TradeFilters] && !trade[key as keyof Trade]) return false;
      }
      return true;
    }),
    [trades, filters, filterResult, filterPair],
  );

  const stats = useMemo(() => {
    const wins = filteredTrades.filter(t => t.result === "win").length;
    const losses = filteredTrades.filter(t => t.result === "loss").length;
    const totalR = filteredTrades.reduce((s, t) => s + t.rMultiple, 0);
    const totalEur = filteredTrades.reduce((s, t) => s + (t.profitAmount ?? 0), 0);
    const winRate = filteredTrades.length > 0 ? (wins / filteredTrades.length) * 100 : 0;
    return { total: filteredTrades.length, wins, losses, totalR, totalEur, winRate };
  }, [filteredTrades]);

  const goalPct = config?.enableGoals && config.profitTarget && config.profitTarget > 0
    ? Math.min((config.currentBalance / config.profitTarget) * 100, 100) : null;

  const noAccount = !loading && configs && config === null;

  const kpiCards = [
    { label: "Trades", value: stats.total.toString(), mono: false, color: "var(--color-text)" },
    { label: "Win Rate", value: `${stats.winRate.toFixed(0)}%`, mono: true, color: stats.winRate >= 50 ? "var(--color-up)" : "var(--color-down)" },
    { label: "Total R", value: `${stats.totalR >= 0 ? "+" : ""}${stats.totalR.toFixed(1)}`, mono: true, color: stats.totalR >= 0 ? "var(--color-up)" : "var(--color-down)" },
    { label: "P&L", value: `${stats.totalEur >= 0 ? "+" : ""}${stats.totalEur.toLocaleString("de-DE", { maximumFractionDigits: 0 })}`, mono: true, color: stats.totalEur >= 0 ? "var(--color-up)" : "var(--color-down)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }} className="anim-fade-in">

      {/* Top controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <Segmented
            options={[
              { value: "funded" as const, label: "Funded" },
              { value: "ek" as const, label: "Eigenkapital" },
            ]}
            value={accountType}
            onChange={switchType}
          />
          {accountsOfType.length > 1 && config && (
            <Select
              style={{ width: "auto", fontSize: "12px" }}
              value={config.id || ""}
              onChange={async (e) => { await setDefaultAccount(e.target.value, accountType); await reload(); }}
            >
              {accountsOfType.map((a) => (
                <option key={a.id} value={a.id}>{a.name || a.broker || "Account"}</option>
              ))}
            </Select>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Segmented
            options={[
              { value: "table" as const, label: "", icon: "ph-list" },
              { value: "cards" as const, label: "", icon: "ph-squares-four" },
            ]}
            value={viewMode}
            onChange={setViewMode}
          />
          <Button variant="ghost" size="sm" icon="ph-gear" onClick={() => setShowManage(true)}>Konten</Button>
          <Button size="sm" icon="ph-plus" onClick={() => setShowForm(true)} disabled={!config}>Neuer Trade</Button>
        </div>
      </div>

      {/* Balance + Goal */}
      {config && (
        <div style={{ display: "flex", alignItems: "center", gap: "20px", padding: "16px 20px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "14px" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-faint)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "3px" }}>Balance</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "22px", fontWeight: 700, color: "var(--color-accent)", letterSpacing: "-0.5px" }}>
              {config.currentBalance.toLocaleString("de-DE", { minimumFractionDigits: 2 })} {config.currency}
            </div>
          </div>
          {goalPct != null && (
            <div style={{ flex: 1, maxWidth: "240px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 600, color: "var(--color-muted)", marginBottom: "6px" }}>
                <span>Kontoziel</span>
                <span style={{ fontFamily: "monospace" }}>{Math.round(goalPct)}%</span>
              </div>
              <div style={{ height: "6px", borderRadius: "3px", background: "var(--color-surface2)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: "3px", background: "var(--color-up)", width: `${goalPct}%`, transition: "width 500ms" }} />
              </div>
              <div style={{ fontSize: "10px", color: "var(--color-faint)", marginTop: "4px", fontFamily: "monospace" }}>
                {config.currentBalance.toLocaleString("de-DE", { maximumFractionDigits: 0 })} / {config.profitTarget?.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
        {kpiCards.map((kpi) => (
          <div key={kpi.label} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "16px", padding: "16px 20px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-faint)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "6px" }}>{kpi.label}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: kpi.color, fontFamily: kpi.mono ? "'JetBrains Mono',monospace" : "inherit", letterSpacing: "-0.3px" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Main: Filter panel + Table */}
      <div style={{ display: "grid", gridTemplateColumns: "212px 1fr", gap: "18px", alignItems: "start" }}>

        {/* Filter Panel */}
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "16px", padding: "18px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1px", color: "var(--color-faint)", textTransform: "uppercase", marginBottom: "14px" }}>Filter</div>

          {/* Ergebnis */}
          <div style={{ marginBottom: "18px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-muted)", marginBottom: "6px" }}>Ergebnis</div>
            {(["all","win","loss","breakeven"] as const).map((r) => {
              const labels = { all: "Alle", win: "Win", loss: "Loss", breakeven: "Breakeven" };
              const isActive = filterResult === r;
              return (
                <button key={r} onClick={() => setFilterResult(r)} style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 8px", borderRadius: "7px", fontSize: "12.5px", fontWeight: isActive ? 600 : 500, color: isActive ? "var(--color-text)" : "var(--color-muted)", background: isActive ? "var(--color-surface2)" : "transparent", border: "none", cursor: "pointer", marginBottom: "2px" }}>
                  {labels[r]}
                </button>
              );
            })}
          </div>

          {/* Paar */}
          <div style={{ marginBottom: "18px", borderTop: "1px solid var(--color-border)", paddingTop: "14px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-muted)", marginBottom: "6px" }}>Paar</div>
            <Select value={filterPair} onChange={(e) => setFilterPair(e.target.value)} style={{ width: "100%", fontSize: "12px" }}>
              <option value="all">Alle Paare</option>
              {PAIR_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>

          {/* Setup-Tags */}
          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "14px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-muted)", marginBottom: "8px" }}>Setup</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
              {Object.entries(SETUP_DEFINITIONS).map(([key, setup]) => {
                const active = !!filters[key as keyof TradeFilters];
                return (
                  <button key={key} onClick={() => setFilters((f) => ({ ...f, [key]: !active }))} title={setup.description}
                    style={{ padding: "4px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: 700, border: `1px solid ${active ? setup.color : "var(--color-border2)"}`, background: active ? `${setup.color}20` : "transparent", color: active ? setup.color : "var(--color-faint)", cursor: "pointer" }}>
                    {setup.short}
                  </button>
                );
              })}
            </div>
            {(filterResult !== "all" || filterPair !== "all" || Object.values(filters).some(Boolean)) && (
              <button onClick={() => { setFilters({}); setFilterResult("all"); setFilterPair("all"); }} style={{ marginTop: "10px", fontSize: "11px", color: "var(--color-accent)", background: "transparent", border: "none", cursor: "pointer", fontWeight: 600 }}>
                Filter zurücksetzen
              </button>
            )}
          </div>
        </div>

        {/* Trade Table */}
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "16px", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: "20px" }}><SkeletonRows rows={6} /></div>
          ) : noAccount ? (
            <div style={{ padding: "40px 20px" }}>
              <EmptyState icon="ph-bank" title={`Kein ${accountType === "ek" ? "Eigenkapital-Konto" : "Funded Account"}`} description="Richte zuerst dein Konto ein." action={<Button icon="ph-plus-circle" onClick={() => setShowSetup(true)}>Konto einrichten</Button>} />
            </div>
          ) : filteredTrades.length === 0 ? (
            <div style={{ padding: "40px 20px" }}>
              <EmptyState icon="ph-notebook" title="Keine Trades gefunden" description={trades.length === 0 ? `Starte mit deinem ersten ${accountType === "ek" ? "EK" : "Funded"}-Trade.` : "Keine Trades entsprechen den Filterkriterien."} action={trades.length === 0 ? <Button icon="ph-plus" onClick={() => setShowForm(true)}>Neuer Trade</Button> : <Button variant="ghost" onClick={() => { setFilters({}); setFilterResult("all"); setFilterPair("all"); }}>Filter zurücksetzen</Button>} />
            </div>
          ) : viewMode === "table" ? (
            <>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "13px", fontWeight: 700 }}>{filteredTrades.length} {filteredTrades.length === 1 ? "Trade" : "Trades"}</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--color-faint)", borderBottom: "1px solid var(--color-border)" }}>
                      {["Datum","Paar","Richtung","Ergebnis","R","P&L","Balance","Setups",""].map((h, i) => (
                        <th key={i} style={{ padding: "10px 16px", fontWeight: 600, textAlign: i >= 4 && i <= 6 ? "right" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTrades.map((t) => (
                      <tr key={t.id} onClick={() => setViewingTrade(t)} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", transition: "background 80ms" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--color-surface2)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                        <td style={{ padding: "10px 16px", fontFamily: "'JetBrains Mono',monospace", color: "var(--color-muted)" }}>{t.date}</td>
                        <td style={{ padding: "10px 16px", fontWeight: 600 }}>{t.pair}</td>
                        <td style={{ padding: "10px 16px", color: t.direction === "long" ? "var(--color-up)" : "var(--color-down)", fontWeight: 600, fontSize: "11px" }}>{t.direction.toUpperCase()}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <Badge tone={t.result === "win" ? "up" : t.result === "loss" ? "down" : "neutral"}>
                            {t.result === "win" ? "Win" : t.result === "loss" ? "Loss" : "BE"}
                          </Badge>
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: t.rMultiple > 0 ? "var(--color-up)" : t.rMultiple < 0 ? "var(--color-down)" : "var(--color-muted)" }}>
                          {t.rMultiple > 0 ? "+" : ""}{t.rMultiple.toFixed(2)}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "'JetBrains Mono',monospace", color: (t.profitAmount ?? 0) > 0 ? "var(--color-up)" : (t.profitAmount ?? 0) < 0 ? "var(--color-down)" : "var(--color-muted)" }}>
                          {(t.profitAmount ?? 0) > 0 ? "+" : ""}{(t.profitAmount ?? 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "'JetBrains Mono',monospace", color: "var(--color-muted)" }}>
                          {t.runningBalance != null ? t.runningBalance.toLocaleString("de-DE", { maximumFractionDigits: 0 }) : "—"}
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                            {Object.values(SETUP_DEFINITIONS).filter((s) => t[s.key as keyof Trade]).map((s) => (
                              <span key={s.key} style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "9px", fontWeight: 700, background: `${s.color}20`, color: s.color }} title={s.label}>{s.short}</span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right" }}>
                          <button onClick={(e) => { e.stopPropagation(); setEditingTrade(t); setShowForm(true); }} style={{ padding: "4px 6px", borderRadius: "6px", color: "var(--color-faint)", background: "transparent", border: "none", cursor: "pointer", fontSize: "13px" }} title="Bearbeiten">
                            <i className="ph-bold ph-pencil-simple" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
              {filteredTrades.map((t) => (
                <button key={t.id} onClick={() => setViewingTrade(t)} style={{ textAlign: "left", background: "var(--color-surface2)", border: "1px solid var(--color-border)", borderRadius: "14px", padding: "16px", cursor: "pointer", transition: "border-color 100ms" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border2)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)"}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontWeight: 700, fontSize: "14px" }}>{t.pair}</span>
                    <Badge tone={t.result === "win" ? "up" : t.result === "loss" ? "down" : "neutral"}>
                      {t.result === "win" ? "Win" : t.result === "loss" ? "Loss" : "BE"}
                    </Badge>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontFamily: "'JetBrains Mono',monospace" }}>
                    <span style={{ color: "var(--color-muted)" }}>{t.date}</span>
                    <span style={{ color: t.direction === "long" ? "var(--color-up)" : "var(--color-down)" }}>{t.direction.toUpperCase()}</span>
                    <span style={{ fontWeight: 700, color: t.rMultiple > 0 ? "var(--color-up)" : t.rMultiple < 0 ? "var(--color-down)" : "var(--color-muted)" }}>
                      {t.rMultiple > 0 ? "+" : ""}{t.rMultiple.toFixed(2)} R
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showForm && config && (
        <TradeFormModal trade={editingTrade} accountType={accountType} accountConfig={config} prefill={editingTrade ? null : prefill} onSave={handleSaveTrade} onClose={() => { setShowForm(false); setEditingTrade(undefined); }} />
      )}
      {viewingTrade && (
        <TradeDetailModal trade={viewingTrade} onClose={() => setViewingTrade(null)} onEdit={(t) => { setViewingTrade(null); setEditingTrade(t); setShowForm(true); }} onDelete={handleDeleteTrade} />
      )}
      {showSetup && (
        <AccountSetupModal accountType={accountType} onCreated={reload} onClose={() => setShowSetup(false)} />
      )}
      {showManage && (
        <AccountManageModal accounts={accountsOfType} accountType={accountType} onChanged={reload} onAddAccount={() => setShowSetup(true)} onClose={() => setShowManage(false)} />
      )}
    </div>
  );
}
