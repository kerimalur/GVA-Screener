/**
 * Trade-Screenshots in Supabase (Tabelle trade_screenshots, Base64).
 * Ersetzt den localStorage-Ansatz des alten Journals — Screenshots
 * überleben damit Browser- und Gerätewechsel.
 */

import { createBrowserSupabase } from "@/lib/supabase/client";
import { requireSession } from "./supabase-crud";

export async function loadScreenshot(tradeId: string): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();

  const { data, error } = await supabase
    .from("trade_screenshots")
    .select("screenshot_data")
    .eq("user_id", user.id)
    .eq("trade_id", tradeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.screenshot_data ?? null;
}

export async function saveScreenshot(tradeId: string, dataUrl: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();

  const mime = dataUrl.match(/^data:([^;]+);/)?.[1] ?? "image/png";
  const sizeKb = Math.round((dataUrl.length * 3) / 4 / 1024);

  // Ein Screenshot pro Trade: alten ersetzen
  await supabase
    .from("trade_screenshots")
    .delete()
    .eq("user_id", user.id)
    .eq("trade_id", tradeId);

  const { error } = await supabase.from("trade_screenshots").insert([
    {
      user_id: user.id,
      trade_id: tradeId,
      label: "entry",
      screenshot_data: dataUrl,
      mime_type: mime,
      file_size_kb: sizeKb,
    },
  ]);
  if (error) throw error;
}

export async function deleteScreenshot(tradeId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();
  await supabase
    .from("trade_screenshots")
    .delete()
    .eq("user_id", user.id)
    .eq("trade_id", tradeId);
}
