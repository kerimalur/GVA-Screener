"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_GROUPS } from "./nav";
import SignalsBadge from "./SignalsBadge";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState<string>("");
  const [userAvatar, setUserAvatar] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState(false);

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
    <aside
      className="shrink-0 flex flex-col h-screen sticky top-0"
      style={{
        width: "248px",
        minWidth: "248px",
        background: "var(--color-sidebar)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      {/* Logo */}
      <div style={{ padding: "22px 14px 0 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "11px", padding: "6px 10px 24px 10px" }}>
          <div style={{
            width: "28px", height: "28px", borderRadius: "8px",
            background: "linear-gradient(135deg, #6c8cff, #a6b8ff)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <div style={{ width: "10px", height: "10px", background: "#0a0b0e", borderRadius: "3px", transform: "rotate(45deg)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.15" }}>
            <div style={{ fontSize: "14.5px", fontWeight: 800, letterSpacing: "-0.2px" }}>FX Terminal</div>
            <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "1.2px", color: "var(--color-faint)", textTransform: "uppercase" }}>
              Swing-Trading Suite
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", padding: "0 14px" }}>
        {NAV_GROUPS.map((group, gi) => (
          <div
            key={group.title}
            style={{
              borderTop: gi > 0 ? "1px solid var(--color-border)" : "none",
              padding: gi > 0 ? "16px 0 18px 0" : "0 0 18px 0",
            }}
          >
            <div style={{
              fontSize: "10px", fontWeight: 700, letterSpacing: "1.3px",
              color: "var(--color-faint)", padding: "0 10px 8px 10px",
              textTransform: "uppercase",
            }}>
              {group.title}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const locked = item.requiresAdmin && !isAdmin;

                if (locked) {
                  return (
                    <div
                      key={item.href}
                      title="Nur für Admins verfügbar"
                      style={{
                        padding: "8px 10px", borderRadius: "8px",
                        fontSize: "13.5px", fontWeight: 500,
                        color: "var(--color-faint)", cursor: "not-allowed",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        opacity: 0.5,
                      }}
                    >
                      <span>{item.label}</span>
                      <i className="ph-bold ph-lock-simple" style={{ fontSize: "11px" }} />
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      padding: active ? "8px 10px 8px 12px" : "8px 10px",
                      borderRadius: "8px",
                      fontSize: "13.5px",
                      fontWeight: active ? 600 : 500,
                      color: active ? "var(--color-text)" : "var(--color-muted)",
                      background: active ? "var(--color-surface2)" : "transparent",
                      borderLeft: active ? "2px solid var(--color-accent)" : "none",
                      marginLeft: active ? "-2px" : "0",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      textDecoration: "none",
                      transition: "background 120ms, color 120ms",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        (e.currentTarget as HTMLElement).style.background = "var(--color-surface2)";
                        (e.currentTarget as HTMLElement).style.color = "var(--color-text)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                        (e.currentTarget as HTMLElement).style.color = "var(--color-muted)";
                      }
                    }}
                  >
                    <span>{item.label}</span>
                    {item.href === "/scanner/signale" && <SignalsBadge />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User + Logout */}
      <div style={{
        borderTop: "1px solid var(--color-border)",
        padding: "12px 14px",
      }}>
        {/* User Info */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          {userAvatar ? (
            <img src={userAvatar} alt={userName} style={{ width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0 }} />
          ) : (
            <div style={{
              width: "30px", height: "30px", borderRadius: "50%",
              background: "linear-gradient(135deg,#3a3f4c,#22252c)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "12.5px", fontWeight: 700, color: "var(--color-text)",
              border: "1px solid var(--color-border2)", flexShrink: 0,
            }}>
              {initial}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {userName}
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {userEmail}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--color-up)", display: "inline-block" }} />
            <span style={{ fontSize: "10px", color: "var(--color-faint)", fontWeight: 600 }}>
              {isAdmin ? "Admin" : "Aktiv"}
            </span>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "7px 10px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 500,
            color: "var(--color-faint)",
            background: "transparent",
            border: "none",
            cursor: signingOut ? "not-allowed" : "pointer",
            transition: "background 120ms, color 120ms",
            textAlign: "left",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(239,100,97,0.08)";
            (e.currentTarget as HTMLElement).style.color = "var(--color-down)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--color-faint)";
          }}
        >
          <i className="ph-bold ph-sign-out" style={{ fontSize: "13px" }} />
          {signingOut ? "Abmelden…" : "Abmelden"}
        </button>
      </div>
    </aside>
  );
}
