"""Stabiler «Bester der Nacht»: Seed-Mittelung + Hysterese (pure functions).

Spec: docs/superpowers/specs/2026-07-19-ml-engine-stabilisierung-design.md

WICHTIG: Das hier reduziert nur AUSWAHL-Rauschen (welcher Kandidat als «bester»
gefuehrt wird). Es verbessert das Signal nicht — ein stabiler 0.51 bleibt ein
Muenzwurf. Holdout-Disziplin ist nicht beruehrt: alles rechnet ausschliesslich
auf den Such-Metriken (hall_score) OHNE Holdout.

Begriffe:
  - Config-Identitaet (Seed-Mittelung): volle Config OHNE Seed/space —
    gleiche Config, mehrere Seeds -> ein Robust-Score (Mittel der hall_scores).
  - Modell-Familie (Hysterese):  (algo, horizon, sorted(features)) —
    Params zaehlen fuer die stabile Linie nicht.

Env-Parameter (Defaults in Klammern):
  ML_STABLE_NIGHTS (3)  — Naechte, die ein Herausforderer in Folge gewinnen muss
  ML_STABLE_MARGIN (0.005) — Mindest-Marge ueber der stabilen Familie je Nacht
"""
from __future__ import annotations

import json
import os

STABLE_NIGHTS_DEFAULT = 3
STABLE_MARGIN_DEFAULT = 0.005


def stable_nights() -> int:
    try:
        return max(1, int(os.getenv("ML_STABLE_NIGHTS", str(STABLE_NIGHTS_DEFAULT))))
    except ValueError:
        return STABLE_NIGHTS_DEFAULT


def stable_margin() -> float:
    try:
        return float(os.getenv("ML_STABLE_MARGIN", str(STABLE_MARGIN_DEFAULT)))
    except ValueError:
        return STABLE_MARGIN_DEFAULT


def family_key(config: dict | None) -> tuple | None:
    """Modell-Familie: (algo, horizon, features) — Params/Seed egal."""
    if not config:
        return None
    return (
        str(config.get("algo")),
        int(config.get("horizon", 0)),
        tuple(sorted(config.get("features") or [])),
    )


def config_id(config: dict) -> str:
    """Volle Config-Identitaet ohne Seed/space (fuer Seed-Mittelung)."""
    slim = {k: v for k, v in config.items() if k not in ("seed", "space")}
    return json.dumps(slim, sort_keys=True)


def robust_candidate(done_rows: list[dict]) -> tuple[dict | None, float | None]:
    """Kandidat der Nacht: beste Config nach Robust-Score (Mittel ueber Seeds).

    done_rows: [{"config": dict, "hall_score": float|None}, ...] — nur status=done.
    Bevorzugt Configs mit >= 2 Laeufen (Seed-wiederholt); gibt es keine,
    faellt es auf den rohen Nacht-Besten zurueck (nicht ideal, aber ehrlich).
    Baseline-Experimente zaehlen nicht als Kandidat.
    """
    groups: dict[str, dict] = {}
    for r in done_rows:
        cfg = r.get("config") or {}
        if cfg.get("algo") == "baseline" or r.get("hall_score") is None:
            continue
        g = groups.setdefault(config_id(cfg), {"config": cfg, "scores": []})
        g["scores"].append(float(r["hall_score"]))

    if not groups:
        return None, None

    def mean(xs: list[float]) -> float:
        return sum(xs) / len(xs)

    multi = [g for g in groups.values() if len(g["scores"]) >= 2]
    pool = multi if multi else list(groups.values())
    best = max(pool, key=lambda g: (mean(g["scores"]), len(g["scores"])))
    return best["config"], round(mean(best["scores"]), 6)


def best_of_family(done_rows: list[dict], key: tuple | None) -> tuple[dict | None, float | None]:
    """Bester Lauf (Config + hall_score) einer Familie in dieser Nacht."""
    if key is None:
        return None, None
    best_cfg, best_score = None, None
    for r in done_rows:
        cfg = r.get("config") or {}
        if r.get("hall_score") is None or family_key(cfg) != key:
            continue
        if best_score is None or float(r["hall_score"]) > best_score:
            best_cfg, best_score = cfg, float(r["hall_score"])
    return best_cfg, best_score


def decide_stable(
    prev_stable_config: dict | None,
    history: list[dict],
    candidate_config: dict | None,
    candidate_score: float | None,
    stable_score_tonight: float | None,
    nights: int | None = None,
    margin: float | None = None,
) -> tuple[dict | None, bool]:
    """Hysterese-Entscheid: (neue stabile Config, gewechselt?).

    history: juengste ml_engine_nights-Zeilen ABSTEIGEND (gestern zuerst,
    OHNE heute), jeweils mit best_config, best_hall, stable_score.
    Wechsel-Bedingung (alle N Naechte inkl. heute):
      Nacht-Bester = dieselbe Herausforderer-Familie UND
      best_hall >= stable_score jener Nacht + margin.
    Alte Zeilen ohne stable_score erfuellen die Bedingung nicht.
    """
    nights = stable_nights() if nights is None else max(1, nights)
    margin = stable_margin() if margin is None else margin

    if candidate_config is None:
        return prev_stable_config, False
    if prev_stable_config is None:
        return candidate_config, True  # Initialisierung

    cand_key = family_key(candidate_config)
    if cand_key == family_key(prev_stable_config):
        return prev_stable_config, False

    # Heute muss der Herausforderer die Marge schlagen …
    if candidate_score is None or stable_score_tonight is None:
        return prev_stable_config, False
    if candidate_score < stable_score_tonight + margin:
        return prev_stable_config, False

    # … und in den (nights − 1) Naechten davor ebenfalls.
    needed_prior = nights - 1
    for row in history[:needed_prior]:
        row_best = row.get("best_config")
        row_hall = row.get("best_hall")
        row_stable = row.get("stable_score")
        if (
            family_key(row_best) != cand_key
            or row_hall is None
            or row_stable is None
            or float(row_hall) < float(row_stable) + margin
        ):
            return prev_stable_config, False
    if len(history) < needed_prior:
        return prev_stable_config, False

    return candidate_config, True
