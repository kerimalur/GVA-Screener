/**
 * Generischer Key/Value-Speicher je User (Tabelle user_preferences) —
 * Port von preferencesService.ts.
 */

import { createBrowserSupabase } from "@/lib/supabase/client";
import { getSessionUser } from "./supabase-crud";

export async function loadPref<T>(key: string, fallback: T): Promise<T> {
  const user = await getSessionUser();
  if (!user) return fallback;
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("user_preferences")
    .select("value")
    .eq("user_id", user.id)
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return fallback;
  return (data.value as T) ?? fallback;
}

export async function savePref(key: string, value: unknown): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const supabase = createBrowserSupabase();
  await supabase.from("user_preferences").upsert(
    { user_id: user.id, key, value, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" },
  );
}
