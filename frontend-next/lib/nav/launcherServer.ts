import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { tryQuery } from "@/lib/data/util";

export interface EngineNachtBadge {
  /** 'YYYY-MM-DD' (UTC) der zuletzt ausgewerteten Nacht, null = keine. */
  night: string | null;
  /** höchstens zwei Tage alt — dann gilt die Auswertung als frisch. */
  istNeu: boolean;
}

const FRISCH_MS = 2 * 86_400_000;

/**
 * Zuletzt ausgewertete Nacht der ML-Engine — Badge der Launcher-Kachel „Labor".
 *
 * Bewusst serverseitig: `ml_engine_nights` liegt hinter dem Service-Client,
 * der Browser kommt nicht dran. Fehlt die Tabelle oder scheitert die Abfrage,
 * kommt `night: null` zurück und die Kachel rendert ohne Badge — nie gar nicht.
 *
 * Das Alter wird hier bestimmt und nicht in der Komponente: `Date.now()` im
 * Render ist unrein und würde das Badge unvorhersehbar machen.
 */
export async function loadLetzteEngineNacht(
  nowMs: number = Date.now(),
): Promise<EngineNachtBadge> {
  const night = await tryQuery(async () => {
    const db = createServiceClient();
    const { data } = await db
      .from("ml_engine_nights")
      .select("night")
      .order("night", { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as { night?: string } | undefined;
    return row?.night ?? null;
  });

  if (!night) return { night: null, istNeu: false };
  return { night, istNeu: nowMs - Date.parse(`${night}T00:00:00Z`) <= FRISCH_MS };
}
