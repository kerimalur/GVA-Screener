import "server-only";
import { cookies } from "next/headers";
import { parseSettings, SETTINGS_COOKIE, type AppSettings } from "./appSettings";

/** App-Settings aus dem Request-Cookie (Fallback: Defaults). */
export async function getServerSettings(): Promise<AppSettings> {
  const store = await cookies();
  return parseSettings(store.get(SETTINGS_COOKIE)?.value ?? null);
}
