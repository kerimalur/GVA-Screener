"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { PLANS, type Tier, type Billing } from "@/lib/constants/plans";

// useSearchParams() muss in einer eigenen Komponente sein, die in Suspense gewrappt wird
function UpgradeContent() {
  const router = useRouter();
  const params = useSearchParams();
  const success = params.get("success") === "1";
  const canceled = params.get("canceled") === "1";

  const tierParam = params.get("tier");
  const [tier, setTier] = useState<Tier>(tierParam === "basic" ? "basic" : "pro");
  const billingParam = params.get("billing");
  const [billing, setBilling] = useState<Billing>(billingParam === "yearly" ? "yearly" : "monthly");
  const plan = PLANS[tier];

  const autostart = params.get("autostart") === "1";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activating, setActivating] = useState(false);
  const [withdrawalConsent, setWithdrawalConsent] = useState(false);

  // Wenn von Landing Page/Login weitergeleitet: nur prüfen, ob bereits aktives Abo
  // besteht (→ direkt zum Dashboard) oder ob noch kein Login vorliegt (→ zu /login).
  // KEIN automatischer Checkout mehr — die Widerrufsrecht-Zustimmung unten muss der
  // Nutzer immer selbst aktiv anhaken, das darf nicht automatisiert werden.
  useEffect(() => {
    if (!autostart || success || canceled) return;
    const check = async () => {
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?next=" + encodeURIComponent(`/upgrade?tier=${tier}&billing=${billing}`));
        return;
      }
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      const isActive = sub?.status === "active" || sub?.status === "trialing";
      if (isActive) {
        router.push("/dashboard");
      }
      // sonst: normal auf der Seite bleiben, Nutzer muss Zustimmung + Klick selbst geben
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
    if (!withdrawalConsent) {
      setError("Bitte bestätige zuerst den Hinweis zum Widerrufsrecht unten.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Prüfen ob eingeloggt
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?next=" + encodeURIComponent(`/upgrade?tier=${tier}&billing=${billing}`));
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, billing, widerrufConsent: withdrawalConsent }),
      });
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

        <div className="flex justify-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setTier("basic")}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold border ${tier === "basic" ? "bg-accent text-white border-accent" : "border-border text-muted"}`}
          >
            Basic
          </button>
          <button
            type="button"
            onClick={() => setTier("pro")}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold border ${tier === "pro" ? "bg-accent text-white border-accent" : "border-border text-muted"}`}
          >
            Pro
          </button>
        </div>
        <div className="flex justify-center gap-2 mb-6">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={`px-3 py-1 rounded-md text-xs font-medium ${billing === "monthly" ? "bg-surface2 text-text" : "text-muted"}`}
          >
            Monatlich
          </button>
          <button
            type="button"
            onClick={() => setBilling("yearly")}
            className={`px-3 py-1 rounded-md text-xs font-medium ${billing === "yearly" ? "bg-surface2 text-text" : "text-muted"}`}
          >
            Jährlich (−17%)
          </button>
        </div>

        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="p-6 border-b border-border">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold">
                CHF {billing === "yearly" ? plan.priceYearly : plan.priceMonthly}
              </span>
              <span className="text-muted text-sm">/ {billing === "yearly" ? "Jahr" : "Monat"}</span>
            </div>
            <p className="text-xs text-muted mt-1">{plan.tagline}</p>
            <p className="text-xs text-muted mt-1">
              Jederzeit kündbar · keine Mindestlaufzeit
            </p>
          </div>

          <div className="p-6 border-b border-border">
            <ul className="space-y-2.5">
              {plan.features.map((f) => (
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

            <label className="flex items-start gap-2.5 text-xs text-muted leading-relaxed cursor-pointer select-none">
              <input
                type="checkbox"
                checked={withdrawalConsent}
                onChange={(e) => {
                  setWithdrawalConsent(e.target.checked);
                  if (e.target.checked) setError("");
                }}
                className="mt-0.5 w-3.5 h-3.5 flex-none accent-[var(--accent)]"
              />
              <span>
                Mir ist bewusst, dass der Zugang sofort nach der Zahlung bereitgestellt wird.
                Für EU-Kunden gilt: mit dieser Bestätigung stimme ich der sofortigen Ausführung
                vor Ablauf der 14-tägigen Widerrufsfrist ausdrücklich zu und verliere dadurch
                mein Widerrufsrecht (siehe{" "}
                <Link href="/agb" target="_blank" className="underline hover:text-text">AGB, Abschnitt 6</Link>).
              </span>
            </label>

            {error && (
              <p className="text-xs text-down text-center">{error}</p>
            )}
            <button
              onClick={handleSubscribe}
              disabled={loading || !withdrawalConsent}
              className="w-full py-3 rounded-lg bg-accent text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
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
