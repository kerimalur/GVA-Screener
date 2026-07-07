"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Panel from "@/components/layout/Panel";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Segmented from "@/components/ui/Segmented";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Select, Label } from "@/components/ui/Field";
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
  /** Vorbefüllung (zusätzlich wird sessionStorage `tradePrefill` gelesen) */
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
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [filters, setFilters] = useState<TradeFilters>({});

  // Konto-Typ aus letzter Sitzung wiederherstellen (einmalig nach Mount)
  useEffect(() => {
    const saved = localStorage.getItem(ACCOUNT_TYPE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- externe Quelle (localStorage), einmalig
    if (saved === "ek" || saved === "funded") setAccountType(saved);
  }, []);

  // Prefill aus Outlook/Signals-Inbox (sessionStorage, wie im alten Journal)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("tradePrefill");
      if (raw) {
        sessionStorage.removeItem("tradePrefill");
        // eslint-disable-next-line react-hooks/set-state-in-effect -- externe Quelle (sessionStorage), einmalig
        setPrefill(JSON.parse(raw));
        setShowForm(true);
      }
    } catch {
      // ungültiges Prefill ignorieren
    }
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Daten-Fetch beim Mount/Typwechsel
    reload();
  }, [reload]);

  const switchType = (t: AccountType) => {
    setAccountType(t);
    localStorage.setItem(ACCOUNT_TYPE_KEY, t);
  };

  // Balance-Historie chronologisch neu durchrechnen (Verhalten wie altes Journal, #11)
  const recomputeAccount = useCallback(async () => {
    const cfgs = await loadAccountConfigs();
    const cfg = cfgs[accountType];
    if (!cfg) return;
    const all = await tradeService.loadTrades(accountType);
    const txs = (await loadTransactions()).filter((t) => t.type === accountType);
    const netTx = txs.reduce(
      (s, t) => s + (t.transactionType === "deposit" ? t.amount : -t.amount),
      0,
    );
    const baseline = (cfg.initialStartBalance || 0) + netTx;
    const { trades: recomputed, finalBalance } = recomputeBalances(all, baseline);
    for (const t of recomputed) {
      const orig = all.find((o) => o.id === t.id);
      if (!orig) continue;
      if (
        orig.accountBalanceBefore !== t.accountBalanceBefore ||
        orig.accountBalanceAfter !== t.accountBalanceAfter ||
        orig.runningBalance !== t.runningBalance
      ) {
        try {
          await tradeService.saveTrade(t);
        } catch (e) {
          console.error("Balance-Update fehlgeschlagen:", e);
        }
      }
    }
    if (Math.round((cfg.currentBalance || 0) * 100) !== Math.round(finalBalance * 100)) {
      await saveAccountConfig({ ...cfg, currentBalance: finalBalance });
    }
  }, [accountType]);

  const handleSaveTrade = async (
    tradeData: Omit<Trade, "id"> & { id?: string },
    screenshot: string | null,
  ) => {
    try {
      const saved = await tradeService.saveTrade({ ...tradeData, type: accountType });
      if (screenshot && saved.id) await saveScreenshot(saved.id, screenshot);
      else if (!screenshot && tradeData.id) await deleteScreenshot(tradeData.id);
      // Aus Outlook journaliert → Outlook als ausgeführt markieren
      if (prefill?.outlookId && !tradeData.id) {
        try {
          await updateOutlook(prefill.outlookId, {
            status: "executed",
            executedTradeId: saved.id,
            journaledTo: [accountType],
          });
        } catch {
          // Outlook-Verknüpfung ist Komfort, kein Blocker
        }
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
    } catch {
      toast.error("Fehler beim Löschen");
    }
  };

  const filteredTrades = useMemo(
    () =>
      trades.filter((trade) => {
        if (filters.result && filters.result !== "all" && trade.result !== filters.result)
          return false;
        if (filters.pair && filters.pair !== "all" && trade.pair !== filters.pair) return false;
        for (const key of Object.keys(SETUP_DEFINITIONS)) {
          if (filters[key as keyof TradeFilters] && !trade[key as keyof Trade]) return false;
        }
        return true;
      }),
    [trades, filters],
  );

  const goalPct =
    config?.enableGoals && config.profitTarget && config.profitTarget > 0
      ? Math.min((config.currentBalance / config.profitTarget) * 100, 100)
      : null;

  // ============================================================
  // Kein Konto → Setup
  // ============================================================
  const noAccount = !loading && configs && config === null;

  return (
    <div className="space-y-4 anim-fade-in">
      {/* Kopfzeile */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          options={[
            { value: "funded" as const, label: "Funded", icon: "ph-buildings" },
            { value: "ek" as const, label: "Eigenkapital", icon: "ph-wallet" },
          ]}
          value={accountType}
          onChange={switchType}
        />

        {config && (
          <div className="flex items-center gap-4 pl-3 border-l border-border">
            <div className="text-[13px]">
              <span className="text-muted">Balance </span>
              <span className="font-mono font-semibold text-accent">
                {config.currentBalance.toLocaleString("de-DE", { minimumFractionDigits: 2 })}{" "}
                {config.currency}
              </span>
            </div>
            {goalPct != null && (
              <div className="flex flex-col gap-0.5 w-36">
                <div className="flex justify-between text-[10px] text-muted font-mono">
                  <span>Ziel</span>
                  <span>{Math.round(goalPct)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-up transition-all duration-500"
                    style={{ width: `${goalPct}%` }}
                  />
                </div>
              </div>
            )}
            {accountsOfType.length > 1 && (
              <Select
                className="!w-auto text-[12px]"
                value={config.id || ""}
                onChange={async (e) => {
                  await setDefaultAccount(e.target.value, accountType);
                  await reload();
                }}
              >
                {accountsOfType.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.broker || "Account"}
                  </option>
                ))}
              </Select>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <Segmented
            options={[
              { value: "table" as const, label: "", icon: "ph-list" },
              { value: "cards" as const, label: "", icon: "ph-squares-four" },
            ]}
            value={viewMode}
            onChange={setViewMode}
          />
          <Button
            variant="ghost"
            size="sm"
            icon="ph-funnel"
            onClick={() => setShowFilters((v) => !v)}
          >
            Filter
          </Button>
          <Button variant="ghost" size="sm" icon="ph-gear" onClick={() => setShowManage(true)}>
            Konten
          </Button>
          <Button size="sm" icon="ph-plus" onClick={() => setShowForm(true)} disabled={!config}>
            Neuer Trade
          </Button>
        </div>
      </div>

      {/* Filter */}
      {showFilters && (
        <Panel className="anim-slide-up">
          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <Label>Ergebnis</Label>
              <Select
                value={filters.result || "all"}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, result: e.target.value as TradeFilters["result"] }))
                }
              >
                <option value="all">Alle</option>
                <option value="win">Wins</option>
                <option value="loss">Losses</option>
                <option value="breakeven">Breakeven</option>
              </Select>
            </div>
            <div>
              <Label>Währungspaar</Label>
              <Select
                value={filters.pair || "all"}
                onChange={(e) => setFilters((f) => ({ ...f, pair: e.target.value }))}
              >
                <option value="all">Alle Paare</option>
                {PAIR_LIST.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Setups</Label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(SETUP_DEFINITIONS).map(([key, setup]) => {
                  const active = !!filters[key as keyof TradeFilters];
                  return (
                    <button
                      key={key}
                      onClick={() => setFilters((f) => ({ ...f, [key]: !active }))}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors"
                      style={
                        active
                          ? {
                              backgroundColor: `${setup.color}20`,
                              borderColor: setup.color,
                              color: setup.color,
                            }
                          : { borderColor: "var(--color-border2)", color: "var(--color-muted)" }
                      }
                      title={setup.description}
                    >
                      {setup.short}
                    </button>
                  );
                })}
                <Button variant="subtle" size="sm" onClick={() => setFilters({})}>
                  Zurücksetzen
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Inhalt */}
      {loading ? (
        <Panel>
          <SkeletonRows rows={6} />
        </Panel>
      ) : noAccount ? (
        <Panel>
          <EmptyState
            icon="ph-bank"
            title={`Kein ${accountType === "ek" ? "Eigenkapital-Konto" : "Funded Account"} vorhanden`}
            description="Richte zuerst dein Konto ein, um Trades zu journalen."
            action={
              <Button icon="ph-plus-circle" onClick={() => setShowSetup(true)}>
                Konto einrichten
              </Button>
            }
          />
        </Panel>
      ) : filteredTrades.length === 0 ? (
        <Panel>
          <EmptyState
            icon="ph-notebook"
            title="Keine Trades gefunden"
            description={
              trades.length === 0
                ? `Starte mit deinem ersten ${accountType === "ek" ? "EK" : "Funded"}-Trade.`
                : "Keine Trades entsprechen den Filterkriterien."
            }
            action={
              trades.length === 0 ? (
                <Button icon="ph-plus" onClick={() => setShowForm(true)}>
                  Neuer Trade
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setFilters({})}>
                  Filter zurücksetzen
                </Button>
              )
            }
          />
        </Panel>
      ) : viewMode === "table" ? (
        <Panel
          title={`${filteredTrades.length} ${filteredTrades.length === 1 ? "Trade" : "Trades"}`}
          className="overflow-hidden"
        >
          <div className="overflow-x-auto -m-4">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-faint border-b border-border">
                  <th className="px-4 py-2 font-semibold">Datum</th>
                  <th className="px-4 py-2 font-semibold">Paar</th>
                  <th className="px-4 py-2 font-semibold">Richtung</th>
                  <th className="px-4 py-2 font-semibold">Ergebnis</th>
                  <th className="px-4 py-2 font-semibold text-right">R</th>
                  <th className="px-4 py-2 font-semibold text-right">P&L</th>
                  <th className="px-4 py-2 font-semibold text-right">Balance</th>
                  <th className="px-4 py-2 font-semibold">Setups</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-border/60 hover:bg-surface2/50 cursor-pointer transition-colors"
                    onClick={() => setViewingTrade(t)}
                  >
                    <td className="px-4 py-2.5 font-mono text-muted">{t.date}</td>
                    <td className="px-4 py-2.5 font-semibold">{t.pair}</td>
                    <td className="px-4 py-2.5">
                      <span className={t.direction === "long" ? "text-up" : "text-down"}>
                        {t.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        tone={t.result === "win" ? "up" : t.result === "loss" ? "down" : "neutral"}
                      >
                        {t.result === "win" ? "Win" : t.result === "loss" ? "Loss" : "BE"}
                      </Badge>
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono font-semibold ${
                        t.rMultiple > 0 ? "text-up" : t.rMultiple < 0 ? "text-down" : "text-muted"
                      }`}
                    >
                      {t.rMultiple > 0 ? "+" : ""}
                      {t.rMultiple.toFixed(2)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono ${
                        (t.profitAmount ?? 0) > 0
                          ? "text-up"
                          : (t.profitAmount ?? 0) < 0
                            ? "text-down"
                            : "text-muted"
                      }`}
                    >
                      {(t.profitAmount ?? 0) > 0 ? "+" : ""}
                      {(t.profitAmount ?? 0).toLocaleString("de-DE", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted">
                      {t.runningBalance != null
                        ? t.runningBalance.toLocaleString("de-DE", { maximumFractionDigits: 0 })
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        {Object.values(SETUP_DEFINITIONS)
                          .filter((s) => t[s.key as keyof Trade])
                          .map((s) => (
                            <span
                              key={s.key}
                              className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                              style={{ backgroundColor: `${s.color}20`, color: s.color }}
                              title={s.label}
                            >
                              {s.short}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTrade(t);
                          setShowForm(true);
                        }}
                        className="p-1 rounded text-faint hover:text-accent transition-colors"
                        title="Bearbeiten"
                      >
                        <i className="ph-bold ph-pencil-simple" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTrades.map((t) => (
            <button
              key={t.id}
              onClick={() => setViewingTrade(t)}
              className="text-left bg-surface border border-border rounded-md p-4 hover:border-border2 transition-colors anim-slide-up"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-[14px]">{t.pair}</span>
                <Badge tone={t.result === "win" ? "up" : t.result === "loss" ? "down" : "neutral"}>
                  {t.result === "win" ? "Win" : t.result === "loss" ? "Loss" : "BE"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-[12px] font-mono">
                <span className="text-muted">{t.date}</span>
                <span className={t.direction === "long" ? "text-up" : "text-down"}>
                  {t.direction.toUpperCase()}
                </span>
                <span
                  className={`font-semibold ${
                    t.rMultiple > 0 ? "text-up" : t.rMultiple < 0 ? "text-down" : "text-muted"
                  }`}
                >
                  {t.rMultiple > 0 ? "+" : ""}
                  {t.rMultiple.toFixed(2)} R
                </span>
              </div>
              {(t.confluences?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {t.confluences!.slice(0, 4).map((c) => (
                    <span key={c} className="px-1.5 py-0.5 rounded bg-surface2 text-[10px] text-muted">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Modals */}
      {showForm && config && (
        <TradeFormModal
          trade={editingTrade}
          accountType={accountType}
          accountConfig={config}
          prefill={editingTrade ? null : prefill}
          onSave={handleSaveTrade}
          onClose={() => {
            setShowForm(false);
            setEditingTrade(undefined);
          }}
        />
      )}
      {viewingTrade && (
        <TradeDetailModal
          trade={viewingTrade}
          onClose={() => setViewingTrade(null)}
          onEdit={(t) => {
            setViewingTrade(null);
            setEditingTrade(t);
            setShowForm(true);
          }}
          onDelete={handleDeleteTrade}
        />
      )}
      {showSetup && (
        <AccountSetupModal
          accountType={accountType}
          onCreated={reload}
          onClose={() => setShowSetup(false)}
        />
      )}
      {showManage && (
        <AccountManageModal
          accounts={accountsOfType}
          accountType={accountType}
          onChanged={reload}
          onAddAccount={() => setShowSetup(true)}
          onClose={() => setShowManage(false)}
        />
      )}
    </div>
  );
}
