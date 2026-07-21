"use client";

import { useEffect, useState } from "react";
import Panel from "@/components/layout/Panel";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Field, Input, Select, Label } from "@/components/ui/Field";
import { toast } from "@/components/ui/Toaster";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  getConfluences,
  saveConfluences,
  getProblems,
  saveProblems,
  getNoteSnippets,
  saveNoteSnippets,
  type AccountType,
  type Transaction,
  type TransactionType,
} from "@/lib/journal/types";
import { loadPref, savePref } from "@/lib/journal/prefs";
import {
  DEFAULT_EXPECTANCY_PARAMS,
  expectancyPerMonth,
  loadAplusCriteria,
  loadAdherenceQuestions,
  loadExpectancyParams,
  saveAplusCriteria,
  saveAdherenceQuestions,
  saveExpectancyParams,
  type ExpectancyParams,
} from "@/lib/journal/discipline";
import { TRADE_BUDGET_PER_MONTH } from "@/lib/journal/budget";
import {
  hydrateAppSettings,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from "@/lib/settings/client";
import { CFTC_CONTRACTS } from "@/lib/constants/cftcContracts";
import { G8_CURRENCIES } from "@/lib/constants/instruments";
import { loadTransactions, saveTransaction, removeTransaction } from "@/lib/journal/accounts";
import { loadTrades } from "@/lib/journal/trades";
import { loadAccountConfigs } from "@/lib/journal/accounts";
import { loadOutlooks } from "@/lib/journal/outlooks";
import { loadStrategies } from "@/lib/journal/strategies";
import { loadBacktests } from "@/lib/journal/backtests";

/** Editierbare Tag-Liste (Confluences, Probleme, Notiz-Bausteine) */
function TagListEditor({
  title,
  subtitle,
  items,
  onChange,
}: {
  title: string;
  subtitle?: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [newItem, setNewItem] = useState("");

  const add = () => {
    const val = newItem.trim();
    if (!val || items.includes(val)) return;
    onChange([...items, val]);
    setNewItem("");
  };

  return (
    <Panel title={title} subtitle={subtitle}>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {items.length === 0 && <p className="text-[12px] text-muted">Keine Einträge.</p>}
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bg border border-border2 text-[11px]"
          >
            {item}
            <button
              onClick={() => onChange(items.filter((x) => x !== item))}
              className="text-faint hover:text-down transition-colors"
              aria-label={`${item} entfernen`}
            >
              <i className="ph-bold ph-x text-[10px]" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Neuer Eintrag…"
        />
        <Button variant="subtle" size="sm" icon="ph-plus" onClick={add} />
      </div>
    </Panel>
  );
}

export default function SettingsView() {
  const [email, setEmail] = useState<string>("");
  const [confluences, setConfluences] = useState<string[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [snippets, setSnippets] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txForm, setTxForm] = useState({
    type: "funded" as AccountType,
    transactionType: "deposit" as TransactionType,
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    note: "",
  });
  const [exporting, setExporting] = useState(false);
  const [app, setApp] = useState<AppSettings>(() => loadAppSettings());
  const [aplusCriteria, setAplusCriteria] = useState<string[]>([]);
  const [adherenceQuestions, setAdherenceQuestions] = useState<string[]>([]);
  const [expectancy, setExpectancy] = useState<ExpectancyParams>(DEFAULT_EXPECTANCY_PARAMS);

  const updateApp = (next: AppSettings) => {
    setApp(next);
    saveAppSettings(next).catch(() => {});
  };

  useEffect(() => {
    // Backend-Stand der App-Settings gewinnt (geräteübergreifend)
    hydrateAppSettings().then(setApp).catch(() => {});
  }, []);

  useEffect(() => {
    // Lokale Listen sofort, dann Backend-Hydrierung (Backend gewinnt)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- externe Quellen, einmalig
    setConfluences(getConfluences());
    setProblems(getProblems());
    setSnippets(getNoteSnippets());

    createBrowserSupabase()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? ""));
    loadPref<string[]>("confluences", []).then((v) => {
      if (v.length) {
        setConfluences(v);
        saveConfluences(v);
      }
    });
    loadPref<string[]>("problems", []).then((v) => {
      if (v.length) {
        setProblems(v);
        saveProblems(v);
      }
    });
    loadPref<string[]>("noteSnippets", []).then((v) => {
      if (v.length) {
        setSnippets(v);
        saveNoteSnippets(v);
      }
    });
    loadTransactions().then(setTransactions).catch(() => {});
    // Disziplin-System: Kriterien, Fragen, Expectancy-Parameter (user_preferences)
    loadAplusCriteria().then(setAplusCriteria).catch(() => {});
    loadAdherenceQuestions().then(setAdherenceQuestions).catch(() => {});
    loadExpectancyParams().then(setExpectancy).catch(() => {});
  }, []);

  const updateAplusCriteria = (next: string[]) => {
    setAplusCriteria(next);
    saveAplusCriteria(next).catch(() => {});
  };
  const updateAdherenceQuestions = (next: string[]) => {
    setAdherenceQuestions(next);
    saveAdherenceQuestions(next).catch(() => {});
  };
  const updateExpectancy = (patch: Partial<ExpectancyParams>) => {
    const next = { ...expectancy, ...patch };
    setExpectancy(next);
    saveExpectancyParams(next).catch(() => {});
  };

  const updateConfluences = (next: string[]) => {
    setConfluences(next);
    saveConfluences(next);
    savePref("confluences", next).catch(() => {});
  };
  const updateProblems = (next: string[]) => {
    setProblems(next);
    saveProblems(next);
    savePref("problems", next).catch(() => {});
  };
  const updateSnippets = (next: string[]) => {
    setSnippets(next);
    saveNoteSnippets(next);
    savePref("noteSnippets", next).catch(() => {});
  };

  const addTransaction = async () => {
    if (!txForm.amount || txForm.amount <= 0) {
      toast.error("Betrag fehlt");
      return;
    }
    try {
      await saveTransaction(txForm);
      toast.success("Transaktion gespeichert — Balance im Journal neu berechnen lassen (Trade speichern/löschen) oder manuell anpassen");
      setTransactions(await loadTransactions());
      setTxForm((f) => ({ ...f, amount: 0, note: "" }));
    } catch {
      toast.error("Speichern fehlgeschlagen");
    }
  };

  const deleteTx = async (id: string) => {
    if (!confirm("Transaktion löschen?")) return;
    await removeTransaction(id);
    setTransactions(await loadTransactions());
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      const [trades, accounts, outlooks, strategies, backtests] = await Promise.all([
        loadTrades(),
        loadAccountConfigs(),
        loadOutlooks(),
        loadStrategies(),
        loadBacktests(),
      ]);
      const payload = {
        version: "2.0",
        exportedAt: new Date().toISOString(),
        trades,
        accounts,
        transactions,
        outlooks,
        strategies,
        backtests,
        preferences: { confluences, problems, noteSnippets: snippets },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fx-terminal-journal-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export erstellt");
    } catch {
      toast.error("Export fehlgeschlagen");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 anim-fade-in max-w-4xl">
      <Panel title="Konto">
        <div className="flex items-center gap-3">
          <i className="ph-bold ph-user-circle text-2xl text-muted" />
          <div>
            <p className="text-[13px] font-medium">{email || "—"}</p>
            <p className="text-[11px] text-muted">Google-Login · Abmelden über die Seitenleiste</p>
          </div>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" icon="ph-download-simple" onClick={exportAll} disabled={exporting}>
              {exporting ? "Exportiere…" : "Alle Daten exportieren (JSON)"}
            </Button>
          </div>
        </div>
      </Panel>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Terminal" subtitle="Voreinstellungen für COT, Makro & Dashboard — greifen beim nächsten Seitenaufruf">
          <div className="space-y-3">
            <Field label="Standard-COT-Contract">
              <Select
                value={app.terminal.defaultCot}
                onChange={(e) =>
                  updateApp({ ...app, terminal: { ...app.terminal, defaultCot: e.target.value } })
                }
              >
                {CFTC_CONTRACTS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Makro-Region A">
                <Select
                  value={app.terminal.makroA}
                  onChange={(e) =>
                    updateApp({ ...app, terminal: { ...app.terminal, makroA: e.target.value } })
                  }
                >
                  {G8_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Makro-Region B">
                <Select
                  value={app.terminal.makroB}
                  onChange={(e) =>
                    updateApp({ ...app, terminal: { ...app.terminal, makroB: e.target.value } })
                  }
                >
                  {G8_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Currency-Strength-Zeitfenster (Dashboard)">
              <Select
                value={app.terminal.strengthLookback}
                onChange={(e) =>
                  updateApp({
                    ...app,
                    terminal: {
                      ...app.terminal,
                      strengthLookback: e.target.value as AppSettings["terminal"]["strengthLookback"],
                    },
                  })
                }
              >
                <option value="1W">1 Woche</option>
                <option value="1M">1 Monat</option>
                <option value="3M">3 Monate</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="COT-Extrem ab Perzentil">
                <Input
                  type="number"
                  min={55}
                  max={99}
                  value={app.terminal.cotExtremePct}
                  onChange={(e) =>
                    updateApp({
                      ...app,
                      terminal: { ...app.terminal, cotExtremePct: parseInt(e.target.value) || 90 },
                    })
                  }
                />
              </Field>
              <Field label="Sentiment-Konträr ab %">
                <Input
                  type="number"
                  min={55}
                  max={95}
                  value={app.terminal.sentimentExtremePct}
                  onChange={(e) =>
                    updateApp({
                      ...app,
                      terminal: {
                        ...app.terminal,
                        sentimentExtremePct: parseInt(e.target.value) || 70,
                      },
                    })
                  }
                />
              </Field>
            </div>
            <p className="text-[11px] text-muted">
              Extrem-Schwellen färben COT-Tabelle, Dashboard-Schnellübersicht und
              Konträr-Signale. Short-Seite = 100&nbsp;−&nbsp;Wert.
            </p>
          </div>
        </Panel>

        <Panel title="Markt-Scanner" subtitle="GVA-Screener (Radar, Heatmap)">
          <div className="space-y-3">
            <Field label="Aktualisierungs-Intervall (Sekunden)">
              <Input
                type="number"
                min={5}
                max={600}
                value={app.scanner.pollSec}
                onChange={(e) =>
                  updateApp({
                    ...app,
                    scanner: { ...app.scanner, pollSec: parseInt(e.target.value) || 30 },
                  })
                }
              />
            </Field>
            <p className="text-[11px] text-muted">
              Wie oft Radar/Heatmap das FastAPI-Backend abfragen. Kleinere Werte =
              aktueller, aber mehr Last. Greift beim nächsten Öffnen der Scanner-Seite.
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <TagListEditor
          title="Confluences"
          subtitle="Auswahl im TradeForm + Outlook-Wizard"
          items={confluences}
          onChange={updateConfluences}
        />
        <TagListEditor
          title="Problem-Tags"
          subtitle="Backtest-Raum · Leak-Auswertung"
          items={problems}
          onChange={updateProblems}
        />
      </div>

      <TagListEditor
        title="Notiz-Bausteine"
        subtitle="Ein Klick fügt sie im Backtest-Raum ein"
        items={snippets}
        onChange={updateSnippets}
      />

      {/* Disziplin-System */}
      <div className="grid md:grid-cols-2 gap-4">
        <TagListEditor
          title="A+-Setup-Kriterien"
          subtitle="Pflicht-Checkliste vor jedem neuen Trade — A+ nur wenn ALLE erfüllt"
          items={aplusCriteria}
          onChange={updateAplusCriteria}
        />
        <TagListEditor
          title="Adherence-Fragen"
          subtitle={'„Plan befolgt?"-Abfrage direkt nach dem Loggen'}
          items={adherenceQuestions}
          onChange={updateAdherenceQuestions}
        />
      </div>

      <Panel
        title="Expectancy-Parameter"
        subtitle="Erwartetes Monats-Ergebnis: ((WR·RR·Risiko%) − (1−WR)·Risiko%) · Trades/Monat"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Risiko % pro Trade">
            <Input
              type="number" step="0.1" min={0.1} max={10}
              value={expectancy.riskPct}
              onChange={(e) => updateExpectancy({ riskPct: parseFloat(e.target.value) || 1 })}
            />
          </Field>
          <Field label="RR (1:x)">
            <Input
              type="number" step="0.5" min={0.5} max={20}
              value={expectancy.rr}
              onChange={(e) => updateExpectancy({ rr: parseFloat(e.target.value) || 4 })}
            />
          </Field>
          <Field label="Fallback-Winrate %">
            <Input
              type="number" step="1" min={0} max={100}
              value={expectancy.fallbackWinrate}
              onChange={(e) => updateExpectancy({ fallbackWinrate: parseFloat(e.target.value) || 40 })}
            />
          </Field>
        </div>
        <p className="text-[11px] text-muted mt-3 font-mono">
          Mit Fallback-Winrate {expectancy.fallbackWinrate} %:{" "}
          {(() => {
            const v = expectancyPerMonth(expectancy.fallbackWinrate, expectancy);
            return `${v >= 0 ? "+" : ""}${v.toFixed(1)} % / Monat`;
          })()}
          {" "}· Fallback greift, solange weniger als 20 Trades geloggt sind.
          {" "}· Gerechnet wird mit dem festen Budget von {TRADE_BUDGET_PER_MONTH} Trades/Monat.
        </p>
      </Panel>

      <Panel title="Transaktionen" subtitle="Ein-/Auszahlungen und Payouts — fließen in die Balance-Baseline">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end mb-4">
          <Field label="Konto">
            <Select
              value={txForm.type}
              onChange={(e) => setTxForm((f) => ({ ...f, type: e.target.value as AccountType }))}
            >
              <option value="funded">Funded</option>
              <option value="ek">Eigenkapital</option>
            </Select>
          </Field>
          <Field label="Typ">
            <Select
              value={txForm.transactionType}
              onChange={(e) =>
                setTxForm((f) => ({ ...f, transactionType: e.target.value as TransactionType }))
              }
            >
              <option value="deposit">Einzahlung</option>
              <option value="withdrawal">Auszahlung</option>
              <option value="payout">Payout</option>
            </Select>
          </Field>
          <Field label="Betrag">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={txForm.amount || ""}
              onChange={(e) => setTxForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
            />
          </Field>
          <Field label="Datum">
            <Input
              type="date"
              value={txForm.date}
              onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))}
            />
          </Field>
          <Button size="sm" icon="ph-plus" onClick={addTransaction}>
            Hinzufügen
          </Button>
        </div>

        {transactions.length === 0 ? (
          <p className="text-[12px] text-muted">Keine Transaktionen.</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 text-[12px] font-mono py-1.5 px-2 rounded bg-bg border border-border/60"
              >
                <span className="text-muted">{tx.date}</span>
                <Badge tone={tx.type === "funded" ? "accent" : "neutral"}>
                  {tx.type === "funded" ? "Funded" : "EK"}
                </Badge>
                <span
                  className={
                    tx.transactionType === "deposit" ? "text-up" : "text-down"
                  }
                >
                  {tx.transactionType === "deposit" ? "+" : "−"}
                  {tx.amount.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                </span>
                <span className="text-muted text-[11px]">
                  {tx.transactionType === "deposit"
                    ? "Einzahlung"
                    : tx.transactionType === "withdrawal"
                      ? "Auszahlung"
                      : "Payout"}
                </span>
                {tx.note && <span className="text-faint truncate max-w-48">{tx.note}</span>}
                <button
                  onClick={() => deleteTx(tx.id)}
                  className="ml-auto text-faint hover:text-down transition-colors"
                  aria-label="Löschen"
                >
                  <i className="ph-bold ph-trash" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Hinweis">
        <div className="text-[12px] text-muted space-y-1.5">
          <p>
            <Label>Datenhaltung</Label>
            Alle Journal-Daten liegen im Supabase-Projekt (RLS, nur dein Google-Account). Der
            JSON-Export dient als zusätzliches Backup.
          </p>
        </div>
      </Panel>
    </div>
  );
}
