"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

const FEATURES = [
  "28 FX-Paare — COT, Währungsstärke, Screener",
  "Makro-Fundamentals (FRED, CFTC, OANDA)",
  "Zentralbank-Stance & Zinsdifferenzen",
  "Retail-Sentiment (Myfxbook)",
  "Saisonalität & Intermarket-Korrelationen",
  "COT-Backtest & Conditional-Outcome",
  "Trading Journal mit Equity-Kurve",
  "Weekly Outlook & Kalender-Events",
  "Täglich automatisch aktualisiert",
];

export default function UpgradePage() {
  const router = useRouter();
  const params = useSearchParams();
  const success = params.get("success") === "1";
  const canceled = params.get("canceled") === "1";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(4);

  // Nach erfolgreichem Checkout: kurz warten, dann Dashboard
  useEffect(() => {
    if (!success) return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          router.push("/");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [success, router]);

  const handleSubscribe = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unbekannter Fehler");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-full max-w-sm mx-4 p-8 bg-surface border border-border rounded-xl text-center">
          <div className="text-3xl mb-3">✅</div>
          <h1 className="text-lg font-semibold mb-2">Zahlung erfolgreich</h1>
          <p className="text-sm text-muted mb-4">
            Dein Zugang wird aktiviert. Du wirst in {countdown} Sekunden weitergeleitet…
          </p>
          <div className="w-full bg-surface2 rounded-full h-1">
            <div
              className="bg-accent h-1 rounded-full transition-all duration-1000"
              style={{ width: `${((4 - countdown) / 4) * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-[10px] text-accent uppercase tracking-widest font-semibold mb-2">
            FX Terminal
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">
            Zugang freischalten
          </h1>
          <p className="text-sm text-muted">
            Vollständiger Zugang zum fundamentalen FX-Analyse-Terminal.
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {/* Price */}
          <div className="p-6 border-b border-border">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold">€29</span>
              <span className="text-muted text-sm">/ Monat</span>
            </div>
            <p className="text-xs text-muted mt-1">
              Monatlich kündbar · keine Mindestlaufzeit
            </p>
          </div>

          {/* Features */}
          <div className="p-6 border-b border-border">
            <ul className="space-y-2.5">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <span className="text-up mt-0.5 flex-none">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <div className="p-6 space-y-3">
            {canceled && (
              <p className="text-xs text-down text-center">
                Zahlung abgebrochen — du kannst es jederzeit erneut versuchen.
              </p>
            )}
            {error && (
              <p className="text-xs text-down text-center">{error}</p>
            )}

            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full py-3 rounded-lg bg-accent text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Weiterleitung zu Stripe…" : "Jetzt abonnieren"}
            </button>

            <p className="text-[11px] text-faint text-center">
              Sichere Zahlung via Stripe · SSL-verschlüsselt
            </p>
          </div>
        </div>

        {/* Sign out */}
        <div className="mt-6 text-center">
          <button
            onClick={handleSignOut}
            className="text-xs text-muted hover:text-text transition-colors"
          >
            Mit anderem Konto anmelden
          </button>
        </div>
      </div>
    </div>
  );
}
