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
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

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
        setIsAdmin(user.app_metadata?.role === "admin");
      }
    });
  }, []);

  return (
    <aside className="w-48 shrink-0 border-r border-border bg-surface flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-2">
          <i className="ph-bold ph-pulse text-accent text-base" />
          <div>
            <div className="text-[13px] font-semibold tracking-wide">FX Terminal</div>
            <div className="text-[9px] text-faint uppercase tracking-widest">Swing-Trading Suite</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-3">
            <div className="px-5 pt-3 pb-1 text-[9px] font-semibold uppercase tracking-widest text-faint">
              {group.title}
            </div>
            {group.items.map((item) => {
              const active = pathname === item.href;
              const locked = item.requiresAdmin && !isAdmin;

              if (locked) {
                return (
                  <div
                    key={item.href}
                    className="flex items-center justify-between px-5 py-1.5 text-[12px] text-faint cursor-not-allowed select-none opacity-40"
                    title="Nur fuer Admins verfuegbar"
                  >
                    <span>{item.label}</span>
                    <i className="ph-bold ph-lock-simple text-[10px]" />
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-5 py-1.5 text-[12px] transition-colors ${
                    active
                      ? "text-text font-medium"
                      : "text-muted hover:text-text"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.href === "/scanner/signale" && <SignalsBadge />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-border px-5 py-3">
        <div className="flex items-center gap-2.5 mb-2">
          {userAvatar ? (
            <img src={userAvatar} alt={userName} className="w-6 h-6 rounded-full shrink-0" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
              <span className="text-accent text-[10px] font-bold">
                {userName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-text truncate">{userName}</div>
            <div className="flex items-center gap-1 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-up inline-block" />
              <span className="text-faint">{isAdmin ? "Admin" : "Aktiv"}</span>
            </div>
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-[11px] text-faint hover:text-muted transition-colors"
          >
            Abmelden
          </button>
        </form>
      </div>
    </aside>
  );
}
