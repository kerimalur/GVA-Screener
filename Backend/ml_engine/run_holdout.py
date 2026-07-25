"""Holdout-Runner: wertet Configs auf den 104 zurückgehaltenen Wochen aus.

Der nächtliche Random-Search meldet ein Maximum über zehntausende Ziehungen.
Diese Zahl ist per Konstruktion zu optimistisch (Selection Bias) und stammt
ausserdem nur aus der Suchmetrik — die letzten HOLDOUT_WEEKS Wochen hat der
Runner nie gesehen. Hier werden sie einmal befragt.

  python -m ml_engine.run_holdout                    # stabile Config + Baselines
  python -m ml_engine.run_holdout --top-families 3   # zusätzlich Top-3-Familien
  python -m ml_engine.run_holdout --config '{"algo":"logreg","horizon":4,...}'
  python -m ml_engine.run_holdout --dry-run          # nur rechnen, nichts schreiben

EIN-SCHUSS-DISZIPLIN
--------------------
Ein Holdout verliert seinen Wert, sobald man ihn wiederholt befragt. Wer zwanzig
Configs nacheinander testet und die beste nimmt, hat den Selection Bias nur
verlagert. Ab dem zweiten Lauf warnt dieser Runner deshalb und verlangt eine
ausdrückliche Bestätigung (`--i-know-what-im-doing` oder interaktive Rückfrage).

Schreibt AUSSCHLIESSLICH nach `ml_holdout_results` (append-only) — nie nach
ml_experiments oder ml_engine_nights. Kein Holdout-Wert darf je in die Suche
oder in promote.py als Auswahlkriterium zurückfliessen.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd

from macro_features.panel import build_feature_panel

from . import db
from .holdout import add_baseline_comparison, evaluate_on_holdout
from .run_experiments import HOLDOUT_WEEKS, _jsonsafe
from .stability import config_id, family_key

BASELINE_HORIZONS = [1, 2, 4]


# --- Config-Quellen ---------------------------------------------------------

def _as_dict(v) -> dict:
    return v if isinstance(v, dict) else json.loads(v)


def stable_config() -> dict | None:
    """Stabile Config aus der jüngsten ml_engine_nights-Zeile."""
    rows = db.select_limited("ml_engine_nights", {
        "select": "night,stable_config", "order": "night.desc",
    }, limit=20)
    for r in rows:
        if r.get("stable_config"):
            return _as_dict(r["stable_config"])
    return None


def baseline_configs() -> list[dict]:
    """Die drei Baseline-Varianten — identisch zu _seed_baseline_experiments()."""
    return [
        {"algo": "baseline", "horizon": h, "features": ["scores"], "params": {}, "seed": 0}
        for h in BASELINE_HORIZONS
    ]


def top_family_configs(n: int, rows: list[dict]) -> list[dict]:
    """Beste Config je Modell-Familie, nach hall_score, maximal `n` Familien."""
    best: dict[tuple, tuple[float, dict]] = {}
    for r in rows:
        cfg = _as_dict(r["config"])
        if cfg.get("algo") == "baseline" or r.get("hall_score") is None:
            continue
        key = family_key(cfg)
        score = float(r["hall_score"])
        if key not in best or score > best[key][0]:
            best[key] = (score, cfg)
    ranked = sorted(best.values(), key=lambda t: t[0], reverse=True)
    return [cfg for _, cfg in ranked[:n]]


def search_hitrates(rows: list[dict]) -> dict[str, float]:
    """config_id → Ø-Trefferquote aus der Suche.

    Bewusst das MAXIMUM über alle Läufe derselben Config: genau dieser
    Maximalwert hat die Auswahl getrieben, und genau dessen Verzerrung soll
    `selection_gap` beziffern. Ein Mittelwert würde den Bias kleinrechnen.
    """
    out: dict[str, float] = {}
    for r in rows:
        cfg = _as_dict(r["config"])
        m = r.get("metrics")
        m = _as_dict(m) if m else {}
        hit = m.get("mean_hitrate")
        if hit is None:
            continue
        key = config_id(cfg)
        if key not in out or float(hit) > out[key]:
            out[key] = float(hit)
    return out


def _experiment_rows() -> list[dict]:
    """Spitze der hall_score-Rangliste + alle Baseline-Läufe.

    Die Spitze deckt stabile Config und Top-Familien ab; Baselines haben einen
    niedrigen hall_score und würden dort nie auftauchen — deshalb separat.
    """
    sel = "id,config,hall_score,metrics"
    top = db.select_limited("ml_experiments", {
        "select": sel, "status": "eq.done", "order": "hall_score.desc.nullslast",
    }, limit=1000)
    base = db.select_all("ml_experiments", {
        "select": sel, "status": "eq.done", "config->>algo": "eq.baseline",
    })
    return top + base


# --- Ein-Schuss-Disziplin ---------------------------------------------------

def previous_runs() -> tuple[int, int]:
    """(Anzahl bisheriger Läufe, Anzahl bisher getesteter Configs)."""
    rows = db.select_all("ml_holdout_results", {"select": "run_index"})
    if not rows:
        return 0, 0
    return len({r["run_index"] for r in rows}), len(rows)


def warning_text(n_runs: int, n_configs: int) -> str:
    return (
        f"WARNUNG: Der Holdout wurde bereits {n_runs}× befragt "
        f"({n_configs} Configs insgesamt). Jede weitere Auswertung senkt seine "
        f"Aussagekraft — wer genug Configs durchprobiert, findet auch hier "
        f"zufällig eine gute. Dieser Lauf ist Nr. {n_runs + 1}."
    )


def confirm_rerun(n_runs: int, n_configs: int, forced: bool) -> bool:
    """True = weitermachen. Ab dem zweiten Lauf braucht es eine Bestätigung."""
    if n_runs == 0:
        return True
    print("\n" + "=" * 72)
    print(warning_text(n_runs, n_configs))
    print("=" * 72 + "\n")
    if forced:
        print("--i-know-what-im-doing gesetzt → Lauf wird fortgesetzt.\n")
        return True
    if not sys.stdin.isatty():
        print("Nicht-interaktiv und ohne --i-know-what-im-doing → Abbruch.")
        return False
    return input("Trotzdem fortfahren? [ja/NEIN] ").strip().lower() in ("ja", "j", "yes", "y")


# --- Persistenz -------------------------------------------------------------

def _num(v):
    """float für die DB — NaN/None werden zu None (Postgres kennt kein NaN)."""
    if v is None:
        return None
    f = float(v)
    return None if np.isnan(f) else round(f, 6)


def to_row(res: dict, run_index: int, search_hit: float | None, notes: str) -> dict:
    cfg = res["config"]
    gap = None if search_hit is None or np.isnan(res["holdout_hitrate"]) \
        else float(search_hit) - float(res["holdout_hitrate"])
    return {
        "run_index": run_index,
        "config": _jsonsafe(cfg),
        "config_id": config_id(cfg),
        "family": " · ".join(str(p) for p in family_key(cfg)),
        "is_baseline": cfg.get("algo") == "baseline",
        "holdout_hitrate": _num(res["holdout_hitrate"]),
        "holdout_std": _num(res["holdout_std"]),
        "ci_low": _num(res["ci_low"]),
        "ci_high": _num(res["ci_high"]),
        "n_predictions": int(res["n_predictions"]),
        "search_hitrate": _num(search_hit),
        "selection_gap": _num(gap),
        "delta_vs_baseline": _num(res.get("delta_vs_baseline")),
        "delta_ci_low": _num(res.get("delta_ci_low")),
        "delta_ci_high": _num(res.get("delta_ci_high")),
        "holdout_start": res["holdout_start"],
        "holdout_end": res["holdout_end"],
        "git_sha": os.getenv("GITHUB_SHA", "local")[:12],
        "notes": notes,
    }


# --- Ausgabe ----------------------------------------------------------------

def _fmt(v, digits=3) -> str:
    return "–" if v is None or (isinstance(v, float) and np.isnan(v)) else f"{v:.{digits}f}"


def print_report(rows: list[dict]) -> None:
    print("\n" + "-" * 100)
    print(f"{'Config':<34} {'Holdout (95%-KI)':<26} {'n':>6} {'Suche':>7} "
          f"{'Gap':>7} {'Δ Baseline':>12}")
    print("-" * 100)
    for r in rows:
        ki = f"{_fmt(r['holdout_hitrate'])} [{_fmt(r['ci_low'])}–{_fmt(r['ci_high'])}]"
        delta = _fmt(r["delta_vs_baseline"])
        if r["delta_ci_low"] is not None:
            null_drin = r["delta_ci_low"] <= 0 <= r["delta_ci_high"]
            delta += " (n.s.)" if null_drin else " (sig.)"
        print(f"{r['family']:<34} {ki:<26} {r['n_predictions']:>6} "
              f"{_fmt(r['search_hitrate']):>7} {_fmt(r['selection_gap']):>7} {delta:>12}")
    print("-" * 100)
    print("«n.s.» = das Konfidenzintervall der Differenz schliesst die Null ein "
          "→ kein nachweisbarer Vorteil gegenüber der Baseline.\n")


# --- Hauptlauf --------------------------------------------------------------

def collect_configs(args, exp_rows: list[dict]) -> list[dict]:
    """Auszuwertende Configs, dedupliziert, Baselines zuerst."""
    configs = baseline_configs()
    stable = stable_config()
    if stable is not None:
        configs.append(stable)
    elif not args.config:
        print("WARNUNG: keine stabile Config in ml_engine_nights — nur Baselines.")
    if args.top_families:
        configs.extend(top_family_configs(args.top_families, exp_rows))
    for raw in args.config or []:
        configs.append(json.loads(raw))

    seen: set[str] = set()
    out: list[dict] = []
    for c in configs:
        key = config_id(c)
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Holdout-Validierung (einmalig!)")
    ap.add_argument("--config", action="append", metavar="JSON",
                    help="zusätzliche Config als JSON (mehrfach möglich)")
    ap.add_argument("--top-families", type=int, default=0, metavar="N",
                    help="zusätzlich die N besten Modellfamilien der Suche")
    ap.add_argument("--dry-run", action="store_true", help="nur rechnen, nichts schreiben")
    ap.add_argument("--i-know-what-im-doing", dest="forced", action="store_true",
                    help="Bestätigung ab dem zweiten Lauf überspringen")
    args = ap.parse_args()

    n_runs, n_configs = previous_runs()
    if not confirm_rerun(n_runs, n_configs, args.forced):
        raise SystemExit("Abgebrochen — Holdout unberührt.")
    run_index = n_runs + 1
    notes = "Erstlauf" if n_runs == 0 else warning_text(n_runs, n_configs)

    exp_rows = _experiment_rows()
    configs = collect_configs(args, exp_rows)
    lookup = search_hitrates(exp_rows)

    panel = build_feature_panel()
    cut = panel["week_start"].max() - pd.Timedelta(weeks=HOLDOUT_WEEKS)
    print(f"Panel: {len(panel)} Zeilen bis {panel['week_start'].max().date()}; "
          f"Holdout ab {cut.date()} ({HOLDOUT_WEEKS} Wochen), "
          f"{len(configs)} Config(s), Lauf #{run_index}")

    # Baselines zuerst auswerten — sie sind die Referenz für alle anderen.
    results: list[dict] = []
    baselines: dict[int, dict] = {}
    for cfg in configs:
        res = evaluate_on_holdout(panel, cfg, HOLDOUT_WEEKS)
        if cfg.get("algo") == "baseline":
            baselines[int(cfg["horizon"])] = res
        results.append(res)
        print(f"  {cfg['algo']} h={cfg['horizon']} {cfg['features']} → "
              f"hit {_fmt(res['holdout_hitrate'])} "
              f"[{_fmt(res['ci_low'])}–{_fmt(res['ci_high'])}] n={res['n_predictions']}")

    rows = []
    for res in results:
        cfg = res["config"]
        ref = baselines.get(int(cfg["horizon"]))
        full = add_baseline_comparison(res, None if cfg.get("algo") == "baseline" else ref)
        rows.append(to_row(full, run_index, lookup.get(config_id(cfg)), notes))

    print_report(rows)

    if args.dry_run:
        print("--dry-run → nichts geschrieben.")
        return
    db.insert("ml_holdout_results", rows)
    print(f"{len(rows)} Zeilen → ml_holdout_results (Lauf #{run_index}, append-only).")


if __name__ == "__main__":
    main()
