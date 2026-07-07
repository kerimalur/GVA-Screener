"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_GROUPS } from "./nav";
import SignalsBadge from "./SignalsBadge";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function Sidebar() {
  const pathname = usePathname();
  const [userName, setUserName] = useState<string>("");
  const [userAvatar, setUserAvatar] = useState<string>("");

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserName(
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Trader"
        );
        setUserAvatar(user.user_metadata?.avatar_url || "");
      }
    });
  }, []);

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col h-screen sticky top-0">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <i className="ph-bold ph-pulse text-accent text-xl" />
          <div>
            <div className="text-sm font-semibold tracking-wide">FX Terminal</div>
            <div className="text-[10px] text-muted uppercase tracking-widest">Swing-Trading Suite</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            <div className="px-5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
              {group.title}
            </div>
            {group.items.map((item) => {
              // Exakter Match — Nav listet konkrete Seiten, Prefix-Matching würde
              // z.B. /journal auch auf /journal/equity hervorheben.
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-5 py-2 text-[13px] transition-colors ${
                    active
                      ? "bg-surface2 text-accent border-r-2 border-accent font-medium"
                      : "text-muted hover:text-text hover:bg-surface2/50"
                  }`}
                >
                  <i className={`ph-bold ${item.icon} text-base`} />
                  {item.label}
                  {item.href === "/scanner/signale" && <SignalsBadge />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-border">
        {/* User-Info */}
        <div className="flex items-center gap-2.5 px-5 py-3 border-b border-border">
          {userAvatar ? (
            <img src={userAvatar} alt={userName} className="w-7 h-7 rounded-full shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
              <span className="text-accent text-[11px] font-bold">
                {userName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-text truncate">{userName}</div>
            <div className="text-[10px] text-faint">Aktiv</div>
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full flex items-center gap-2.5 px-5 py-2.5 text-[13px] text-muted hover:text-text hover:bg-surface2/50 transition-colors"
          >
            <i className="ph-bold ph-sign-out text-base" />
            Abmelden
          </button>
        </form>
        <div className="px-5 pb-3 text-[10px] text-faint font-mono">
          Daten: CFTC · FRED · OANDA · Myfxbook
        </div>
      </div>
    </aside>
  );
}
