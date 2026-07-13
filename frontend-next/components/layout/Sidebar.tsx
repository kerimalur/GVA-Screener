"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_GROUPS } from "./nav";
import SignalsBadge from "./SignalsBadge";
import { createBrowserSupabase } from "@/lib/supabase/client";

const OPEN_GROUPS_KEY = "nav_open_groups";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState<string>("");
  const [userAvatar, setUserAvatar] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Gemerkten Auf/Zu-Zustand laden (nur für collapsible-Gruppen relevant)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPEN_GROUPS_KEY);
      if (raw) setOpenGroups(JSON.parse(raw));
    } catch {
      // defekter Eintrag → Default (zu)
    }
  }, []);

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      try {
        localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
      } catch {
        // localStorage nicht verfügbar → Zustand nur für die Session
      }
      return next;
    });
  };

  useEffect(() => {
    const supabase = createBrowserSupabase();

    // Einmalig beim Mount laden
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserName(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Trader");
        setUserAvatar(user.user_metadata?.avatar_url || "");
        setUserEmail(user.email || "");
        setIsAdmin(user.app_metadata?.role === "admin");
      }
    });

    // Live-Update bei Session-Wechsel (OAuth-Redirect, Logout, Token-Refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      if (user) {
        setUserName(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Trader");
        setUserAvatar(user.user_metadata?.avatar_url || "");
        setUserEmail(user.email || "");
        setIsAdmin(user.app_metadata?.role === "admin");
      } else {
        setUserName("");
        setUserAvatar("");
        setUserEmail("");
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const initial = userName.charAt(0).toUpperCase();

  return (
    <aside className="shrink-0 flex flex-col h-screen sticky top-0 w-[248px] min-w-[248px] bg-sidebar border-r border-border">
      {/* Logo */}
      <div className="pt-[22px] px-3.5">
        <div className="flex items-center gap-[11px] px-2.5 pt-1.5 pb-6">
          <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center bg-linear-135 from-accent to-accent/60">
            <div className="w-2.5 h-2.5 rounded-[3px] rotate-45 bg-bg" />
          </div>
          <div className="flex flex-col leading-[1.15]">
            <div className="text-[14.5px] font-extrabold tracking-tight">FX Terminal</div>
            <div className="text-[9px] font-semibold tracking-[1.2px] text-faint uppercase">
              Swing-Trading Suite
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto flex flex-col px-3.5">
        {NAV_GROUPS.map((group, gi) => {
          const hasActiveItem = group.items.some(
            (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
          );
          // Aktive Route in zugeklappter Gruppe → trotzdem aufklappen
          const isOpen = !group.collapsible || openGroups[group.title] === true || hasActiveItem;
          const groupHead =
            "w-full flex items-center justify-between text-[10px] font-bold tracking-[1.3px] text-faint px-2.5 pb-2 uppercase";

          return (
            <div
              key={group.title}
              data-tour-group={group.title}
              className={gi > 0 ? "border-t border-border pt-4 pb-[18px]" : "pb-[18px]"}
            >
              {group.collapsible ? (
                <button onClick={() => toggleGroup(group.title)} className={`${groupHead} cursor-pointer`}>
                  <span>{group.title}</span>
                  <i
                    className={`ph-bold ph-caret-down text-[11px] transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
              ) : (
                <div className={groupHead}>{group.title}</div>
              )}
              <div className={`${isOpen ? "flex" : "hidden"} flex-col gap-px`}>
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const locked = item.requiresAdmin && !isAdmin;

                  if (locked) {
                    return (
                      <div
                        key={item.href}
                        data-tour={item.href}
                        title="Nur für Admins verfügbar"
                        className="px-2.5 py-2 rounded-lg text-[13.5px] font-medium text-faint cursor-not-allowed flex items-center justify-between opacity-50"
                      >
                        <span>{item.label}</span>
                        <i className="ph-bold ph-lock-simple text-[11px]" />
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-tour={item.href}
                      className={`py-2 rounded-lg text-[13.5px] flex items-center justify-between transition-colors duration-100 ${
                        active
                          ? "pl-3 pr-2.5 -ml-0.5 font-semibold text-text bg-surface2 border-l-2 border-accent"
                          : "px-2.5 font-medium text-muted hover:bg-surface2 hover:text-text"
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.href === "/scanner/signale" && <SignalsBadge />}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-border px-3.5 py-3">
        <div className="flex items-center gap-2.5 mb-2">
          {userAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userAvatar} alt={userName} className="w-[30px] h-[30px] rounded-full shrink-0" />
          ) : (
            <div className="w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center text-[12.5px] font-bold text-text border border-border2 bg-surface2">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-text truncate">{userName}</div>
            <div className="text-[11px] text-faint truncate">{userEmail}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-up inline-block" />
            <span className="text-[10px] text-faint font-semibold">{isAdmin ? "Admin" : "Aktiv"}</span>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className={`w-full flex items-center gap-[7px] px-2.5 py-[7px] rounded-lg text-[12.5px] font-medium text-left text-faint transition-colors duration-100 hover:bg-down-dim hover:text-down ${
            signingOut ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <i className="ph-bold ph-sign-out text-[13px]" />
          {signingOut ? "Abmelden…" : "Abmelden"}
        </button>
      </div>
    </aside>
  );
}
