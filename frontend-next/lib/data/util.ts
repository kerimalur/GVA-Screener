import type { SupabaseClient } from "@supabase/supabase-js";

type Query = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

/**
 * Supabase/PostgREST cappt bei 1000 Zeilen pro Request — großes Select
 * seitenweise laden. `build` bekommt einen frischen Query-Builder je Seite.
 */
export async function pagedSelect<T>(
  db: SupabaseClient,
  table: string,
  select: string,
  build: (q: Query) => Query,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; ; page++) {
    const q = build(db.from(table).select(select)).range(
      page * pageSize,
      (page + 1) * pageSize - 1,
    );
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/** DB-Zugriff fehlertolerant (fehlende Env, leere DB) — null statt Crash. */
export async function tryQuery<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
