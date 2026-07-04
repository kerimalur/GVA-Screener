/**
 * Client-Seite der App-Settings: Cookie ist die schnelle Quelle (steht dem
 * Server beim Rendern zur Verfügung), user_preferences die dauerhafte.
 */

import { loadPref, savePref } from "@/lib/journal/prefs";
import {
  DEFAULT_SETTINGS,
  SETTINGS_COOKIE,
  SETTINGS_PREF_KEY,
  parseSettings,
  type AppSettings,
} from "./appSettings";

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${SETTINGS_COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(SETTINGS_COOKIE.length + 1)) : null;
}

function writeCookie(settings: AppSettings): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify(settings));
  document.cookie = `${SETTINGS_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/** Synchron aus dem Cookie (SSR-sicher: Defaults ohne document). */
export function loadAppSettings(): AppSettings {
  return parseSettings(readCookie());
}

/** Backend-Stand holen (gewinnt) und Cookie auffrischen. */
export async function hydrateAppSettings(): Promise<AppSettings> {
  const fromPref = await loadPref<unknown>(SETTINGS_PREF_KEY, null);
  const settings = fromPref ? parseSettings(fromPref) : loadAppSettings();
  writeCookie(settings);
  return settings;
}

/** Cookie + user_preferences aktualisieren. */
export async function saveAppSettings(settings: AppSettings): Promise<void> {
  writeCookie(settings);
  await savePref(SETTINGS_PREF_KEY, settings).catch(() => {});
}

export { DEFAULT_SETTINGS };
export type { AppSettings };
