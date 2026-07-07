"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase/client";

function LoginContent() {
  const [loading, setLoading] = useState<"google" | "github" | null>(null);
  const [error, setError] = useState("");
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

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

  return (
    <div
      className="min-h-screen flex flex-col bg-[#0b0f14] text-[#c9d3df]"
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      {/* Zurück-Link */}
      <div className="px-6 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[#5f6b7a] hover:text-[#c9d3df] transition-colors"
        >
          ← Zurück zur Startseite
        </Link>
      </div>

      {/* Zentrierter Login-Block */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">

          {/* Logo */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/20 mb-4">
              <span className="text-[#58a6ff] font-bold text-lg">FX</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">FX Terminal</h1>
            <p className="text-sm text-[#5f6b7a] mt-2">
              Melde dich an um Zugang zu erhalten
            </p>
          </div>

          {/* Card */}
          <div className="bg-[#10151c] border border-[#232c38] rounded-2xl p-8">

            {/* Google Button */}
            <button
              onClick={() => handleOAuth("google")}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white text-[#1a1a1a] font-semibold text-sm hover:bg-[#f0f0f0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading === "google" ? (
                <span className=