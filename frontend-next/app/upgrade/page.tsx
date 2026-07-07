"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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

// useSearchParams() muss in einer eigenen Komponente sein, die in Suspense gewrappt wird
function UpgradeContent() {
  const router = useRouter();
  const params = useSearchParams();
  const success = params.get("success") === "1";
  const canceled = params.get("canceled") === "1";

  const autostart = params.get("autostart") === "1";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activating, setActivating] = useState(false);

  // Auto-Checkout wenn von Landing Page weitergeleitet (nach Login)
  // Aber zuerst prüfen ob bereits aktives Abo → dann direkt zum Dashboard
  useEffect(() => {
    if (!autostart || success || canceled) return;
    const check = async () => {
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { handleSubscribe(); return; }
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      const isActive = sub?.status === "active" || sub?.status === "trialing";
      if (isActive) {
        router.push("/dashboard");
      } else {
        handleSubscribe();
      }
    };
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart]);

  // Pollt Supabase bis Subscription aktiv ist, dann weiterleiten
  useEffect(() => {
    if (!success) return;
    setActivating(true);
    let attempts = 0;
    const maxAttempts = 20; // max 10 Sekunden

    const poll = async () => {
      attempts++;
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();

      const isActive = sub?.status === "active" || sub?.status === "trialing";

      if (isActive) {
        router.push("/dashboard");
      } else if (attempts >= maxAttempts) {
        // Timeout — trotzdem weiterleiten, Middleware zeigt ggf. Upgrade-Seite
        router.push("/dashboard");
      }
    };

    const interval = setInterval(poll, 500);
    return () => clearInterval(interval);
  }, [success, router]);

  const handleSubscribe = async () => {
    setLoading(true);
    setError("");
    try {
      // Prüfen ob eingeloggt
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?next=" + encodeURIComponent("/upgrade?autostart=1"));
        return;
      }

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
          <p className="text-sm text-muted mb-6">
            Dein Zugang wird aktiviert…
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted">
            <svg className="animate-spin w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            Weiterleitung zum Terminal…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <Link href="/" className="fixed top-5 left-5 flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors">
        ← Zurück
      </Link>
      <div className="w-full max-w-md">
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

        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="p-6 border-b border-border">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold">CHF 34.95</span>
              <span className="text-muted text-sm">/ Monat</span>
            </div>
            <p className="text-xs text-muted mt-1">
              Monatlich kündbar · keine Mindestlaufzeit
            </p>
          </div>

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

// Suspense-Wrapper: Next.js Pflicht bei useSearchParams()
export default function UpgradePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <UpgradeContent />
    </Suspense>
  );
}
