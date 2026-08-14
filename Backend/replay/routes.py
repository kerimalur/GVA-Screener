"""FastAPI-Routen fuer die Fundamental-Endpunkte. Registrierung in main.py:

    from replay.routes import replay_router
    app.include_router(replay_router, prefix="/replay")

HISTORIE: Dieses Modul hiess "Replay" und enthielt zusaetzlich die manuelle
Backtest-Bewertung historischer GVA-Hits (Sessions, /hits, /lines, /blocks,
/evaluate, /trades, /stats). Diese Endpunkte wurden am 13.08.2026 entfernt —
der Backtest laeuft vollstaendig in KerimOS unter /trading/backtest, siehe
../TRADING-UMBAU.md, Etappe 0.

Der Ordner- und Prefix-Name `replay` bleibt bewusst stehen: `gva_history.py`
ist die einzige Hit-Erkennung des Projekts (genutzt von `late_hits.py`) und
`fundamentals.py` liefert das Q-Score-Panel. Ein Umbenennen haette nur Risiko
ohne Gegenwert.

Uebrig bleiben genau zwei Endpunkte, beide fuer das Labor:
    GET /replay/fundamental-track  -> Q-Score-Timeline + Forward-Treffer
    GET /replay/rankings           -> Wochen-Rankings eines Pairs (as-of)

Die Tabellen `backtest_replay` und `replay_sessions` werden von hier aus nicht
mehr beschrieben oder gelesen. Sie koennen nach einer Sicherung in Supabase
geloescht werden.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from .fundamentals import fundamental_track, ranking_series
from .gva_history import normalize_pair

replay_router = APIRouter()


@replay_router.get("/fundamental-track")
def get_fundamental_track(
    pair: str = Query(...),
    weeks: int = Query(default=52, ge=4, le=520),
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
):
    """Pair-Fundamental-Timeline: Wochen-Q-Scores + 1W/4W Forward-Treffer.
    Entweder letzte `weeks` Wochen ODER explizites from/to-Fenster (ISO)."""
    return fundamental_track(pair, weeks, date_from, date_to)


@replay_router.get("/rankings")
def get_rankings(
    pair: str = Query(...),
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
):
    """Wochen-Rankings (as-of Baseline + Q-Stufen) eines Pairs im Zeitraum."""
    instrument = normalize_pair(pair)
    rankings = ranking_series(instrument, date_from, date_to)
    return {"pair": instrument, "from": date_from, "to": date_to,
            "count": len(rankings), "rankings": rankings}
