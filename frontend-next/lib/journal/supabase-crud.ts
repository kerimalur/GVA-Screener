/**
 * Generische Supabase-CRUD-Helfer für Journal-Tabellen —
 * Port von shared/services/supabaseService.ts (camelCase ↔ snake_case).
 */

import { createBrowserSupabase } from "@/lib/supabase/client";

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function objectToSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toSnakeCase(key)] =
      value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)
        ? objectToSnake(value as Record<string, unknown>)
        : value;
  }
  return result;
}

export function objectToCamel(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toCamelCase(key)] =
      value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)
        ? objectToCamel(value as Record<string, unknown>)
        : value;
  }
  return result;
}

export async function getSessionUser() {
  const supabase = createBrowserSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}

export async function requireSession() {
  const user = await getSessionUser();
  if (!user) throw new Error("Nicht eingeloggt");
  return user;
}

interface FetchOptions {
  table: string;
  orderBy?: string;
  ascending?: boolean;
  filters?: Record<string, unknown>;
}

export async function fetchAll<T>(options: FetchOptions): Promise<T[]> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();

  let query = supabase.from(options.table).select("*").eq("user_id", user.id);
  if (options.filters) {
    for (const [key, value] of Object.entries(options.filters)) {
      query = query.eq(key, value);
    }
  }
  if (options.orderBy) {
    query = query.order(options.orderBy, { ascending: options.ascending ?? false });
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => objectToCamel(row) as T);
}

export async function insertOne<T extends object>(
  table: string,
  data: T,
) {
  const supabase = createBrowserSupabase();
  const user = await requireSession();

  const payload = objectToSnake(data as Record<string, unknown>);
  payload.user_id = user.id;
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }

  const { data: result, error } = await supabase
    .from(table)
    .insert([payload])
    .select()
    .single();
  if (error) throw error;
  return result ? objectToCamel(result) : null;
}

export async function updateOne<T extends object>(
  table: string,
  id: string,
  data: T,
) {
  const supabase = createBrowserSupabase();
  const user = await requireSession();

  const payload = objectToSnake(data as Record<string, unknown>);
  delete payload.id;
  delete payload.user_id;
  delete payload.created_at;
  payload.updated_at = new Date().toISOString();

  const { data: result, error } = await supabase
    .from(table)
    .update(payload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) throw error;
  return result ? objectToCamel(result) : null;
}

export async function deleteOne(table: string, id: string): Promise<boolean> {
  const supabase = createBrowserSupabase();
  const user = await requireSession();

  const { error } = await supabase.from(table).delete().eq("id", id).eq("user_id", user.id);
  if (error) throw error;
  return true;
}

export async function upsertOne<T extends object>(
  table: string,
  data: T,
  uniqueColumns: string[] = ["id"],
) {
  const supabase = createBrowserSupabase();
  const user = await requireSession();

  const payload = objectToSnake(data as Record<string, unknown>);
  payload.user_id = user.id;
  payload.updated_at = new Date().toISOString();

  const { data: result, error } = await supabase
    .from(table)
    .upsert([payload], { onConflict: uniqueColumns.map(toSnakeCase).join(",") })
    .select()
    .single();
  if (error) throw error;
  return result ? objectToCamel(result) : null;
}
