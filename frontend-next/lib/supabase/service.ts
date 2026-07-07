import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-Role-Client — umgeht RLS.
 * Nur für Server-seitige Operationen (Webhook, Cron).
 * NIEMALS im Browser verwenden.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
