"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

function LoginContent() {
  const [loading, setLoading] = useState<"google" | "github" | "password" | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleOAuth = async (provider: "google" | "github") => {
    setLoading(provider);
    setError("");
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(null);
    }
  };

  const handlePasswordAuth = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading("password");
    const supabase = createBrowserSupabase();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        setError(error.message);
        setLoading(null);
        return;
      }
      // Wenn "Confirm email" in Supabase aktiv ist, gibt es hier noch keine Session.
      if (!data.session) {
        setInfo("Fast geschafft — wir haben dir eine Bestätigungs-E-Mail geschickt. Bitte den Link darin öffnen, um dich einzuloggen.");
        setLoading(null);
        return;
      }
      window.location.href = next;
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(null);
      return;
    }
    window.location.href = next;
  };

  return (
    <div
      className="min-h-screen flex flex-col bg-bg text-text"
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      {/* Zentrierter Login-Block */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">

          {/* Logo */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent-dim border border-accent/30 mb-4">
              <span className="text-accent font-bold text-lg">FX</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">FX Terminal</h1>
            <p className="text-sm text-muted mt-2">
              Melde dich an um Zugang zu erhalten
            </p>
          </div>

          {/* Card */}
          <div className="bg-surface border border-border rounded-2xl p-8">

            {/* Google Button */}
            <button
              onClick={() => handleOAuth("google")}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white text-black font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading === "google" ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  Weiterleitung…
                </span>
              ) : (
                <>
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Mit Google anmelden
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-faint uppercase tracking-wider">oder</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* GitHub Button */}
            <button
              onClick={() => handleOAuth("github")}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-surface2 border border-border2 text-white font-semibold text-sm hover:bg-surface2/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === "github" ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  Weiterleitung…
                </span>
              ) : (
                <>
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                  </svg>
                  Mit GitHub anmelden
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-faint uppercase tracking-wider">oder mit E-Mail</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* E-Mail/Passwort-Formular */}
            <form onSubmit={handlePasswordAuth} className="space-y-3">
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="E-Mail-Adresse"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full py-2.5 px-3.5 rounded-xl bg-bg border border-border2 text-sm text-white placeholder:text-muted outline-none focus:border-accent transition-colors"
              />
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="Passwort"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full py-2.5 px-3.5 rounded-xl bg-bg border border-border2 text-sm text-white placeholder:text-muted outline-none focus:border-accent transition-colors"
              />
              <button
                type="submit"
                disabled={loading !== null}
                className="w-full py-3 px-4 rounded-xl bg-accent text-active font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading === "password"
                  ? "Einen Moment…"
                  : mode === "signup"
                  ? "Konto erstellen"
                  : "Anmelden"}
              </button>
            </form>

            <p className="text-xs text-muted text-center mt-4">
              {mode === "signup" ? "Schon ein Konto?" : "Noch kein Konto?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signup" ? "signin" : "signup");
                  setError("");
                  setInfo("");
                }}
                className="text-accent hover:underline font-medium"
              >
                {mode === "signup" ? "Anmelden" : "Registrieren"}
              </button>
            </p>

            {info && (
              <p className="mt-4 text-xs text-up text-center">{info}</p>
            )}
            {error && (
              <p className="mt-4 text-xs text-down text-center">{error}</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <LoginContent />
    </Suspense>
  );
}
