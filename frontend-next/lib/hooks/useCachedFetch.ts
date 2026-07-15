"use client";

import { useEffect, useState } from "react";

/**
 * Stale-first-Fetch: zuletzt geladene Antwort aus localStorage sofort
 * anzeigen, frische Daten im Hintergrund holen und ersetzen. Für Seiten,
 * deren Backend-Rechnung dauert (COT Intelligence, Fundamental-Track) —
 * die Seite fühlt sich sofort an, auch wenn der Refresh Sekunden braucht.
 *
 * Quota-sicher: schlägt localStorage.setItem fehl (zu grosse Antwort),
 * läuft alles einfach ohne Cache weiter.
 */

const PREFIX = "gva-cache:";

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as { d: T }).d : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ d: data, t: Date.now() }));
  } catch {
    // Quota voll oder Storage gesperrt → ohne Cache weiterlaufen
  }
}

export interface CachedFetch<T> {
  data: T | null;
  /** true sobald die Antwort vom Server (nicht aus dem Cache) kommt */
  fresh: boolean;
  /** nur gesetzt, wenn auch kein Cache da ist — sonst bleibt Stale sichtbar */
  error: string | null;
  loading: boolean;
}

export function useCachedFetch<T>(key: string, url: string | null): CachedFetch<T> {
  const [data, setData] = useState<T | null>(null);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    setFresh(false);
    setError(null);
    const cached = readCache<T>(key);
    setData(cached);

    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (d && typeof d === "object" && "error" in d && d.error) {
          throw new Error(String(d.error));
        }
        if (!alive) return;
        setData(d as T);
        setFresh(true);
        writeCache(key, d);
      })
      .catch((e) => {
        if (alive && cached === null) {
          setError(e instanceof Error ? e.message : "Fehler");
        }
      });

    return () => {
      alive = false;
    };
  }, [key, url]);

  return { data, fresh, error, loading: data === null && error === null };
}
